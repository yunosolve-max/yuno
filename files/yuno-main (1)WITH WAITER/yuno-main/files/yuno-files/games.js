// YUNO games: something fun while the food is cooking.
// "On this phone" games work offline and cost nothing. "On your own phones" games use a
// 4-letter room code and are turn-based, so each move is one tiny save in the database.
import { esc, ls, reducedMotion, lbPeriods } from './common.js';
import { ARCADE, startArcade } from './arcade.js';

const FOOD = ['\u2615', '\u{1F375}', '\u{1F96A}', '\u{1F35F}', '\u{1F370}', '\u{1F369}', '\u{1F95F}', '\u{1F355}'];
const PCOLORS = ['#6F5CE6', '#E0573A', '#1E8A62', '#2F6FD6', '#C2185B', '#B7791F'];
const pname = (i) => 'Player ' + (i + 1);

// Food quiz. The correct answer is always written first here; options are shuffled on screen.
const QUIZ = [
  ['Which spice is the most expensive in the world by weight?', ['Saffron', 'Cardamom', 'Vanilla', 'Black pepper']],
  ['Kerala is famous for which spice, once called black gold?', ['Black pepper', 'Cinnamon', 'Clove', 'Turmeric']],
  ['Appam is made from a fermented batter of rice and...', ['Coconut', 'Wheat', 'Corn', 'Potato']],
  ['Puttu is steamed in layers of rice flour and...', ['Grated coconut', 'Sugar', 'Cheese', 'Onion']],
  ['The big Onam feast served on a banana leaf is called...', ['Sadya', 'Thali', 'Biryani', 'Mandi']],
  ['Payasam is a...', ['Sweet pudding', 'Curry', 'Bread', 'Pickle']],
  ['Paneer is a type of...', ['Cheese', 'Bread', 'Lentil', 'Rice']],
  ['Tofu is made from which bean?', ['Soybean', 'Kidney bean', 'Chickpea', 'Green gram']],
  ['Hummus is mainly made from...', ['Chickpeas', 'Peanuts', 'Green peas', 'Potatoes']],
  ['Guacamole is mainly made from...', ['Avocado', 'Cucumber', 'Green peas', 'Spinach']],
  ['Chocolate is made from the beans of which plant?', ['Cacao', 'Coffee', 'Vanilla', 'Tamarind']],
  ['Which fruit is often called the king of fruits in India?', ['Mango', 'Jackfruit', 'Banana', 'Papaya']],
  ['Which fruit has its seeds on the outside?', ['Strawberry', 'Grape', 'Guava', 'Orange']],
  ['Lemons are famous for which vitamin?', ['Vitamin C', 'Vitamin D', 'Vitamin B12', 'Vitamin K']],
  ['Espresso coffee comes from which country?', ['Italy', 'Brazil', 'France', 'Turkey']],
  ['Sushi comes from which country?', ['Japan', 'China', 'Korea', 'Thailand']],
  ['Pizza comes from which country?', ['Italy', 'USA', 'Greece', 'Spain']],
  ['Idli is cooked by...', ['Steaming', 'Frying', 'Baking', 'Grilling']],
  ['Malabar parotta is mainly made from...', ['Maida (refined flour)', 'Rice flour', 'Ragi', 'Corn flour']],
  ['How many teaspoons make one tablespoon?', ['3', '2', '4', '5']],
  ['Rogan josh is a famous dish from which region?', ['Kashmir', 'Kerala', 'Goa', 'Bengal']],
  ['Which nut is used to make marzipan?', ['Almond', 'Cashew', 'Peanut', 'Walnut']],
  ['Masala chai is usually flavoured with...', ['Cardamom and ginger', 'Mint and lime', 'Vanilla and honey', 'Cocoa']],
  ['What makes the foam on a cappuccino?', ['Steamed milk', 'Cream', 'Egg white', 'Ice cream']],
  ['Biryani is mainly cooked with which grain?', ['Rice', 'Wheat', 'Millet', 'Barley']],
  ['Wasabi comes from the same plant family as...', ['Mustard', 'Ginger', 'Garlic', 'Mint']],
  ['Kombucha is a fermented...', ['Tea', 'Milk', 'Rice water', 'Coconut water']],
  ['Which country made the croissant famous?', ['France', 'Italy', 'Germany', 'Belgium']]
];
// Same order for everyone in a room: a small seeded shuffle.
function seeded(seed) { let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
function shuffle(arr, rnd) { const a = arr.slice(); const r = rnd || Math.random; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// Options for question qi, with the index of the right answer.
function quizOptions(qi, seed) { const [, opts] = QUIZ[qi]; const order = shuffle([0, 1, 2, 3], seeded(seed + ':' + qi)); return { opts: order.map(i => opts[i]), right: order.indexOf(0) }; }

/* ---------- Board game rules ---------- */
const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function tttWinner(b) { for (const [x, y, z] of TTT_LINES) if (b[x] !== '.' && b[x] === b[y] && b[y] === b[z]) return b[x]; return b.includes('.') ? '' : 'draw'; }
function c4Drop(b, col) { for (let r = 5; r >= 0; r--) if (b[r * 7 + col] === '.') return r * 7 + col; return -1; }
function c4Winner(b) {
  const at = (r, c) => (r >= 0 && r < 6 && c >= 0 && c < 7) ? b[r * 7 + c] : '';
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const p = at(r, c); if (p === '.') continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) if (at(r + dr, c + dc) === p && at(r + 2 * dr, c + 2 * dc) === p && at(r + 3 * dr, c + 3 * dc) === p) return p;
  }
  return b.includes('.') ? '' : 'draw';
}

/* ---------- The games layer ---------- */
let opts = null, layer = null, G = {}, timers = [];
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
function clearTimers() { timers.forEach(clearTimeout); timers = []; }
let fbP = null;
const FB = () => fbP || (fbP = import('./fb-menu.js'));

export function openGames(o) {
  opts = o || {};
  if (!layer) {
    layer = document.createElement('div'); layer.className = 'g-layer'; layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-label', 'Games');
    document.body.appendChild(layer);
    layer.addEventListener('click', onClick);
    layer.addEventListener('pointerdown', onPointerDown);
    layer.addEventListener('pointermove', onPointerMove);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => layer.addEventListener(ev, onPointerUp));
    layer.addEventListener('submit', onSubmit);
  }
  layer.hidden = false; document.body.classList.add('g-open');
  go('hub');
}
function closeGames() { arcStop(); leaveRoom(); clearTimers(); if (layer) layer.hidden = true; document.body.classList.remove('g-open'); }
function go(screen, extra) { if (screen !== 'arcplay') arcStop(); clearTimers(); G = Object.assign({ screen }, extra || {}); draw(); }

