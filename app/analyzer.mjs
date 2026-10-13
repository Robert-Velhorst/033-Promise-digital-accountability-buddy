const labels = ['', 'Micro', 'Minor', 'Standard', 'Major', 'Macro'];
const strong = /\b(?:i(?:['’]ll| will| promise| commit| guarantee| am going to)|we(?:['’]ll| will| promise| commit)|(?:ik|wij|we) (?:zal|zullen|beloof|beloven|ga|gaan|probeer|proberen|kijk|kijken|zoek|zoeken|stuur|sturen|laat|laten|bel|bellen|regel|regelen|zorg|zorgen))\b/iu;
const uncertain = /\b(?:i (?:might|could|should be able)|maybe i can|perhaps|misschien|wellicht|zou kunnen)\b/iu;
const negative = /\b(?:won['’]t|will not|cannot|can['’]t|not going to|zal (?:het |dat )?niet|ga (?:het |dat )?niet|kan (?:het |dat )?niet|beloof niet)\b/iu;
const effort = /\b(?:try|attempt|look into|look at|investigate|prober\w*|probeer|poging|kijk\w*|uitzoek\w*|onderzoek\w*|best doen)\b/iu;
const feedback = /\b(?:reply|respond|let .{0,15} know|update you|antwoord\w*|terugkoppel\w*|laat .{0,20} weten|laten .{0,20} weten|bel\w*)\b/iu;
const timePattern = /\b(?:today|tomorrow|tonight|next week|this week|this weekend|(?:by |next |on )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|vandaag|morgen|vanavond|volgende week|dit weekend|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|\d{4}-\d{2}-\d{2})\b/iu;
export function analyzeText(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 20000) throw new Error('Enter a transcript of 1-20,000 characters.');
  const start = performance.now(), commitments = []; let speaker = '';
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const label = line.match(/^([\p{L}][\p{L} .@+'’-]{0,100}):\s*/u); if (label) speaker = label[1];
    const content = label ? line.slice(label[0].length) : line;
    for (const sentence of content.split(/(?<=[.!?])\s+/u).map(s => s.trim()).filter(Boolean)) {
      if (sentence.startsWith('>') || /\?$/.test(sentence) || negative.test(sentence) || (!strong.test(sentence) && !uncertain.test(sentence))) continue;
      const reportedSpeech = /\b(?:said|says|told|zei|zegde)\b/iu.test(sentence) || /^["“]/u.test(sentence);
      const possibility = uncertain.test(sentence), conditional = /\b(?:if|unless|als|mits|zodra|wanneer)\b/iu.test(sentence);
      const kind = possibility ? 'possibility' : effort.test(sentence) ? 'effort' : feedback.test(sentence) ? 'feedback' : 'result';
      const spectrumLevel = /\b(?:contract|loan|lening|verhuizen|invest)\b/iu.test(sentence) ? 4 : /\b(?:rapport|report|project|deliver)\b/iu.test(sentence) ? 3 : feedback.test(sentence) ? 1 : 2;
      commitments.push({ text: label ? `${speaker}: ${sentence}` : sentence, summary: sentence, speaker, reportedSpeech, kind, conditional, condition: conditional ? sentence : '', spectrumLevel, spectrumLabel: labels[spectrumLevel], committalType: possibility ? 'non_committal' : 'committal', suggestedDeadline: sentence.match(timePattern)?.[0] || '', nudge: possibility ? 'There is a possibility, not yet a clear commitment. Ask what is realistic.' : conditional ? 'Keep the condition attached to the original commitment.' : kind === 'effort' ? 'Track the promised attempt separately from whether it succeeds.' : '' });
    }
  }
  return { commitments, summary: `${commitments.length} potential commitments found. Effort, result and feedback are separate.`, method: 'Local Dutch/English rules; source-grounded suggestions, not semantic AI or independently verified agreement.', processingTime: Math.round(performance.now() - start) };
}
