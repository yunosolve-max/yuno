// YUNO dish helper: customers ask about a dish by voice or by tapping a question,
// in English or Malayalam. It runs on the customer's phone, costs nothing, and answers ONLY
// from what the cafe wrote about the dish. If something isn't written down, it says to ask
// the staff. It never guesses, because a wrong answer about allergies could hurt someone.
import { ALLERGENS, rupee } from './common.js';

// Malayalam phrases (please have a native speaker check these before launch).
const ML = {
  notWritten: '\u0D08 \u0D35\u0D3F\u0D35\u0D30\u0D02 \u0D15\u0D2B\u0D47 \u0D1A\u0D47\u0D7C\u0D24\u0D4D\u0D24\u0D3F\u0D1F\u0D4D\u0D1F\u0D3F\u0D32\u0D4D\u0D32. \u0D26\u0D2F\u0D35\u0D3E\u0D2F\u0D3F \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D3E\u0D2B\u0D3F\u0D28\u0D4B\u0D1F\u0D4D \u0D1A\u0D4B\u0D26\u0D3F\u0D15\u0D4D\u0D15\u0D42.',
  onlyEnglish: '\u0D07\u0D24\u0D3F\u0D28\u0D4D\u0D31\u0D46 \u0D35\u0D3F\u0D35\u0D30\u0D02 \u0D07\u0D02\u0D17\u0D4D\u0D32\u0D40\u0D37\u0D3F\u0D7D \u0D2E\u0D3E\u0D24\u0D4D\u0D30\u0D2E\u0D47 \u0D09\u0D33\u0D4D\u0D33\u0D42: ',
  veg: '\u0D07\u0D24\u0D4D \u0D35\u0D46\u0D1C\u0D3F\u0D31\u0D4D\u0D31\u0D47\u0D31\u0D3F\u0D2F\u0D7B \u0D35\u0D3F\u0D2D\u0D35\u0D2E\u0D3E\u0D23\u0D4D.',
  nonveg: '\u0D07\u0D24\u0D4D \u0D28\u0D4B\u0D7A-\u0D35\u0D46\u0D1C\u0D3F\u0D31\u0D4D\u0D31\u0D47\u0D31\u0D3F\u0D2F\u0D7B \u0D35\u0D3F\u0D2D\u0D35\u0D2E\u0D3E\u0D23\u0D4D.',
  spice: ['\u0D0E\u0D30\u0D3F\u0D35\u0D4D \u0D07\u0D32\u0D4D\u0D32.', '\u0D1A\u0D46\u0D31\u0D3F\u0D2F \u0D0E\u0D30\u0D3F\u0D35\u0D4D \u0D09\u0D23\u0D4D\u0D1F\u0D4D.', '\u0D07\u0D1F\u0D24\u0D4D\u0D24\u0D30\u0D02 \u0D0E\u0D30\u0D3F\u0D35\u0D4D \u0D09\u0D23\u0D4D\u0D1F\u0D4D.', '\u0D28\u0D32\u0D4D\u0D32 \u0D0E\u0D30\u0D3F\u0D35\u0D4D \u0D09\u0D23\u0D4D\u0D1F\u0D4D.'],
  contains: '\u0D07\u0D24\u0D3F\u0D7D \u0D07\u0D35 \u0D05\u0D1F\u0D19\u0D4D\u0D19\u0D3F\u0D2F\u0D3F\u0D30\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D41: ',
  checkStaff: '\u0D05\u0D32\u0D7C\u0D1C\u0D3F \u0D09\u0D23\u0D4D\u0D1F\u0D46\u0D19\u0D4D\u0D15\u0D3F\u0D7D \u0D26\u0D2F\u0D35\u0D3E\u0D2F\u0D3F \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D3E\u0D2B\u0D3F\u0D28\u0D4B\u0D1F\u0D4D \u0D09\u0D31\u0D2A\u0D4D\u0D2A\u0D3E\u0D15\u0D4D\u0D15\u0D42.',
  noneMarked: '\u0D38\u0D3E\u0D27\u0D3E\u0D30\u0D23 \u0D05\u0D32\u0D7C\u0D1C\u0D3F \u0D09\u0D23\u0D4D\u0D1F\u0D3E\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D35 \u0D12\u0D28\u0D4D\u0D28\u0D41\u0D02 \u0D07\u0D24\u0D3F\u0D7D \u0D30\u0D47\u0D16\u0D2A\u0D4D\u0D2A\u0D46\u0D1F\u0D41\u0D24\u0D4D\u0D24\u0D3F\u0D2F\u0D3F\u0D1F\u0D4D\u0D1F\u0D3F\u0D32\u0D4D\u0D32.',
  yesContains: '\u0D09\u0D23\u0D4D\u0D1F\u0D4D, \u0D07\u0D24\u0D3F\u0D7D \u0D07\u0D24\u0D4D \u0D05\u0D1F\u0D19\u0D4D\u0D19\u0D3F\u0D2F\u0D3F\u0D1F\u0D4D\u0D1F\u0D41\u0D23\u0D4D\u0D1F\u0D4D: ',
  notMarked: '\u0D07\u0D24\u0D4D \u0D08 \u0D35\u0D3F\u0D2D\u0D35\u0D24\u0D4D\u0D24\u0D3F\u0D7D \u0D30\u0D47\u0D16\u0D2A\u0D4D\u0D2A\u0D46\u0D1F\u0D41\u0D24\u0D4D\u0D24\u0D3F\u0D2F\u0D3F\u0D1F\u0D4D\u0D1F\u0D3F\u0D32\u0D4D\u0D32: ',
  price: (p) => '\u0D35\u0D3F\u0D32 ' + p + ' \u0D06\u0D23\u0D4D.',
  dontKnow: '\u0D15\u0D4D\u0D37\u0D2E\u0D3F\u0D15\u0D4D\u0D15\u0D23\u0D02, \u0D05\u0D24\u0D4D \u0D0E\u0D28\u0D3F\u0D15\u0D4D\u0D15\u0D4D \u0D2E\u0D28\u0D38\u0D4D\u0D38\u0D3F\u0D32\u0D3E\u0D2F\u0D3F\u0D32\u0D4D\u0D32. \u0D24\u0D3E\u0D34\u0D46\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D19\u0D4D\u0D19\u0D33\u0D3F\u0D7D \u0D12\u0D28\u0D4D\u0D28\u0D4D \u0D24\u0D3F\u0D30\u0D1E\u0D4D\u0D1E\u0D46\u0D1F\u0D41\u0D15\u0D4D\u0D15\u0D42.'
};
const EN = {
  notWritten: 'The cafe hasn\u2019t added that for this dish. Please ask the staff.',
  spice: ['It\u2019s not spicy.', 'It\u2019s mildly spicy.', 'It\u2019s medium spicy.', 'It\u2019s quite spicy.'],
  checkStaff: 'If you have an allergy, please also check with the staff.',
  dontKnow: 'Sorry, I didn\u2019t catch that. Try one of the questions below.'
};