function frame(title, body, back) {
  return '<div class="g-top"><button type="button" class="g-icon" data-g="' + (back || 'close') + '" aria-label="' + (back ? 'Back' : 'Close games') + '">' + (back ? '\u2039' : '\u2715') + '</button><h2>' + esc(title) + '</h2><span class="g-sp"></span></div><div class="g-body">' + body + '</div>';
}
function draw() {
  if (!layer) return;
  const s = G.screen;
  const html = s === 'hub' ? hubHtml() : s === 'players' ? playersHtml() : s === 'memory' ? memoryHtml() : s === 'ttt' ? tttHtml() : s === 'c4' ? c4Html()
    : s === 'tap' ? tapHtml() : s === 'react' ? reactHtml() : s === 'picker' ? pickerHtml() : s === 'quiz' ? quizHtml()
    : s === 'online' ? onlineHtml() : s === 'room' ? roomHtml() : s === 'arc' ? arcLobbyHtml() : s === 'arcplay' ? arcPlayHtml() : s === 'arcover' ? arcOverHtml() : hubHtml();
  layer.innerHTML = html;
  layer.classList.toggle('g-full', ['tap', 'react', 'picker', 'arcplay'].includes(s));
  if (s === 'arcplay') arcRun();
}

/* ---------- Hub ---------- */
const SHARED = [
  ['memory', '\u{1F9E0}', 'Memory match', 'Find the food pairs', 1, 6],
  ['ttt', '\u274C', 'Tic-tac-toe', 'Classic X and O', 2, 2],
  ['c4', '\u{1F534}', 'Connect four', 'Four in a row wins', 2, 2],
  ['tap', '\u{1F446}', 'Tap race', 'Fastest fingers in 10 seconds', 2, 6],
  ['react', '\u26A1', 'Reaction', 'Tap first when it turns green', 2, 6],
  ['picker', '\u{1F3AF}', 'Finger picker', 'Who pays? Who goes first?', 2, 6],
  ['quiz', '\u2753', 'Food quiz', 'Take turns answering', 1, 6]
];
const ONLINE = [['ttt', '\u274C', 'Tic-tac-toe', '2 phones'], ['c4', '\u{1F534}', 'Connect four', '2 phones'], ['quiz', '\u2753', 'Food quiz', '2 to 6 phones']];
function hubHtml() {
  const card = ([k, ico, name, sub, a, b]) => '<button type="button" class="g-card" data-g="pick" data-k="' + k + '"><span class="g-ico" aria-hidden="true">' + ico + '</span><b>' + esc(name) + '</b><span>' + esc(sub) + '</span><i>' + (a === b ? a + ' players' : a + '\u2013' + b + ' players') + '</i></button>';
  return frame('Play while you wait',
    '<p class="g-lead">Your food is on its way. Pick a game!</p>' + championsHtml() +
    '<h3 class="g-h">On this phone</h3><div class="g-grid">' + SHARED.map(card).join('') + '</div>' +
    '<h3 class="g-h">On your own phones</h3><p class="g-note">Everyone plays on their own phone with a room code.</p>' +
    '<div class="g-grid">' + ONLINE.map(([k, ico, name, sub]) => '<button type="button" class="g-card" data-g="online" data-k="' + k + '"><span class="g-ico" aria-hidden="true">' + ico + '</span><b>' + esc(name) + '</b><span>' + esc(sub) + '</span><i>Online</i></button>').join('') + '</div>' +
    '<button type="button" class="g-btn ghost" data-g="join">I have a room code</button>');
}
function playersHtml() {
  const def = SHARED.find(x => x[0] === G.game), [, ico, name, sub, a, b] = def;
  let chips = ''; for (let n = a; n <= b; n++) chips += '<button type="button" class="g-num" data-g="start" data-n="' + n + '">' + n + '</button>';
  return frame(name, '<div class="g-center"><span class="g-big-ico" aria-hidden="true">' + ico + '</span><p class="g-lead">' + esc(sub) + '</p><h3 class="g-h">How many players?</h3><div class="g-nums">' + chips + '</div></div>', 'hub');
}
function startShared(game, n) {
  if (game === 'memory') {
    const deck = shuffle(FOOD.concat(FOOD));
    go('memory', { n, deck, open: [], done: deck.map(() => false), turn: 0, scores: Array(n).fill(0), moves: 0, t0: Date.now(), lock: false });
  } else if (game === 'ttt') go('ttt', { b: '.........', turn: 0, n: 2 });
  else if (game === 'c4') go('c4', { b: '.'.repeat(42), turn: 0, n: 2 });
  else if (game === 'tap') go('tap', { n, phase: 'ready', counts: Array(n).fill(0) });
  else if (game === 'react') go('react', { n, round: 1, rounds: 5, scores: Array(n).fill(0), phase: 'ready', out: [] });
  else if (game === 'picker') go('picker', { n, pts: new Map(), phase: 'wait' });
  else if (game === 'quiz') { const qs = shuffle(QUIZ.map((_, i) => i)).slice(0, Math.max(6, n * 2)); go('quiz', { n, qs, qi: 0, turn: 0, scores: Array(n).fill(0), seed: String(Math.random()), picked: -1 }); }
}
function scoreRow(scores, turn) {
  return '<div class="g-scores">' + scores.map((s, i) => '<span class="g-score' + (i === turn ? ' on' : '') + '" style="--pc:' + PCOLORS[i] + '"><i></i>' + pname(i) + '<b>' + s + '</b></span>').join('') + '</div>';
}
function winnerText(scores) {
  const max = Math.max(...scores), w = scores.map((s, i) => s === max ? i : -1).filter(i => i >= 0);
  return w.length > 1 ? 'It\u2019s a tie between ' + w.map(pname).join(' and ') + '!' : pname(w[0]) + ' wins!';
}
function endCard(title, again) {
  return '<div class="g-end"><span class="g-big-ico" aria-hidden="true">\u{1F389}</span><h3>' + esc(title) + '</h3><div class="g-row"><button type="button" class="g-btn" data-g="' + again + '">Play again</button><button type="button" class="g-btn ghost" data-g="hub">Other games</button></div></div>';
}

/* ---------- Memory match ---------- */
function memoryHtml() {
  const allDone = G.done.every(Boolean);
  const info = G.n === 1 ? '<p class="g-lead">' + G.moves + ' moves</p>' : scoreRow(G.scores, G.turn);
  const cards = G.deck.map((f, i) => { const up = G.done[i] || G.open.includes(i);
    return '<button type="button" class="g-mem' + (up ? ' up' : '') + (G.done[i] ? ' done' : '') + '" data-g="flip" data-i="' + i + '" aria-label="' + (up ? 'Card ' + (i + 1) + ', ' + f : 'Hidden card ' + (i + 1)) + '"' + (up ? ' disabled' : '') + '><span>' + (up ? f : '') + '</span></button>'; }).join('');
  const end = allDone ? endCard(G.n === 1 ? 'All pairs found in ' + G.moves + ' moves and ' + Math.round((Date.now() - G.t0) / 1000) + ' seconds!' : winnerText(G.scores), 'again-memory') : '';
  return frame('Memory match', info + (G.n > 1 && !allDone ? '<p class="g-turn" style="--pc:' + PCOLORS[G.turn] + '">' + pname(G.turn) + '\u2019s turn</p>' : '') + '<div class="g-memgrid">' + cards + '</div>' + end, 'hub');
}
function flip(i) {
  if (G.lock || G.done[i] || G.open.includes(i)) return;
  G.open.push(i);
  if (G.open.length === 2) {
    G.moves++; const [a, b] = G.open;
    if (G.deck[a] === G.deck[b]) { G.done[a] = G.done[b] = true; G.scores[G.turn]++; G.open = []; }
    else { G.lock = true; later(() => { G.open = []; G.lock = false; G.turn = (G.turn + 1) % G.n; draw(); }, 900); }
  }
  draw();
}

