import { createHash } from 'node:crypto';
import { AppError } from './store.mjs';
export const digest = s => createHash('sha256').update(s).digest('hex');
export function zonedTime(year, month, day, hour, minute, timezone = 'Europe/Amsterdam') {
  const utc = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(utc); if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) throw new AppError('Invalid source date.');
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let candidate = utc;
  for (let i = 0; i < 3; i++) { const p = Object.fromEntries(format.formatToParts(candidate).map(x => [x.type, x.value])); const observed = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); candidate += utc - observed; }
  const parts = Object.fromEntries(format.formatToParts(candidate).map(x => [x.type, x.value]));
  if (+parts.year !== year || +parts.month !== month || +parts.day !== day || +parts.hour !== hour || +parts.minute !== minute) throw new AppError('This local time does not exist due to daylight saving.');
  return candidate;
}
export function deadlineFor(term, at, timezone) {
  if (!term || !at) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(at).map(x => [x.type, x.value]));
  let day = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day));
  if (/^\d{4}-\d{2}-\d{2}$/.test(term)) { const [y,m,d] = term.split('-').map(Number); return zonedTime(y,m,d,17,0,timezone); }
  if (/morgen|tomorrow/iu.test(term)) day.setUTCDate(day.getUTCDate()+1);
  else if (/today|vandaag|tonight|vanavond/iu.test(term)) { /* same source day */ }
  else { const names = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'], nl = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag']; const target = names.findIndex((n,i) => term.toLowerCase().includes(n) || term.toLowerCase().includes(nl[i])); if (target < 0) return null; let offset=(target-day.getUTCDay()+7)%7; if (/next|volgende/iu.test(term)) offset=offset || 7; day.setUTCDate(day.getUTCDate()+offset); }
  return zonedTime(day.getUTCFullYear(),day.getUTCMonth()+1,day.getUTCDate(),/tonight|vanavond/iu.test(term)?21:17,0,timezone);
}
const address = s => (s.match(/<([^>]+)>/)?.[1] || s).trim().toLowerCase();
function decodeBody(s, encoding = '') {
  if (/base64/i.test(encoding)) return Buffer.from(s.replace(/\s/g,''),'base64').toString('utf8');
  if (/quoted-printable/i.test(encoding)) return Buffer.from(s.replace(/=\r?\n/g,'').replace(/=([A-F0-9]{2})/gi,(_,v)=>String.fromCharCode(parseInt(v,16))),'latin1').toString('utf8');
  return s;
}
export function emailPayload(raw) {
  const split=raw.search(/\r?\n\r?\n/); if(split<0) throw new AppError('This is not a complete .eml message.');
  const head=raw.slice(0,split).replace(/\r?\n[ \t]+/g,' '), headers={};
  for(const l of head.split(/\r?\n/)){const i=l.indexOf(':');if(i>0)headers[l.slice(0,i).toLowerCase()]=l.slice(i+1).trim();}
  const body=raw.slice(split).trimStart(), boundary=headers['content-type']?.match(/boundary="?([^";\s]+)/i)?.[1];
  if(boundary){const texts=body.split('--'+boundary).slice(1,-1).flatMap(part=>{try {return [emailPayload(part.trimStart())];}catch{return [];}}); const plain=texts.find(x=>x.contentType?.startsWith('text/plain')); return {...headers,text:plain?.text || texts.find(x=>x.text)?.text || '',contentType:headers['content-type']};}
  if(/attachment/i.test(headers['content-disposition']||'')) return {text:'',contentType:headers['content-type']};
  let text=decodeBody(body,headers['content-transfer-encoding']); if(/text\/html/i.test(headers['content-type']||'')) text=text.replace(/<(script|style)[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?\s*>|<\/p>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  return {...headers,text,contentType:headers['content-type']};
}
export function parseImport(input) {
  if(typeof input.text !== 'string' || !input.text.trim() || input.text.length>4000000) throw new AppError('Import text between 1 character and 4 MB.');
  const format=input.format||'whatsapp', timezone=input.timezone||'Europe/Amsterdam'; try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw new AppError('Invalid source time zone.');}
  const channel=input.channel||format, account=String(input.account||'local-import').slice(0,160), conversation=String(input.conversation||'').trim().slice(0,200); if(!conversation) throw new AppError('Give this conversation a stable name or identifier.');
  let messages=[];
  if(format==='json') {let data;try{data=JSON.parse(input.text);}catch{throw new AppError('Invalid message JSON.');}messages=Array.isArray(data)?data:data.messages;if(!Array.isArray(messages))throw new AppError('JSON must contain a messages array.');}
  else if(format==='eml'){const e=emailPayload(input.text);const at=Date.parse(e.date);messages=[{id:e['message-id'],sender:address(e.from||''),senderName:e.from,text:e.text,at:Number.isFinite(at)?at:null,subject:e.subject}];}
  else if(format==='whatsapp') {
    const pattern=/^\[?(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?\]?\s*(?:-\s*)?([^:]+):\s?(.*)$/iu;
    for(const original of input.text.replace(/\r/g,'').split('\n')) {const line=original.replace(/[\u200e\u200f\u202a-\u202e]/g,'');const m=line.match(pattern);if(m){let a=+m[1],b=+m[2],c=+m[3],year,month,day;if(m[1].length===4){year=a;month=b;day=c;}else{year=c<100?2000+c:c;month=input.dateOrder==='mdy'?a:b;day=input.dateOrder==='mdy'?b:a;}let hour=+m[4];if(m[6])hour=hour%12+(m[6].toUpperCase()==='PM'?12:0);messages.push({sender:m[7].trim(),text:m[8],at:zonedTime(year,month,day,hour,+m[5],timezone)});}else if(messages.length && !/^\[?\d.*(?:end-to-end|versleuteld)/i.test(line))messages.at(-1).text+='\n'+line;}
    if(!messages.length)throw new AppError('No dated WhatsApp messages found. Choose transcript for undated text.');
  } else if(format==='transcript'){for(const line of input.text.split(/\r?\n/)){const m=line.match(/^([^:]{1,100}):\s*(.+)$/);if(m)messages.push({sender:m[1].trim(),text:m[2],at:null});else if(messages.length)messages.at(-1).text+='\n'+line;}}
  else throw new AppError('Unsupported import format.');
  if(messages.length>10000)throw new AppError('Import at most 10,000 messages per file.');
  const occurrences=new Map();
  return messages.map(m=>{
    const sender=String(m.sender||'').trim().slice(0,250),text=String(m.text||'').trim();if(!sender || !text || text.length>20000)throw new AppError('Each message needs a sender and 1-20,000 characters.');
    let at=m.at==null?null:typeof m.at==='number'?m.at:Date.parse(m.at);if(at!=null&&(!Number.isSafeInteger(at)||at<0||at>Date.now()+86400000))throw new AppError('Invalid source timestamp.');
    const key=digest(JSON.stringify([sender,at,text])),occurrence=occurrences.get(key)||0;occurrences.set(key,occurrence+1);
    return {channel,account,conversation,sender,senderName:String(m.senderName||sender).slice(0,250),text,at,subject:String(m.subject||'').slice(0,500),providerId:String(m.id||`${key}:${occurrence}`).slice(0,300),sourceUrl:channel==='gmail'&&m.id?`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(m.id)}`:'',observedAt:Date.now(),timezone};
  });
}