// The questions shown as buttons.
export const QUESTIONS = {
  en: [['made', 'How is it made?'], ['taste', 'How does it taste?'], ['spice', 'Is it spicy?'], ['allergens', 'Any allergens?'], ['veg', 'Is it veg?'], ['price', 'How much?']],
  ml: [['made', '\u0D0E\u0D19\u0D4D\u0D19\u0D28\u0D46 \u0D09\u0D23\u0D4D\u0D1F\u0D3E\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D41?'], ['taste', '\u0D30\u0D41\u0D1A\u0D3F \u0D0E\u0D19\u0D4D\u0D19\u0D28\u0D46?'], ['spice', '\u0D0E\u0D30\u0D3F\u0D35\u0D4D \u0D09\u0D23\u0D4D\u0D1F\u0D4B?'], ['allergens', '\u0D05\u0D32\u0D7C\u0D1C\u0D3F \u0D09\u0D23\u0D4D\u0D1F\u0D4B?'], ['veg', '\u0D35\u0D46\u0D1C\u0D4D \u0D06\u0D23\u0D4B?'], ['price', '\u0D35\u0D3F\u0D32 \u0D0E\u0D24\u0D4D\u0D30?']]
};

// Words that point to each allergen, in English and Malayalam.
const ALLERGEN_WORDS = {
  milk: /milk|dairy|lactose|cheese|paneer|cream|butter|ghee|\u0D2A\u0D3E\u0D7D|\u0D2A\u0D3E\u0D32/i,
  nuts: /nut|cashew|almond|pista|walnut|\u0D28\u0D1F\u0D4D\u0D38\u0D4D|\u0D15\u0D36\u0D41\u0D35\u0D23\u0D4D\u0D1F\u0D3F|\u0D28\u0D3F\u0D32\u0D15\u0D4D\u0D15\u0D1F\u0D32|\u0D2C\u0D26\u0D3E\u0D02/i,
  gluten: /gluten|wheat|maida|atta|\u0D17\u0D4B\u0D24\u0D2E\u0D4D\u0D2A\u0D4D|\u0D2E\u0D48\u0D26/i,
  egg: /\begg|\u0D2E\u0D41\u0D1F\u0D4D\u0D1F/i,
  soy: /\bsoy|\u0D38\u0D4B\u0D2F/i,
  fish: /fish|prawn|shrimp|seafood|crab|\u0D2E\u0D40\u0D7B|\u0D1A\u0D46\u0D2E\u0D4D\u0D2E\u0D40\u0D7B|\u0D1E\u0D23\u0D4D\u0D1F\u0D4D/i
};
const TOPIC_WORDS = [
  ['allergens', /allerg|contain|\u0D05\u0D32\u0D7C\u0D1C\u0D3F|\u0D05\u0D32\u0D30\u0D4D\u0D1C\u0D3F/i],
  ['spice', /spic|\bhot\b|chil+i|mild|\u0D0E\u0D30\u0D3F\u0D35|\u0D2E\u0D41\u0D33\u0D15\u0D4D|\u0D38\u0D4D\u0D2A\u0D48\u0D38\u0D3F/i],
  ['veg', /\bveg|vegetarian|vegan|meat|chicken|beef|mutton|pork|\u0D35\u0D46\u0D1C\u0D4D|\u0D07\u0D31\u0D1A\u0D4D\u0D1A\u0D3F|\u0D1A\u0D3F\u0D15\u0D4D\u0D15\u0D7B|\u0D2C\u0D40\u0D2B\u0D4D|\u0D28\u0D4B\u0D7A/i],
  ['price', /price|cost|how much|rate|rupee|\u0D35\u0D3F\u0D32|\u0D0E\u0D24\u0D4D\u0D30|\u0D31\u0D47\u0D31\u0D4D\u0D31\u0D4D/i],
  ['taste', /taste|flavou?r|sweet|sour|bitter|salty|good|\u0D30\u0D41\u0D1A\u0D3F|\u0D1F\u0D47\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D|\u0D2E\u0D27\u0D41\u0D30/i],
  ['made', /made|make|cook|prepar|ingredient|recipe|inside|what is (it|this)|\u0D09\u0D23\u0D4D\u0D1F\u0D3E\u0D15\u0D4D\u0D15|\u0D1A\u0D47\u0D30\u0D41\u0D35|\u0D0E\u0D19\u0D4D\u0D19\u0D28\u0D46/i]
];
// Work out what a spoken question is about.
export function understand(text) {
  const t = String(text || '');
  const asked = Object.keys(ALLERGEN_WORDS).filter(k => ALLERGEN_WORDS[k].test(t));
  if (asked.length) return { topic: 'allergens', asked };
  const hit = TOPIC_WORDS.find(([, re]) => re.test(t));
  return { topic: hit ? hit[0] : '', asked: [] };
}