/* ---------- Tic-tac-toe and Connect four (same phone) ---------- */
function tttHtml() {
  const w = tttWinner(G.b), marks = ['X', 'O'];
  const cells = G.b.split('').map((c, i) => '<button type="button" class="g-ttt' + (c !== '.' ? ' m' + c : '') + '" data-g="ttt-move" data-i="' + i + '" aria-label="Square ' + (i + 1) + (c !== '.' ? ', ' + c : '') + '"' + (c !== '.' || w ? ' disabled' : '') + '>' + (c !== '.' ? c : '') + '</button>').join('');
  const status = w ? '' : '<p class="g-turn" style="--pc:' + PCOLORS[G.turn] + '">' + pname(G.turn) + ' (' + marks[G.turn] + ')</p>';
  const end = w ? endCard(w === 'draw' ? 'It\u2019s a draw!' : pname(marks.indexOf(w)) + ' wins!', 'again-ttt') : '';
  return frame('Tic-tac-toe', status + '<div class="g-tttgrid">' + cells + '</div>' + end, 'hub');
}
function c4Html() {
  const w = c4Winner(G.b), marks = ['R', 'Y'];
  let cells = '';
  for (let i = 0; i < 42; i++) cells += '<button type="button" class="g-c4c' + (G.b[i] !== '.' ? ' p' + G.b[i] : '') + '" data-g="c4-move" data-col="' + (i % 7) + '" aria-label="Column ' + (i % 7 + 1) + '"' + (w ? ' disabled' : '') + '></button>';
  const status = w ? '' : '<p class="g-turn" style="--pc:' + (G.turn ? '#E3A008' : '#E0573A') + '">' + pname(G.turn) + ' (' + (G.turn ? 'yellow' : 'red') + '), tap a column</p>';
  const end = w ? endCard(w === 'draw' ? 'It\u2019s a draw!' : pname(marks.indexOf(w)) + ' wins!', 'again-c4') : '';
  return frame('Connect four', status + '<div class="g-c4">' + cells + '</div>' + end, 'hub');
}

/* ---------- Tap race (everyone at once, own corner of the screen) ---------- */
function zones(inner) {
  let z = '';
  for (let i = 0; i < G.n; i++) z += '<div class="g-zone' + (zoneFlip(i) ? ' flip' : '') + '" data-zone="' + i + '" style="--pc:' + PCOLORS[i] + '">' + inner(i) + '</div>';
  return '<div class="g-zones n' + G.n + '">' + z + '</div>';
}
// Players sit around the table, so the top half of the screen is turned to face the other side.
function zoneFlip(i) { return G.n === 2 ? i === 0 : i < Math.ceil(G.n / 2) && G.n > 3; }
function tapHtml() {
  const bar = '<div class="g-fullbar"><button type="button" class="g-icon" data-g="hub" aria-label="Back">\u2039</button><b>Tap race</b><span>' + (G.phase === 'go' ? Math.max(0, Math.ceil((G.end - Date.now()) / 1000)) + 's' : '') + '</span></div>';
  if (G.phase === 'ready') return bar + '<div class="g-center g-pad"><p class="g-lead">Put the phone in the middle. Each player taps their own colour as fast as they can for 10 seconds.</p><button type="button" class="g-btn" data-g="tap-go">Start</button></div>';
  if (G.phase === 'count') return bar + '<div class="g-countdown">' + G.count + '</div>';
  if (G.phase === 'done') return bar + zones(i => '<span class="g-zn">' + pname(i) + '</span><b class="g-zc">' + G.counts[i] + '</b>') + endCard(winnerText(G.counts), 'again-tap');
  return bar + zones(i => '<span class="g-zn">' + pname(i) + '</span><b class="g-zc">' + G.counts[i] + '</b>');
}
function tapStart() {
  G.phase = 'count'; G.count = 3; draw();
  const tick = () => { G.count--; if (G.count > 0) { draw(); later(tick, 700); } else { G.phase = 'go'; G.end = Date.now() + 10000; draw(); const t = () => { if (Date.now() >= G.end) { G.phase = 'done'; draw(); } else { const el = layer.querySelector('.g-fullbar span'); if (el) el.textContent = Math.ceil((G.end - Date.now()) / 1000) + 's'; later(t, 200); } }; later(t, 200); } };
  later(tick, 700);
}

/* ---------- Reaction: tap first when it turns green ---------- */
function reactHtml() {
  const bar = '<div class="g-fullbar"><button type="button" class="g-icon" data-g="hub" aria-label="Back">\u2039</button><b>Reaction, round ' + Math.min(G.round, G.rounds) + ' of ' + G.rounds + '</b><span></span></div>';
  if (G.phase === 'ready') return bar + '<div class="g-center g-pad"><p class="g-lead">Wait for your colour to turn green, then tap first. Tap too soon and you\u2019re out for that round.</p><button type="button" class="g-btn" data-g="react-go">Start</button></div>';
  if (G.phase === 'done') return bar + zones(i => '<span class="g-zn">' + pname(i) + '</span><b class="g-zc">' + G.scores[i] + '</b>') + endCard(winnerText(G.scores), 'again-react');
  return bar + zones(i => {
    const out = G.out.includes(i), won = G.phase === 'won' && G.winner === i;
    return '<span class="g-zn">' + pname(i) + '</span><b class="g-zc">' + (won ? 'First!' : out ? 'Too soon' : G.phase === 'go' ? 'TAP!' : 'Wait\u2026') + '</b><span class="g-zs">' + G.scores[i] + ' pts</span>';
  }).replace('class="g-zones', 'class="g-zones ' + (G.phase === 'go' ? 'go' : 'wait'));
}
function reactRound() {
  G.phase = 'wait'; G.out = []; G.winner = -1; draw();
  later(() => { if (G.screen === 'react' && G.phase === 'wait') { G.phase = 'go'; draw(); } }, 1500 + Math.random() * 2500);
}
function reactTap(i) {
  if (G.phase === 'wait') { if (!G.out.includes(i)) { G.out.push(i); if (G.out.length >= G.n) { later(nextReact, 900); } draw(); } return; }
  if (G.phase === 'go' && !G.out.includes(i)) { G.phase = 'won'; G.winner = i; G.scores[i]++; draw(); later(nextReact, 1300); }
}
function nextReact() { if (G.screen !== 'react') return; G.round++; if (G.round > G.rounds) { G.phase = 'done'; draw(); } else reactRound(); }

