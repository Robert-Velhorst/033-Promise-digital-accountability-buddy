let recognition; let active = false;
export function stopCapture() { active = false; if (recognition) recognition.abort(); recognition = null; }
export async function startCapture(language, onText, onStatus) {
  const Engine = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Engine || !('processLocally' in Engine.prototype) || typeof Engine.available !== 'function') throw new Error('This browser does not support private on-device speech recognition. Paste or type the transcript instead.');
  const availability = await Engine.available({ langs: [language], processLocally: true });
  if (availability !== 'available') throw new Error(availability === 'downloadable' || availability === 'downloading' ? 'The local language pack is missing. Use “Install speech language” first.' : 'Local recognition is unavailable for this language. Paste a transcript instead.');
  recognition = new Engine(); recognition.processLocally = true; recognition.lang = language; recognition.continuous = true; recognition.interimResults = true; active = true;
  recognition.onresult = event => { let final = '', interim = ''; for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) final += event.results[i][0].transcript + ' '; else interim += event.results[i][0].transcript; } onText(final, interim); };
  recognition.onerror = event => { active = false; onStatus(`Listening stopped: ${event.error}. You can continue by typing.`, false); };
  recognition.onend = () => { if (active && recognition) { try { recognition.start(); } catch { active = false; onStatus('Listening stopped. Start again when ready.', false); } } else onStatus('Microphone stopped.', false); };
  recognition.start(); onStatus('Listening on this device. Only reviewed promises are saved.', true);
}
export async function installSpeech(language) { const Engine = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Engine?.install) throw new Error('Local speech language installation is not supported by this browser.'); const success = await Engine.install({ langs: [language], processLocally: true }); if (!success) throw new Error('The language pack could not be installed.'); }