const allergenName = (k, lang) => { const a = ALLERGENS.find(x => x[0] === k); return a ? (lang === 'ml' ? a[2] : a[1]) : k; };
// The answer, built only from the dish details the cafe entered.
export function answer(item, topic, lang, asked) {
  const ml = lang === 'ml', al = item.allergens || [];
  const hasDetails = !!(item.made || item.taste || al.length || item.spice >= 0);
  switch (topic) {
    case 'made':
      if (ml) return item.made_ml || (item.made ? ML.onlyEnglish + item.made : ML.notWritten);
      return item.made || EN.notWritten;
    case 'taste':
      if (ml) return item.taste_ml || (item.taste ? ML.onlyEnglish + item.taste : ML.notWritten);
      return item.taste || EN.notWritten;
    case 'spice':
      if (item.spice < 0) return ml ? ML.notWritten : EN.notWritten;
      return ml ? ML.spice[item.spice] : EN.spice[item.spice];
    case 'veg':
      return ml ? (item.veg ? ML.veg : ML.nonveg) : (item.veg ? 'Yes, it\u2019s vegetarian.' : 'No, it\u2019s non-vegetarian.');
    case 'price':
      return ml ? ML.price(rupee(item.price)) : 'It costs ' + rupee(item.price) + '.';
    case 'allergens': {
      if (!hasDetails) return ml ? ML.notWritten : EN.notWritten;
      if (asked && asked.length) {
        const yes = asked.filter(k => al.includes(k)), no = asked.filter(k => !al.includes(k));
        const parts = [];
        if (yes.length) parts.push(ml ? ML.yesContains + yes.map(k => allergenName(k, 'ml')).join(', ') + '.' : 'Yes, it contains ' + yes.map(k => allergenName(k, 'en').toLowerCase()).join(' and ') + '.');
        if (no.length) parts.push(ml ? ML.notMarked + no.map(k => allergenName(k, 'ml')).join(', ') + '.' : 'This dish isn\u2019t marked as containing ' + no.map(k => allergenName(k, 'en').toLowerCase()).join(' or ') + '.');
        parts.push(ml ? ML.checkStaff : EN.checkStaff);
        return parts.join(' ');
      }
      if (al.length) return ml ? ML.contains + al.map(k => allergenName(k, 'ml')).join(', ') + '. ' + ML.checkStaff
        : 'It contains ' + al.map(k => allergenName(k, 'en').toLowerCase()).join(', ') + '. ' + EN.checkStaff;
      return ml ? ML.noneMarked + ' ' + ML.checkStaff : 'No common allergens are marked for this dish. ' + EN.checkStaff;
    }
    default:
      return ml ? ML.dontKnow : EN.dontKnow;
  }
}