/* ---------- Finger picker ---------- */
function pickerHtml() {
  const bar = '<div class="g-fullbar"><button type="button" class="g-icon" data-g="hub" aria-label="Back">\u2039</button><b>Finger picker</b><span></span></div>';
  let dots = '';
  let k = 0;
  G.pts.forEach((p, id) => { const chosen = G.phase === 'picked' && G.chosen === id; if (G.phase === 'picked' && !chosen) { k++; return; }
    dots += '<span class="g-dot' + (chosen ? ' chosen' : '') + '" style="left:' + p.x + 'px;top:' + p.y + 'px;--pc:' + PCOLORS[k % 6] + '"></span>'; k++; });
  const msg = G.phase === 'picked' ? 'Chosen! Lift fingers to play again.' : G.pts.size >= 2 ? 'Hold still\u2026' : 'Everyone put one finger on the screen and hold';
  return bar + '<div class="g-picker" data-picker="1"><p class="g-pick-msg">' + msg + '</p>' + dots + '</div>';
}
let pickTimer = null;
function pickerChanged() {
  clearTimeout(pickTimer);
  if (G.phase === 'picked') return;
  if (G.pts.size >= 2) pickTimer = setTimeout(() => { const ids = [...G.pts.keys()]; G.chosen = ids[Math.floor(Math.random() * ids.length)]; G.phase = 'picked'; if (navigator.vibrate) navigator.vibrate(120); draw(); }, 2500);
}

/* ---------- Food quiz (same phone, take turns) ---------- */
function quizHtml() {
  if (G.qi >= G.qs.length) return frame('Food quiz', scoreRow(G.scores, -1) + endCard(G.n === 1 ? 'You got ' + G.scores[0] + ' of ' + G.qs.length + ' right!' : winnerText(G.scores), 'again-quiz'), 'hub');
  const qi = G.qs[G.qi], { opts: o, right } = quizOptions(qi, G.seed);
  const answered = G.picked >= 0;
  return frame('Food quiz', (G.n > 1 ? scoreRow(G.scores, G.turn) + '<p class="g-turn" style="--pc:' + PCOLORS[G.turn] + '">' + pname(G.turn) + '\u2019s question</p>' : '<p class="g-lead">Question ' + (G.qi + 1) + ' of ' + G.qs.length + '</p>') +
    '<h3 class="g-q">' + esc(QUIZ[qi][0]) + '</h3><div class="g-opts">' + o.map((t, i) => '<button type="button" class="g-opt' + (answered ? (i === right ? ' right' : i === G.picked ? ' wrong' : '') : '') + '" data-g="quiz-pick" data-i="' + i + '"' + (answered ? ' disabled' : '') + '>' + esc(t) + '</button>').join('') + '</div>' +
    (answered ? '<button type="button" class="g-btn" data-g="quiz-next">' + (G.qi + 1 >= G.qs.length ? 'See results' : 'Next question') + '</button>' : ''), 'hub');
}

