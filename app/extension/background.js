const server='http://localhost:4310';
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(!sender.url || !/^https:\/\/(?:mail\.google\.com|outlook\.(?:live|office|office365)\.com)\//.test(sender.url))return;
  if(message.type!=='promise-import')return;
  (async()=>{try{const {token}=await chrome.storage.local.get('token');if(!token)throw new Error('Koppel eerst de extensie met de code uit Promise.');const res=await fetch(server+'/bridge/ingest',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(message.input),credentials:'omit'});const data=await res.json();if(!res.ok)throw new Error(data.error);reply({ok:true,...data});}catch(e){reply({ok:false,error:e.message});}})();return true;
});