/* ---------- Voice ---------- */
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => !!Recognition;
let current = null;
// Listen for one question. Resolves with what was heard (a few guesses joined together).
export function listen(lang) {
  return new Promise((resolve, reject) => {
    if (!Recognition) { reject(new Error('unsupported')); return; }
    try { if (current) current.abort(); } catch (e) {}
    const r = new Recognition(); current = r;
    r.lang = lang === 'ml' ? 'ml-IN' : 'en-IN';
    r.interimResults = false; r.maxAlternatives = 3;
    let done = false;
    r.onresult = e => {
      done = true; const heard = [];
      for (let i = 0; i < e.results.length; i++) for (let j = 0; j < e.results[i].length; j++) heard.push(e.results[i][j].transcript);
      resolve(heard.join(' | '));
    };
    r.onerror = e => { if (!done) { done = true; reject(new Error(e.error || 'error')); } };
    r.onend = () => { if (!done) { done = true; reject(new Error('no-speech')); } current = null; };
    try { r.start(); } catch (e) { reject(e); }
  });
}
export function stopListening() { try { if (current) current.abort(); } catch (e) {} current = null; }
// Phones load their list of voices a moment after the page opens, so keep it up to date.
let voices = [];
function loadVoices() { try { voices = (window.speechSynthesis && speechSynthesis.getVoices()) || []; } catch (e) {} }
if (window.speechSynthesis) {
  loadVoices();
  try { speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) { speechSynthesis.onvoiceschanged = loadVoices; }
}
function voiceFor(lang) {
  if (!voices.length) loadVoices();
  const pre = lang === 'ml' ? 'ml' : 'en-in';
  return voices.find(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith(pre)) || (lang === 'ml' ? null : voices.find(v => (v.lang || '').toLowerCase().startsWith('en')));
}
export const canSpeak = (lang) => !!(window.speechSynthesis && (lang !== 'ml' || voiceFor('ml')));
// iPhones only allow a page to speak if speech was started during a tap. Answers to spoken
// questions arrive after the tap, so call this at the start of every tap to allow speaking later.
let unlocked = false;
export function unlockSpeech() {
  if (unlocked || !window.speechSynthesis) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); unlocked = true; } catch (e) {}
}
function say(text, lang, v) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'ml' ? 'ml-IN' : 'en-IN'; if (v) u.voice = v; u.rate = 0.95;
  // Some Android phones drop speech that starts right after cancelling, so leave a short gap.
  if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(() => speechSynthesis.speak(u), 80); }
  else speechSynthesis.speak(u);
}
// Read the answer aloud. Resolves false if this phone has no voice for the language.
export function speak(text, lang) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) { resolve(false); return; }
    const go = () => {
      const v = voiceFor(lang);
      if (lang === 'ml' && !v) return false;
      try { say(text, lang, v); return true; } catch (e) { return false; }
    };
    if (go()) { resolve(true); return; }
    if (lang !== 'ml') { resolve(false); return; }
    // The voice list may still be loading: try again for up to 1.5 seconds before giving up.
    let tries = 0;
    const t = setInterval(() => { tries++; loadVoices(); if (go()) { clearInterval(t); resolve(true); } else if (tries >= 6) { clearInterval(t); resolve(false); } }, 250);
  });
}
export function stopSpeaking() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} }