/* ---------- Own phones: rooms with a code ---------- */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Each browser tab is its own player (kept across reloads of that tab).
const myId = () => {
  let id = '';
  try { id = sessionStorage.getItem('yumotap:pid') || ''; } catch (e) {}
  if (!id) { id = 'p' + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem('yumotap:pid', id); } catch (e) {} }
  return id;
};
const MAXP = { ttt: 2, c4: 2, quiz: 6 };
const GAME_NAME = { ttt: 'Tic-tac-toe', c4: 'Connect four', quiz: 'Food quiz' };
let roomUnsub = null, roomRef = null, quizTick = null;
function onlineHtml() {
  const name = esc(ls.get('yumotap:gname', ''));
  if (G.mode === 'join') return frame('Join a game', '<form class="g-form" data-form="join"><label class="g-field"><span>Room code</span><input name="code" maxlength="4" autocapitalize="characters" autocomplete="off" inputmode="text" placeholder="ABCD" required></label>' +
    '<label class="g-field"><span>Your name</span><input name="name" maxlength="14" value="' + name + '" placeholder="Your name" required></label>' + (G.err ? '<p class="g-err" role="alert">' + esc(G.err) + '</p>' : '') +
    '<button class="g-btn" type="submit"' + (G.busy ? ' disabled' : '') + '>' + (G.busy ? 'Joining\u2026' : 'Join') + '</button></form>', 'hub');
  return frame(GAME_NAME[G.game] + ' online', '<form class="g-form" data-form="create"><p class="g-lead">You\u2019ll get a code. Friends type it on their phones to join.</p>' +
    '<label class="g-field"><span>Your name</span><input name="name" maxlength="14" value="' + name + '" placeholder="Your name" required></label>' + (G.err ? '<p class="g-err" role="alert">' + esc(G.err) + '</p>' : '') +
    '<button class="g-btn" type="submit"' + (G.busy ? ' disabled' : '') + '>' + (G.busy ? 'Creating\u2026' : 'Create room') + '</button></form>', 'hub');
}
async function createRoom(name) {
  const { db, doc, runTransaction, serverTimestamp } = await FB();
  for (let tries = 0; tries < 5; tries++) {
    let code = ''; for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    const ref = doc(db, 'cafes', opts.cafeId, 'rooms', code);
    const ok = await runTransaction(db, async tx => {
      const sn = await tx.get(ref);
      if (sn.exists() && sn.data().status !== 'done') return false;
      tx.set(ref, { game: G.game, status: 'lobby', host: myId(), players: [{ id: myId(), name }], board: '', turn: 0, winner: '', q: 0, qs: [], ans: {}, deadline: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return true;
    });
    if (ok) return code;
  }
  throw new Error('busy');
}
async function joinRoom(code, name) {
  const { db, doc, runTransaction, serverTimestamp } = await FB();
  const ref = doc(db, 'cafes', opts.cafeId, 'rooms', code);
  await runTransaction(db, async tx => {
    const sn = await tx.get(ref);
    if (!sn.exists()) throw Object.assign(new Error('That code doesn\u2019t match a game here.'), { soft: true });
    const r = sn.data(), players = r.players || [];
    if (players.some(p => p.id === myId())) return;
    if (r.status !== 'lobby') throw Object.assign(new Error('That game has already started.'), { soft: true });
    if (players.length >= MAXP[r.game]) throw Object.assign(new Error('That game is full.'), { soft: true });
    tx.update(ref, { players: players.concat([{ id: myId(), name }]), updatedAt: serverTimestamp() });
  });
}
async function watchRoom(code) {
  const { db, doc, onSnapshot } = await FB();
  leaveRoom(true);
  roomRef = doc(db, 'cafes', opts.cafeId, 'rooms', code);
  go('room', { code, room: null });
  roomUnsub = onSnapshot(roomRef, sn => {
    if (G.screen !== 'room') return;
    if (!sn.exists()) { go('online', { mode: 'join', err: 'The host ended the game.' }); leaveRoom(true); return; }
    G.room = sn.data(); draw();
  }, () => { go('online', { mode: 'join', err: 'Lost the connection to the game.' }); });
  clearInterval(quizTick); quizTick = setInterval(quizAutoAdvance, 1000);
}
function leaveRoom(keepScreen) {
  clearInterval(quizTick); quizTick = null;
  if (roomUnsub) { try { roomUnsub(); } catch (e) {} roomUnsub = null; }
  const r = G.room, ref = roomRef; roomRef = null;
  if (!keepScreen && r && ref && r.host === myId() && r.status === 'lobby') FB().then(({ deleteDoc }) => deleteDoc(ref)).catch(() => {});
}
async function roomTx(fn) {
  const { db, runTransaction, serverTimestamp } = await FB();
  if (!roomRef) return;
  try { await runTransaction(db, async tx => { const sn = await tx.get(roomRef); if (!sn.exists()) return; const up = fn(sn.data()); if (up) tx.update(roomRef, Object.assign(up, { updatedAt: serverTimestamp() })); }); }
  catch (e) { /* someone else moved first; the live update will show it */ }
}
function startRoom() {
  roomTx(r => {
    if (r.host !== myId() || r.status !== 'lobby') return null;
    if (r.game === 'quiz') return { status: 'play', qs: shuffle(QUIZ.map((_, i) => i)).slice(0, 8), q: 0, ans: {}, deadline: Date.now() + 20000, winner: '' };
    return { status: 'play', board: r.game === 'ttt' ? '.........' : '.'.repeat(42), turn: 0, winner: '' };
  });
}
function roomMove(i) {
  roomTx(r => {
    if (r.status !== 'play') return null;
    const me = (r.players || []).findIndex(p => p.id === myId()); if (me !== r.turn) return null;
    let b = r.board, idx = i;
    if (r.game === 'ttt') { if (b[i] !== '.') return null; }
    else { idx = c4Drop(b, i); if (idx < 0) return null; }
    b = b.slice(0, idx) + (r.game === 'ttt' ? 'XO' : 'RY')[me] + b.slice(idx + 1);
    const w = r.game === 'ttt' ? tttWinner(b) : c4Winner(b);
    return { board: b, turn: 1 - r.turn, winner: w, status: w ? 'done' : 'play' };
  });
}
async function quizAnswer(choice) {
  const r = G.room; if (!r || r.status !== 'play') return;
  const key = myId() + '_' + r.q; if (r.ans && r.ans[key] !== undefined) return;
  const { updateDoc, serverTimestamp } = await FB();
  if (roomRef) updateDoc(roomRef, { ['ans.' + key]: choice, updatedAt: serverTimestamp() }).catch(() => {});
}
function quizAutoAdvance() {
  const r = G.room; if (G.screen !== 'room' || !r || r.game !== 'quiz' || r.status !== 'play') return;
  const all = (r.players || []).every(p => r.ans && r.ans[p.id + '_' + r.q] !== undefined);
  if (all || Date.now() > r.deadline + 1500) {
    const q = r.q;
    roomTx(x => x.status === 'play' && x.q === q ? (q + 1 >= x.qs.length ? { status: 'done', q: q + 1 } : { q: q + 1, deadline: Date.now() + 20000 }) : null);
  } else {
    // Only the seconds change, so update just that number. Redrawing everything could swallow a tap.
    const el = layer && layer.querySelector('.g-left'); if (el) el.textContent = Math.max(0, Math.ceil((r.deadline - Date.now()) / 1000)) + 's left';
  }
}
function quizScores(r) { return (r.players || []).map(p => r.qs.slice(0, r.q + 1).reduce((s, qi, k) => { const a = r.ans && r.ans[p.id + '_' + k]; return s + (a !== undefined && a === quizOptions(qi, 'room' + k).right ? 1 : 0); }, 0)); }
function roomHtml() {
  const r = G.room;
  if (!r) return frame('Game room', '<p class="g-lead">Connecting\u2026</p>', 'leave');
  const players = r.players || [], me = players.findIndex(p => p.id === myId()), host = r.host === myId();
  const plist = '<ul class="g-plist">' + players.map((p, i) => '<li style="--pc:' + PCOLORS[i] + '"><i></i>' + esc(p.name) + (p.id === r.host ? ' <span>(host)</span>' : '') + (i === me ? ' <span>(you)</span>' : '') + '</li>').join('') + '</ul>';
  const title = GAME_NAME[r.game];
  if (r.status === 'lobby') {
    const need = r.game === 'quiz' ? 2 : 2, enough = players.length >= need;
    return frame(title, '<div class="g-center"><p class="g-lead">Room code</p><p class="g-code" aria-label="Room code ' + G.code.split('').join(' ') + '">' + G.code + '</p><p class="g-note">Friends open the menu, tap Games, then \u201CI have a room code\u201D.</p>' + plist +
      (host ? '<button type="button" class="g-btn" data-g="room-start"' + (enough ? '' : ' disabled') + '>' + (enough ? 'Start game' : 'Waiting for a friend\u2026') + '</button>' : '<p class="g-lead">Waiting for the host to start\u2026</p>') + '</div>', 'leave');
  }
  if (r.game === 'quiz') {
    const scores = quizScores(r);
    if (r.status === 'done' || r.q >= r.qs.length) {
      const max = Math.max(...scores), w = players.filter((p, i) => scores[i] === max).map(p => p.name);
      return frame(title, '<ul class="g-plist">' + players.map((p, i) => '<li style="--pc:' + PCOLORS[i] + '"><i></i>' + esc(p.name) + ' <b>' + scores[i] + '</b></li>').join('') + '</ul>' +
        '<div class="g-end"><span class="g-big-ico" aria-hidden="true">\u{1F3C6}</span><h3>' + esc(w.length > 1 ? 'Tie: ' + w.join(' and ') : w[0] + ' wins!') + '</h3><div class="g-row">' + (host ? '<button type="button" class="g-btn" data-g="room-again">Play again</button>' : '') + '<button type="button" class="g-btn ghost" data-g="leave">Leave</button></div></div>', 'leave');
    }
    const qi = r.qs[r.q], { opts: o, right } = quizOptions(qi, 'room' + r.q), mine = r.ans && r.ans[myId() + '_' + r.q];
    const answered = players.filter(p => r.ans && r.ans[p.id + '_' + r.q] !== undefined).length, left = Math.max(0, Math.ceil((r.deadline - Date.now()) / 1000));
    return frame(title, '<p class="g-lead">Question ' + (r.q + 1) + ' of ' + r.qs.length + ', <span class="g-left">' + left + 's left</span>, ' + answered + ' of ' + players.length + ' answered</p><h3 class="g-q">' + esc(QUIZ[qi][0]) + '</h3>' +
      '<div class="g-opts">' + o.map((t, i) => '<button type="button" class="g-opt' + (mine !== undefined ? (i === mine ? (i === right ? ' right' : ' wrong') : '') : '') + '" data-g="room-answer" data-i="' + i + '"' + (mine !== undefined ? ' disabled' : '') + '>' + esc(t) + '</button>').join('') + '</div>' +
      (mine !== undefined ? '<p class="g-note">Waiting for the others\u2026</p>' : ''), 'leave');
  }
  const myTurn = r.status === 'play' && me === r.turn, w = r.winner;
  const turnText = w ? '' : '<p class="g-turn" style="--pc:' + PCOLORS[r.turn] + '">' + (myTurn ? 'Your turn' : esc((players[r.turn] || {}).name || 'Friend') + '\u2019s turn') + '</p>';
  let board = '';
  if (r.game === 'ttt') board = '<div class="g-tttgrid">' + r.board.split('').map((c, i) => '<button type="button" class="g-ttt' + (c !== '.' ? ' m' + c : '') + '" data-g="room-move" data-i="' + i + '"' + (c !== '.' || !myTurn ? ' disabled' : '') + '>' + (c !== '.' ? c : '') + '</button>').join('') + '</div>';
  else { let cells = ''; for (let i = 0; i < 42; i++) cells += '<button type="button" class="g-c4c' + (r.board[i] !== '.' ? ' p' + r.board[i] : '') + '" data-g="room-move" data-i="' + (i % 7) + '"' + (!myTurn ? ' disabled' : '') + '></button>'; board = '<div class="g-c4">' + cells + '</div>'; }
  const marks = r.game === 'ttt' ? 'XO' : 'RY';
  const end = w ? '<div class="g-end"><span class="g-big-ico" aria-hidden="true">\u{1F389}</span><h3>' + (w === 'draw' ? 'It\u2019s a draw!' : (marks.indexOf(w) === me ? 'You win!' : esc((players[marks.indexOf(w)] || {}).name || 'Friend') + ' wins!')) + '</h3><div class="g-row">' + (host ? '<button type="button" class="g-btn" data-g="room-again">Play again</button>' : '') + '<button type="button" class="g-btn ghost" data-g="leave">Leave</button></div></div>' : '';
  return frame(title, turnText + board + end, 'leave');
}

/* ---------- Events ---------- */
async function onClick(e) {
  const t = e.target.closest('[data-g]'); if (!t) return;
  const g = t.dataset.g;
  switch (g) {
    case 'close': closeGames(); break;
    case 'hub': go('hub'); break;
    case 'pick': { const def = SHARED.find(x => x[0] === t.dataset.k); if (def[4] === def[5]) startShared(def[0], def[4]); else go('players', { game: def[0] }); break; }
    case 'start': startShared(G.game, parseInt(t.dataset.n, 10)); break;
    case 'again-memory': startShared('memory', G.n); break;
    case 'again-ttt': startShared('ttt', 2); break;
    case 'again-c4': startShared('c4', 2); break;
    case 'again-tap': startShared('tap', G.n); break;
    case 'again-react': startShared('react', G.n); break;
    case 'again-quiz': startShared('quiz', G.n); break;
    case 'flip': flip(parseInt(t.dataset.i, 10)); break;
    case 'ttt-move': { const i = parseInt(t.dataset.i, 10); if (G.b[i] !== '.' || tttWinner(G.b)) break; G.b = G.b.slice(0, i) + 'XO'[G.turn] + G.b.slice(i + 1); G.turn = 1 - G.turn; draw(); break; }
    case 'c4-move': { if (c4Winner(G.b)) break; const idx = c4Drop(G.b, parseInt(t.dataset.col, 10)); if (idx < 0) break; G.b = G.b.slice(0, idx) + 'RY'[G.turn] + G.b.slice(idx + 1); G.turn = 1 - G.turn; draw(); break; }
    case 'tap-go': tapStart(); break;
    case 'react-go': reactRound(); break;
    case 'quiz-pick': { if (G.picked >= 0) break; const i = parseInt(t.dataset.i, 10), { right } = quizOptions(G.qs[G.qi], G.seed); G.picked = i; if (i === right) G.scores[G.turn]++; draw(); break; }
    case 'quiz-next': G.qi++; G.picked = -1; G.turn = (G.turn + 1) % G.n; draw(); break;
    case 'online': go('online', { game: t.dataset.k }); break;
    case 'join': go('online', { mode: 'join' }); break;
    case 'leave': leaveRoom(); go('hub'); break;
    case 'room-start': startRoom(); break;
    case 'room-move': roomMove(parseInt(t.dataset.i, 10)); break;
    case 'room-answer': quizAnswer(parseInt(t.dataset.i, 10)); break;
    case 'arc': { const k = ARCADE[t.dataset.k] ? t.dataset.k : G.game; G.err = ''; go('arc', { game: k }); loadBoard(k); break; }
    case 'arc-start': {
      const f = layer.querySelector('.arc-nameform');
      if (f) { const n = String(f.name.value || '').trim().slice(0, 14); if (!n) { G.err = 'Add your name so it can show on the leaderboard.'; draw(); break; } ls.set('yumotap:gname', n); }
      go('arcplay', { game: G.game }); break;
    }
    case 'arc-quit': go('arc', { game: G.game }); break;
    case 'arc-refresh': loadBoard(G.game, true); break;
    case 'room-again': roomTx(r => r.host === myId() ? { status: 'lobby', board: '', turn: 0, winner: '', q: 0, qs: [], ans: {}, deadline: 0 } : null); break;
  }
}
async function onSubmit(e) {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === 'arcname') { const b = layer.querySelector('[data-g="arc-start"]'); if (b) b.click(); return; }
  const name = String(f.name.value || '').trim().slice(0, 14);
  if (!name) { G.err = 'Add your name.'; draw(); return; }
  ls.set('yumotap:gname', name);
  G.busy = true; G.err = ''; draw();
  try {
    if (f.dataset.form === 'create') { const code = await createRoom(name); await watchRoom(code); }
    else {
      const code = String(f.code.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 4) { G.busy = false; G.err = 'Room codes have 4 letters.'; draw(); return; }
      await joinRoom(code, name); await watchRoom(code);
    }
  } catch (err) { G.busy = false; G.err = err && err.soft ? err.message : 'Couldn\u2019t connect. Check your internet and try again.'; draw(); }
}
function zoneOf(e) { const z = e.target.closest('[data-zone]'); return z ? parseInt(z.dataset.zone, 10) : -1; }
function onPointerDown(e) {
  if (G.screen === 'tap' && G.phase === 'go') { const i = zoneOf(e); if (i >= 0) { G.counts[i]++; const el = layer.querySelector('[data-zone="' + i + '"] .g-zc'); if (el) el.textContent = G.counts[i]; if (!reducedMotion) { const z = layer.querySelector('[data-zone="' + i + '"]'); z.classList.remove('hit'); void z.offsetWidth; z.classList.add('hit'); } } e.preventDefault(); }
  else if (G.screen === 'react' && (G.phase === 'wait' || G.phase === 'go')) { const i = zoneOf(e); if (i >= 0) reactTap(i); e.preventDefault(); }
  else if (G.screen === 'picker' && e.target.closest('[data-picker]')) {
    if (G.phase === 'picked') return;
    const box = layer.querySelector('[data-picker]').getBoundingClientRect();
    G.pts.set(e.pointerId, { x: e.clientX - box.left, y: e.clientY - box.top }); pickerChanged(); draw(); e.preventDefault();
  }
}
function onPointerMove(e) {
  if (G.screen !== 'picker' || !G.pts || !G.pts.has(e.pointerId) || G.phase === 'picked') return;
  const box = layer.querySelector('[data-picker]').getBoundingClientRect();
  G.pts.set(e.pointerId, { x: e.clientX - box.left, y: e.clientY - box.top });
  const dot = layer.querySelectorAll('.g-dot')[[...G.pts.keys()].indexOf(e.pointerId)];
  if (dot) { dot.style.left = (e.clientX - box.left) + 'px'; dot.style.top = (e.clientY - box.top) + 'px'; }
}
function onPointerUp(e) {
  if (G.screen !== 'picker' || !G.pts || !G.pts.has(e.pointerId)) return;
  G.pts.delete(e.pointerId);
  if (G.phase === 'picked') { if (!G.pts.size) { G.phase = 'wait'; G.chosen = null; draw(); } return; }
  pickerChanged(); draw();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && layer && !layer.hidden) closeGames(); });

/* ---------- Cafe leaderboard games (Tea Stack, Chai Rush) ----------
   Each player keeps their best score for the period (today, or this week) in one small record:
   cafes/<cafe>/scores/<period>_<game>_<player>. Everyone at the cafe sees the top 10.
   Only phones that scanned a table QR in the last few hours can post scores, and the cafe can
   remove a name from the counter. The #1 player when the period ends wins the cafe's prize. */
const ARC_ART = {
  stack: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="44" width="36" height="9" rx="4" fill="#17181D"/><rect x="17" y="34" width="30" height="9" rx="4" fill="#ABA0F7"/><rect x="20" y="24" width="26" height="9" rx="4" fill="#B9CFEE"/><rect x="24" y="14" width="20" height="9" rx="4" fill="#D6E96E"/><path d="M30 10c0-3 3-3 3-6M36 10c0-3 3-3 3-6" stroke="#17181D" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
  rush: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="4" width="44" height="56" rx="10" fill="#3B3D46"/><path d="M25 6v52M39 6v52" stroke="#fff" stroke-width="2.5" stroke-dasharray="6 6" opacity=".6"/><circle cx="32" cy="44" r="8" fill="#D6E96E"/><path d="M28 44h8M32 40v8" stroke="#17181D" stroke-width="2.4" stroke-linecap="round"/><rect x="40" y="14" width="9" height="9" rx="2.5" fill="#F5E9A9"/><rect x="15" y="22" width="9" height="9" rx="2.5" fill="#FFB48C"/></svg>'
};
let arcRunner = null;
function arcStop() { if (arcRunner) { arcRunner.stop(); arcRunner = null; } }
const ARC = { boards: {}, wins: {}, pidh: '', loaded: false };
const st = () => (opts && opts.settings) || {};
const periodMode = () => st().lbPeriod === 'week' ? 'week' : 'day';
const periods = () => lbPeriods(st());
const curWord = () => periodMode() === 'week' ? 'this week' : 'today';
const prevWord = () => periodMode() === 'week' ? 'last week' : 'yesterday';
const prize = () => String(st().prize || '').trim();
const live = () => !!(opts && opts.cafeId && !opts.demo);
function player() {
  let p = ls.get('yuno:player', null);
  if (!p || typeof p.pid !== 'string' || p.pid.length < 16) {
    const a = new Uint8Array(15); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; });
    p = { pid: Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 22) }; ls.set('yuno:player', p);
  }
  return p;
}
// Scores are saved under a scrambled form of this phone's secret player id, so nobody can claim another phone's prize.
async function myHash() {
  if (ARC.pidh) return ARC.pidh;
  const pid = player().pid;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('yuno:' + pid));
    ARC.pidh = Array.from(new Uint8Array(buf).slice(0, 8), b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let h1 = 0x811c9dc5, h2 = 0x1234567; for (const c of 'yuno:' + pid) { h1 = Math.imul(h1 ^ c.charCodeAt(0), 16777619); h2 = Math.imul(h2 ^ c.charCodeAt(0), 2246822507); }
    ARC.pidh = ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).slice(0, 16);
  }
  return ARC.pidh;
}
async function fetchBoard(pg, n) {
  const { db, collection, query, where, orderBy, limit, getDocs } = await FB();
  const col = collection(db, 'cafes', opts.cafeId, 'scores');
  let snap;
  try { snap = await getDocs(query(col, where('pg', '==', pg), orderBy('score', 'desc'), limit(n || 15))); }
  catch (e) { snap = await getDocs(query(col, where('pg', '==', pg), limit(100))); } // works even before the index is made
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(x => !x.hidden && typeof x.score === 'number')
    .sort((a, b) => b.score - a.score || ((a.at && a.at.toMillis ? a.at.toMillis() : 0) - (b.at && b.at.toMillis ? b.at.toMillis() : 0))).slice(0, 10);
}
async function loadBoard(game, force) {
  if (!live()) return;
  const pg = periods().cur + '_' + game, b = ARC.boards[pg];
  if (b && !force && Date.now() - b.at < 20000) return;
  ARC.boards[pg] = Object.assign({ list: [] }, b || {}, { loading: true, at: Date.now() });
  try { ARC.boards[pg].list = await fetchBoard(pg); ARC.boards[pg].err = false; } catch (e) { ARC.boards[pg].err = true; }
  ARC.boards[pg].loading = false; ARC.boards[pg].at = Date.now();
  if (['hub', 'arc', 'arcover'].includes(G.screen)) draw();
}
// Did this phone win the last period? Then it shows a winner card to take to the counter.
async function checkWins() {
  if (!live() || !prize()) return;
  const me = await myHash(), prev = periods().prev;
  for (const game of Object.keys(ARCADE)) {
    try { const top = (await fetchBoard(prev + '_' + game, 5))[0]; ARC.wins[game] = top && top.pidh === me ? top : null; } catch (e) {}
  }
  if (['hub', 'arc'].includes(G.screen)) draw();
}
function arcInit() { if (ARC.loaded || !live()) return; ARC.loaded = true; myHash().then(() => { Object.keys(ARCADE).forEach(g => loadBoard(g)); checkWins(); }); }
function board(game) { return ARC.boards[periods().cur + '_' + game] || { list: [], loading: !ARC.loaded }; }