// Clear messages for when voice input fails, so customers know what to do instead.
const VOICE_ERRORS = {
  blocked: ['The microphone is blocked. Allow it for this website, or tap a question below.', '\u0D2E\u0D48\u0D15\u0D4D\u0D30\u0D4B\u0D2B\u0D4B\u0D7A \u0D24\u0D1F\u0D1E\u0D4D\u0D1E\u0D3F\u0D30\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D41. \u0D05\u0D28\u0D41\u0D35\u0D26\u0D3F\u0D15\u0D4D\u0D15\u0D42, \u0D05\u0D32\u0D4D\u0D32\u0D46\u0D19\u0D4D\u0D15\u0D3F\u0D7D \u0D24\u0D3E\u0D34\u0D46\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D02 \u0D1F\u0D3E\u0D2A\u0D4D\u0D2A\u0D4D \u0D1A\u0D46\u0D2F\u0D4D\u0D2F\u0D42.'],
  browser: ['Voice questions don\u2019t work in this browser. Open this menu in Chrome, or tap a question below.', '\u0D08 \u0D2C\u0D4D\u0D30\u0D57\u0D38\u0D31\u0D3F\u0D7D \u0D36\u0D2C\u0D4D\u0D26 \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D02 \u0D2A\u0D4D\u0D30\u0D35\u0D7C\u0D24\u0D4D\u0D24\u0D3F\u0D15\u0D4D\u0D15\u0D3F\u0D32\u0D4D\u0D32. Chrome-\u0D7D \u0D24\u0D41\u0D31\u0D15\u0D4D\u0D15\u0D42, \u0D05\u0D32\u0D4D\u0D32\u0D46\u0D19\u0D4D\u0D15\u0D3F\u0D7D \u0D24\u0D3E\u0D34\u0D46\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D02 \u0D1F\u0D3E\u0D2A\u0D4D\u0D2A\u0D4D \u0D1A\u0D46\u0D2F\u0D4D\u0D2F\u0D42.'],
  network: ['Voice questions need internet. Check the connection, or tap a question below.', '\u0D07\u0D28\u0D4D\u0D31\u0D7C\u0D28\u0D46\u0D31\u0D4D\u0D31\u0D4D \u0D06\u0D35\u0D36\u0D4D\u0D2F\u0D2E\u0D3E\u0D23\u0D4D. \u0D15\u0D23\u0D15\u0D4D\u0D37\u0D7B \u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D3F\u0D15\u0D4D\u0D15\u0D42.'],
  mic: ['No microphone was found. Tap a question below instead.', '\u0D2E\u0D48\u0D15\u0D4D\u0D30\u0D4B\u0D2B\u0D4B\u0D7A \u0D15\u0D23\u0D4D\u0D1F\u0D46\u0D24\u0D4D\u0D24\u0D3F\u0D2F\u0D3F\u0D32\u0D4D\u0D32. \u0D24\u0D3E\u0D34\u0D46\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D02 \u0D1F\u0D3E\u0D2A\u0D4D\u0D2A\u0D4D \u0D1A\u0D46\u0D2F\u0D4D\u0D2F\u0D42.'],
  quiet: ['I didn\u2019t hear anything. Tap the mic and speak straight away, or tap a question below.', '\u0D12\u0D28\u0D4D\u0D28\u0D41\u0D02 \u0D15\u0D47\u0D1F\u0D4D\u0D1F\u0D3F\u0D32\u0D4D\u0D32. \u0D35\u0D40\u0D23\u0D4D\u0D1F\u0D41\u0D02 \u0D36\u0D4D\u0D30\u0D2E\u0D3F\u0D15\u0D4D\u0D15\u0D42, \u0D05\u0D32\u0D4D\u0D32\u0D46\u0D19\u0D4D\u0D15\u0D3F\u0D7D \u0D24\u0D3E\u0D34\u0D46\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D02 \u0D1F\u0D3E\u0D2A\u0D4D\u0D2A\u0D4D \u0D1A\u0D46\u0D2F\u0D4D\u0D2F\u0D42.']
};
export function voiceError(code, lang) {
  const kind = code === 'not-allowed' ? 'blocked'
    : ['service-not-allowed', 'language-not-supported', 'unsupported', 'bad-grammar'].includes(code) ? 'browser'
    : code === 'network' ? 'network' : code === 'audio-capture' ? 'mic' : 'quiet';
  return VOICE_ERRORS[kind][lang === 'ml' ? 1 : 0];
}
// Shown instead of the mic button on browsers that can't take voice questions at all.
export function noMicNote(lang) {
  return lang === 'ml' ? '\u0D36\u0D2C\u0D4D\u0D26\u0D24\u0D4D\u0D24\u0D3F\u0D7D \u0D1A\u0D4B\u0D26\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D7B \u0D08 \u0D2E\u0D46\u0D28\u0D41 Chrome-\u0D7D \u0D24\u0D41\u0D31\u0D15\u0D4D\u0D15\u0D42. \u0D24\u0D3E\u0D34\u0D46\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D19\u0D4D\u0D19\u0D7E \u0D1F\u0D3E\u0D2A\u0D4D\u0D2A\u0D4D \u0D1A\u0D46\u0D2F\u0D4D\u0D24\u0D41\u0D02 \u0D1A\u0D4B\u0D26\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D02.'
    : 'To ask out loud, open this menu in Chrome. You can also tap a question below.';
}