function winCards() {
  return Object.keys(ARCADE).filter(g => ARC.wins[g]).map(g => { const w = ARC.wins[g];
    return '<section class="arc-win' + (w.claimed ? ' got' : '') + '"><span class="arc-trophy" aria-hidden="true">\u{1F3C6}</span><div><b>' + (w.claimed ? 'Prize collected. Well played!' : 'You won ' + esc(ARCADE[g].name) + ' ' + prevWord() + '!') + '</b>' +
      (w.claimed ? '' : '<span>Show this screen at the counter to get: <strong>' + esc(prize()) + '</strong></span><span class="arc-live">' + esc(w.name) + ' · ' + w.score + ' points · <i data-clock>' + new Date().toLocaleTimeString('en-IN') + '</i></span>') + '</div></section>';
  }).join('');
}
function prizeLine() {
  if (!prize()) return '';
  return '<p class="arc-prize"><span aria-hidden="true">\u{1F381}</span><span><b>' + esc(prize()) + '</b> for the #1 player ' + curWord() + '. The top score when the cafe closes' + (periodMode() === 'week' ? ' on Sunday' : '') + ' wins. Come back and show your phone to collect it.</span></p>';
}
function championsHtml() {
  if (!opts || !opts.cafeId) return '';
  arcInit();
  const card = (g) => { const b = board(g), top = b.list[0];
    return '<button type="button" class="arc-card arc-' + g + '" data-g="arc" data-k="' + g + '"><span class="arc-art">' + ARC_ART[g] + '</span><b>' + esc(ARCADE[g].name) + '</b>' +
      '<span>' + (top ? '\u{1F451} ' + esc(top.name) + ', ' + top.score : live() ? (b.loading ? 'Loading scores…' : 'No scores yet. Be the first!') : 'Leaderboard game') + '</span><i>' + (prize() ? 'Play & win' : 'Leaderboard') + '</i></button>';
  };
  return winCards() + '<h3 class="g-h">Cafe champions</h3>' + prizeLine() + '<div class="g-grid arc-grid">' + card('stack') + card('rush') + '</div>';
}
function boardHtml(game, highlight) {
  if (!live()) return '<p class="g-note">' + (opts && opts.demo ? 'Demo cafe: scores aren’t saved here. At a real cafe, everyone’s best score shows on the cafe leaderboard.' : '') + '</p>';
  const b = board(game);
  if (!b.list.length) return '<div class="arc-board"><p class="g-note">' + (b.loading ? 'Loading the leaderboard…' : b.err ? 'Couldn’t load the leaderboard. Check your internet.' : 'No scores ' + curWord() + ' yet. Be the first on the board!') + '</p></div>';
  return '<ol class="arc-board">' + b.list.map((x, i) => '<li class="' + (x.pidh === ARC.pidh ? 'me' : '') + (highlight && x.pidh === ARC.pidh ? ' flash' : '') + '"><span class="arc-rank">' + (i < 3 ? ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] : i + 1) + '</span><span class="arc-name">' + esc(x.name) + (x.table ? '<small>Table ' + x.table + '</small>' : '') + '</span><b>' + x.score + '</b></li>').join('') + '</ol>';
}
const myBest = (game) => ls.get('yuno:best:' + (opts && opts.cafeId) + ':' + periods().cur + '_' + game, 0) || 0;
function nameField() {
  const n = ls.get('yumotap:gname', '');
  return '<form class="g-form arc-nameform" data-form="arcname"><label class="g-field"><span>Your name on the leaderboard</span><input name="name" maxlength="14" autocomplete="nickname" value="' + esc(n) + '" placeholder="Like Anu or Team 4" required></label></form>';
}
function arcLobbyHtml() {
  const g = G.game, A = ARCADE[g];
  const canPost = live() && opts.inCafe;
  return frame(A.name, winCards() + '<div class="arc-hero arc-' + g + '"><span class="arc-art big">' + ARC_ART[g] + '</span><p>' + esc(A.how) + '</p></div>' +
    prizeLine() + (live() && !canPost ? '<p class="g-note arc-warn">Scan the QR code on your table to put your score on the leaderboard. You can still play for fun.</p>' : '') +
    (canPost ? nameField() : '') + (G.err ? '<p class="g-err" role="alert">' + esc(G.err) + '</p>' : '') +
    '<button type="button" class="g-btn arc-play" data-g="arc-start">Play</button>' +
    (myBest(g) ? '<p class="g-note">Your best ' + curWord() + ': <b>' + myBest(g) + '</b></p>' : '') +
    '<h3 class="g-h">Top 10 ' + curWord() + '</h3>' + boardHtml(g) + (live() ? '<button type="button" class="g-btn ghost" data-g="arc-refresh">Refresh</button>' : ''), 'hub');
}
function arcPlayHtml() {
  return '<div class="g-fullbar"><button type="button" class="g-icon" data-g="arc-quit" aria-label="Stop game">✕</button><b>' + esc(ARCADE[G.game].name) + '</b><span></span></div><div class="arc-stage" id="arc-stage"></div>';
}
function arcRun() {
  arcStop();
  const host = layer.querySelector('#arc-stage'); if (!host) return;
  const game = G.game;
  requestAnimationFrame(() => { if (G.screen !== 'arcplay') return; arcRunner = startArcade(host, game, (score) => { arcRunner = null; arcFinish(game, score); }); });
}
async function arcFinish(game, score) {
  const best = myBest(game), isBest = score > best;
  go('arcover', { game, score, isBest, saving: false, saved: false, note: '' });
  if (!live() || !opts.inCafe || !isBest || score <= 0) return;
  const name = String(ls.get('yumotap:gname', '') || '').trim().slice(0, 14);
  if (!name) { G.note = 'Add your name before playing to join the leaderboard.'; draw(); return; }
  G.saving = true; draw();
  try {
    const pidh = await myHash(), period = periods().cur, pg = period + '_' + game;
    const { db, doc, setDoc, serverTimestamp } = await FB();
    await setDoc(doc(db, 'cafes', opts.cafeId, 'scores', pg + '_' + pidh), {
      pg, game, period, name, pidh, table: Math.max(0, Math.min(100, parseInt(opts.table, 10) || 0)), score: Math.min(ARCADE[game].max, Math.floor(score)), at: serverTimestamp()
    });
    G.saved = true; ls.set('yuno:best:' + opts.cafeId + ':' + periods().cur + '_' + game, score);
  } catch (e) { G.note = e && e.code === 'permission-denied' ? 'This score couldn’t be saved. The cafe may have removed this name.' : 'Couldn’t save your score. Check your internet.'; }
  G.saving = false;
  if (G.screen === 'arcover') draw();
  await loadBoard(game, true);
}
function arcOverHtml() {
  const g = G.game, b = board(g), i = b.list.findIndex(x => x.pidh === ARC.pidh);
  const rank = i >= 0 && G.saved ? '<p class="arc-rankline">' + (i === 0 ? '\u{1F451} You’re #1 ' + curWord() + '!' : 'You’re #' + (i + 1) + ' ' + curWord()) + '</p>' : '';
  return frame(ARCADE[g].name, '<div class="arc-over"><p class="arc-k">Your score</p><p class="arc-score">' + G.score + '</p>' +
    (G.isBest && G.score > 0 ? '<p class="arc-best">New best ' + curWord() + '!</p>' : '<p class="g-note">Your best ' + curWord() + ': ' + myBest(g) + '</p>') +
    (G.saving ? '<p class="g-note">Saving to the leaderboard…</p>' : '') + rank + (G.note ? '<p class="g-note arc-warn">' + esc(G.note) + '</p>' : '') +
    '<div class="g-row"><button type="button" class="g-btn" data-g="arc-start">Play again</button><button type="button" class="g-btn ghost" data-g="hub">Other games</button></div></div>' +
    '<h3 class="g-h">Top 10 ' + curWord() + '</h3>' + boardHtml(g, true), 'arc');
}
// The winner card shows a ticking clock, so staff know it's live on the phone and not a screenshot.
setInterval(() => { if (layer && !layer.hidden) layer.querySelectorAll('[data-clock]').forEach(el => { el.textContent = new Date().toLocaleTimeString('en-IN'); }); }, 1000);
