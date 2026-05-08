// ═══════════════ key signatures ═══════════════
// maps note letter → '#' or 'b' (only notes affected by the key)
const KEYS = {
  'C':  {},
  'G':  { f: '#' },
  'D':  { f: '#', c: '#' },
  'A':  { f: '#', c: '#', g: '#' },
  'E':  { f: '#', c: '#', g: '#', d: '#' },
  'F':  { b: 'b' },
  'Bb': { b: 'b', e: 'b' },
  'Eb': { b: 'b', e: 'b', a: 'b' },
};

const KEY_LABELS = {
  'C':  'C大调', 'G': 'G大调', 'D': 'D大调', 'A': 'A大调',
  'E':  'E大调', 'F': 'F大调', 'Bb': '降B大调', 'Eb': '降E大调',
};

const SOLFEGE_BASE = { c:'do', d:'re', e:'mi', f:'fa', g:'sol', a:'la', b:'si' };
const LETTER_BASE  = { c:'C',  d:'D',  e:'E',  f:'F',  g:'G',  a:'A',  b:'B'  };

// ═══════════════ note pools (staff position only) ═══════════════
const TREBLE_NOTES = [
  { abc:'C',  letter:'c' }, { abc:'D', letter:'d' }, { abc:'E', letter:'e' },
  { abc:'F',  letter:'f' }, { abc:'G', letter:'g' }, { abc:'A', letter:'a' },
  { abc:'B',  letter:'b' }, { abc:'c', letter:'c' }, { abc:'d', letter:'d' },
  { abc:'e',  letter:'e' }, { abc:'f', letter:'f' }, { abc:'g', letter:'g' },
  { abc:'a',  letter:'a' },
];

const BASS_NOTES = [
  { abc:'G,,', letter:'g' }, { abc:'A,,', letter:'a' }, { abc:'B,,', letter:'b' },
  { abc:'C,',  letter:'c' }, { abc:'D,',  letter:'d' }, { abc:'E,',  letter:'e' },
  { abc:'F,',  letter:'f' }, { abc:'G,',  letter:'g' }, { abc:'A,',  letter:'a' },
  { abc:'B,',  letter:'b' }, { abc:'C',   letter:'c' },
];

// ═══════════════ dom refs ═══════════════
const container   = document.getElementById('container');
const clefLabel   = document.getElementById('clef-label');
const timerBar    = document.getElementById('timerBar');
const staffPanel  = document.getElementById('staffPanel');
const answerInput = document.getElementById('answerInput');
const answerLabel = document.getElementById('answerLabel');
const submitBtn   = document.getElementById('submitBtn');
const feedback    = document.getElementById('feedback');
const correctEl   = document.getElementById('correctCount');
const wrongEl     = document.getElementById('wrongCount');
const totalEl     = document.getElementById('totalCount');
const modeSolfege = document.getElementById('modeSolfege');
const modeLetter  = document.getElementById('modeLetter');

// ═══════════════ state ═══════════════
let answerMode = 'solfege'; // 'solfege' | 'letter'
let exercise  = null;       // { clef, key, notes:[{abc, letter, extraAcc, pitchAcc}] }
let phase     = 'answering';
let timerId   = null;
let timerStart = 0;
let timerDuration = 10000; // overridden by settings

// ═══════════════ settings ═══════════════
const LETTERS = ['c','d','e','f','g','a','b'];
const DEFAULT_NOTES = {};
LETTERS.forEach(l => { DEFAULT_NOTES[l] = { nat: true, sharp: true, flat: true }; });
// Disable enharmonically rare ones by default
DEFAULT_NOTES['e'].sharp = false;
DEFAULT_NOTES['e'].flat  = false;
DEFAULT_NOTES['b'].sharp = false;

const DEFAULT_SETTINGS = {
  keys:        ['C','G','D','F'],
  clefs:       ['treble','bass'],
  notes:       JSON.parse(JSON.stringify(DEFAULT_NOTES)),
  chordMin:    1,
  chordMax:    3,
  timerSeconds: 10,
  endless:     false,
};

let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let settingsDraft = null; // working copy used by the settings panel

// ═══════════════ accidentals & answer formatting ═══════════════
function effectiveAccidental(letter, keySig, extraAcc) {
  if (extraAcc === '=') return '';
  if (extraAcc === '#' || extraAcc === 'b') return extraAcc;
  return keySig[letter] || '';
}

// Suffix notation: do do# dob  (accidental AFTER the base name)
function noteNameSolfege(letter, pitchAcc) {
  return SOLFEGE_BASE[letter] + (pitchAcc === '#' ? '#' : pitchAcc === 'b' ? 'b' : '');
}

function noteNameLetter(letter, pitchAcc) {
  return LETTER_BASE[letter] + (pitchAcc === '#' ? '#' : pitchAcc === 'b' ? 'b' : '');
}

function noteName(letter, pitchAcc, mode) {
  return mode === 'solfege' ? noteNameSolfege(letter, pitchAcc) : noteNameLetter(letter, pitchAcc);
}

function answerString(ex, mode) {
  return ex.notes.map(n => noteName(n.letter, n.pitchAcc, mode)).join(' ');
}

// Convert note letter → ABC accidental prefix (^ = sharp, _ = flat, = = natural)
function abcNote(abc, extraAcc) {
  if (!extraAcc) return abc;
  if (extraAcc === '#') return '^' + abc;
  if (extraAcc === 'b') return '_' + abc;
  return '=' + abc;
}

function buildAllowedPitches(noteSettings) {
  const s = new Set();
  for (const [letter, accs] of Object.entries(noteSettings)) {
    if (accs.nat)   s.add(letter);
    if (accs.sharp) s.add(letter + '#');
    if (accs.flat)  s.add(letter + 'b');
  }
  return s;
}

function pitchKey(letter, pitchAcc) {
  return letter + (pitchAcc || '');
}

// ═══════════════ exercise generation ═══════════════
function randomExtraAccidental(letter, keySig) {
  const keyAcc = keySig[letter];
  const r = Math.random();
  if (keyAcc) {
    if (r < 0.30) return '=';
    return '';
  } else {
    if (r < 0.14) return '#';
    if (r < 0.28) return 'b';
    return '';
  }
}

function pickNotes(pool, count) {
  if (count === 1) {
    return [pool[randInt(0, pool.length - 1)]];
  }
  const maxStart = pool.length - (count - 1) * 2 - 1;
  if (maxStart < 0) {
    const start = randInt(0, pool.length - count);
    return pool.slice(start, start + count);
  }
  const start = randInt(0, maxStart);
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[start + i * 2]);
  return out;
}

function generateExercise() {
  const allowedPitches = buildAllowedPitches(settings.notes);
  if (allowedPitches.size === 0) {
    // all disabled — fallback to all natural notes
    LETTERS.forEach(l => allowedPitches.add(l));
  }

  const availableKeys = Object.keys(KEYS).filter(k => settings.keys.includes(k));
  if (availableKeys.length === 0) availableKeys.push('C');

  const chordMin = Math.max(1, Math.min(5, settings.chordMin));
  const chordMax = Math.max(chordMin, Math.min(5, settings.chordMax));

  for (let attempt = 0; attempt < 80; attempt++) {
    const allowedClefs = settings.clefs.length > 0 ? settings.clefs : ['treble'];
    const clef = allowedClefs[randInt(0, allowedClefs.length - 1)];
    const pool = clef === 'treble' ? TREBLE_NOTES : BASS_NOTES;
    const key = availableKeys[randInt(0, availableKeys.length - 1)];
    const keySig = KEYS[key];
    const chordSize = chordMin === chordMax ? chordMin : randInt(chordMin, chordMax);

    const positions = pickNotes(pool, chordSize);
    const notes = positions.map(pos => {
      const extraAcc = randomExtraAccidental(pos.letter, keySig);
      const pitchAcc = effectiveAccidental(pos.letter, keySig, extraAcc);
      return { abc: pos.abc, letter: pos.letter, extraAcc, pitchAcc };
    });

    if (notes.every(n => allowedPitches.has(pitchKey(n.letter, n.pitchAcc)))) {
      return { clef, key, notes };
    }
  }

  // fallback — return last attempt anyway
  const fallbackClefs = settings.clefs.length > 0 ? settings.clefs : ['treble'];
  const clef = fallbackClefs[randInt(0, fallbackClefs.length - 1)];
  const pool = clef === 'treble' ? TREBLE_NOTES : BASS_NOTES;
  const key = availableKeys[randInt(0, availableKeys.length - 1)];
  const keySig = KEYS[key];
  const chordSize = chordMin === chordMax ? chordMin : randInt(chordMin, chordMax);
  const positions = pickNotes(pool, chordSize);
  const notes = positions.map(pos => {
    const extraAcc = randomExtraAccidental(pos.letter, keySig);
    const pitchAcc = effectiveAccidental(pos.letter, keySig, extraAcc);
    return { abc: pos.abc, letter: pos.letter, extraAcc, pitchAcc };
  });
  return { clef, key, notes };
}

function randInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

// ═══════════════ abc rendering ═══════════════
function buildABC({ clef, key, notes }) {
  const noteList = notes.map(n => abcNote(n.abc, n.extraAcc));
  const noteStr = notes.length === 1
    ? noteList[0] + '4'
    : '[' + noteList.join(' ') + ']4';
  return `X:1\nM:4/4\nL:1/4\nK:${key} clef=${clef}\n${noteStr}|]`;
}

function renderStaff(ex) {
  staffPanel.innerHTML = '';
  ABCJS.renderAbc('staffPanel', buildABC(ex), {
    staffwidth: 270,
    scale: 1.55,
    paddingtop: 28,
    paddingbottom: 28,
    paddingleft: 38,
    paddingright: 38,
  });
  if (!staffPanel.querySelector('svg')) {
    staffPanel.innerHTML = '<p style="color:#b06060;padding:20px">五线谱渲染失败，请刷新重试。</p>';
  }
}

// ═══════════════ answer checking ═══════════════
function normalize(str) {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

function check(raw) {
  return normalize(raw) === answerString(exercise, answerMode).toLowerCase();
}

// ═══════════════ UI transitions ═══════════════
function setPhase(p) {
  phase = p;
  if (p === 'answering') {
    submitBtn.textContent = '提交';
    answerInput.disabled = false;
    answerInput.value = '';
    feedback.textContent = '';
    feedback.className = 'feedback';
    container.className = 'container';
    answerInput.focus();
    const dur = getTimerMs();
    document.querySelector('.timer-wrap').style.display = dur === 0 ? 'none' : '';
    startTimer();
  } else {
    submitBtn.textContent = '下一题';
    answerInput.disabled = true;
    stopTimer();
  }
}

function showFeedback(userAnswer, correct, isTimeout) {
  const correctAns = answerString(exercise, answerMode);
  if (correct) {
    feedback.textContent = '正确！' + correctAns;
    feedback.className = 'feedback correct-msg';
    container.className = 'container correct';
  } else if (isTimeout) {
    feedback.textContent = '时间到！正确答案是：' + correctAns;
    feedback.className = 'feedback wrong-msg';
    container.className = 'container wrong';
  } else {
    const userPart = userAnswer ? '（你的答案：' + userAnswer + '）' : '';
    feedback.textContent = '错误。正确答案是：' + correctAns + userPart;
    feedback.className = 'feedback wrong-msg';
    container.className = 'container wrong';
  }
}

function updateScore(correct) {
  if (settings.endless) return;
  if (correct) correctEl.textContent = +correctEl.textContent + 1;
  else          wrongEl.textContent   = +wrongEl.textContent + 1;
  totalEl.textContent = +correctEl.textContent + +wrongEl.textContent;
}

// ═══════════════ timer ═══════════════
function getTimerMs() {
  return Math.max(0, settings.timerSeconds) * 1000;
}

function startTimer() {
  stopTimer();
  const dur = getTimerMs();
  if (dur === 0) {
    timerBar.style.width = '100%';
    timerBar.classList.remove('warn');
    return; // no timer
  }
  timerBar.style.width = '100%';
  timerBar.classList.remove('warn');
  timerStart = performance.now();
  timerId = setInterval(tick, 80);
}

function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

function tick() {
  const dur = getTimerMs();
  if (dur === 0) return;
  const elapsed = performance.now() - timerStart;
  const pct = Math.max(0, 100 * (1 - elapsed / dur));
  timerBar.style.width = pct.toFixed(1) + '%';
  if (pct < 30) timerBar.classList.add('warn');
  if (elapsed >= dur) {
    stopTimer();
    timerBar.style.width = '0%';
    revealAnswer('', true);
  }
}

function revealAnswer(userAnswer, isTimeout) {
  if (phase !== 'answering') return;
  phase = 'showing_result';
  stopTimer();
  answerInput.disabled = true;
  submitBtn.textContent = '下一题';
  const correct = !isTimeout && userAnswer !== '' && check(userAnswer);
  showFeedback(userAnswer, correct, isTimeout);
  updateScore(correct);
}

// ═══════════════ submit handler ═══════════════
let submitLock = false;
function submit() {
  if (!exercise || submitLock) return;
  if (phase === 'answering') {
    const raw = answerInput.value.trim();
    if (!raw) return;
    submitLock = true;
    revealAnswer(raw, false);
    // release lock after a short delay so the same keypress can't trigger document handler
    setTimeout(() => { submitLock = false; }, 150);
  } else {
    submitLock = true;
    loadExercise();
    setTimeout(() => { submitLock = false; }, 150);
  }
}

// ═══════════════ mode toggle ═══════════════
function setAnswerMode(mode) {
  answerMode = mode;
  if (mode === 'solfege') {
    modeSolfege.classList.add('active');
    modeLetter.classList.remove('active');
    answerLabel.textContent = '用空格分隔，从低到高，升降号写在音名后面（例：do# sib re）';
    answerInput.placeholder = '例: do# mi sol';
  } else {
    modeLetter.classList.add('active');
    modeSolfege.classList.remove('active');
    answerLabel.textContent = '用空格分隔，从低到高，升降号写在音名后面（例：C# Bb D）';
    answerInput.placeholder = '例: C# E G';
  }
  if (phase === 'showing_result') {
    const correctAns = answerString(exercise, answerMode);
    feedback.textContent = feedback.textContent.replace(/：.+/, '：' + correctAns);
  }
}

modeSolfege.addEventListener('click', () => setAnswerMode('solfege'));
modeLetter.addEventListener('click',  () => setAnswerMode('letter'));

// ═══════════════ load exercise ═══════════════
function loadExercise() {
  exercise = generateExercise();
  const clefText = exercise.clef === 'treble' ? '高音谱号' : '低音谱号';
  clefLabel.textContent = clefText + ' · ' + KEY_LABELS[exercise.key];
  const scoreBar = document.querySelector('.score-bar');
  scoreBar.style.display = settings.endless ? 'none' : '';
  renderStaff(exercise);
  setPhase('answering');
  // reset scores when switching to endless mode
  if (settings.endless) {
    correctEl.textContent = '0';
    wrongEl.textContent = '0';
    totalEl.textContent = '0';
  }
}

// ═══════════════ settings panel ═══════════════
const settingsOverlay = document.getElementById('settingsOverlay');
const gearBtn        = document.getElementById('gearBtn');
const keyGrid        = document.getElementById('keyGrid');
const clefGrid       = document.getElementById('clefGrid');
const noteGrid       = document.getElementById('noteGrid');
const quickSelects   = document.getElementById('quickSelects');
const chordMinEl     = document.getElementById('chordMin');
const chordMaxEl     = document.getElementById('chordMax');
const timerDurEl     = document.getElementById('timerDuration');
const endlessEl      = document.getElementById('endlessMode');

function openSettings() {
  settingsDraft = JSON.parse(JSON.stringify(settings));
  renderSettingsPanel();
  settingsOverlay.classList.add('open');
}

function closeSettings() {
  settingsOverlay.classList.remove('open');
}

function renderSettingsPanel() {
  // ── key chips ──
  keyGrid.innerHTML = '';
  Object.keys(KEYS).forEach(k => {
    const chip = document.createElement('button');
    chip.className = 'key-chip' + (settingsDraft.keys.includes(k) ? ' active' : '');
    chip.textContent = KEY_LABELS[k];
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
    });
    keyGrid.appendChild(chip);
  });

  // ── clef chips ──
  clefGrid.querySelectorAll('.key-chip').forEach(chip => {
    const clef = chip.dataset.clef;
    chip.classList.toggle('active', settingsDraft.clefs.includes(clef));
  });

  // ── quick-select buttons ──
  quickSelects.innerHTML = '';
  const qsDefs = [
    ['全部',   () => { setAllNotes(true, true, true); renderNoteGrid(); }],
    ['自然音', () => { setAllNotes(true, false, false); renderNoteGrid(); }],
    ['含升号', () => { setAllNotes(true, true, false); renderNoteGrid(); }],
    ['含降号', () => { setAllNotes(true, false, true); renderNoteGrid(); }],
    ['全不选', () => { setAllNotes(false, false, false); renderNoteGrid(); }],
  ];
  qsDefs.forEach(([label, fn]) => {
    const btn = document.createElement('button');
    btn.className = 'qs-btn';
    btn.textContent = label;
    btn.addEventListener('click', fn);
    quickSelects.appendChild(btn);
  });

  renderNoteGrid();

  // ── form values ──
  chordMinEl.value = settingsDraft.chordMin;
  chordMaxEl.value = settingsDraft.chordMax;
  timerDurEl.value = settingsDraft.timerSeconds;
  endlessEl.checked = settingsDraft.endless;
}

function setAllNotes(nat, sharp, flat) {
  LETTERS.forEach(l => {
    settingsDraft.notes[l].nat   = nat;
    settingsDraft.notes[l].sharp = sharp;
    settingsDraft.notes[l].flat  = flat;
  });
}

function renderNoteGrid() {
  noteGrid.innerHTML = '';
  noteGrid.appendChild(cell('', 'note-col-header'));
  noteGrid.appendChild(cell('♮', 'note-col-header'));
  noteGrid.appendChild(cell('#', 'note-col-header'));
  noteGrid.appendChild(cell('b', 'note-col-header'));

  LETTERS.forEach(l => {
    const ns = settingsDraft.notes[l];
    noteGrid.appendChild(cell(SOLFEGE_BASE[l], 'note-row-label'));
    noteGrid.appendChild(toggleCell(l, '', ns.nat));
    noteGrid.appendChild(toggleCell(l, '#', ns.sharp));
    noteGrid.appendChild(toggleCell(l, 'b', ns.flat));
  });
}

function cell(text, cls) {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  return div;
}

function toggleCell(letter, acc, active) {
  const label = acc === '#' ? SOLFEGE_BASE[letter] + '#' : acc === 'b' ? SOLFEGE_BASE[letter] + 'b' : SOLFEGE_BASE[letter];
  const btn = document.createElement('button');
  btn.className = 'note-toggle' + (active ? ' active' : '');
  btn.textContent = label;
  btn.title = label;
  btn.addEventListener('click', () => {
    const key = acc === '#' ? 'sharp' : acc === 'b' ? 'flat' : 'nat';
    settingsDraft.notes[letter][key] = !settingsDraft.notes[letter][key];
    btn.classList.toggle('active');
  });
  return btn;
}

function applySettings() {
  // read key chips into draft
  settingsDraft.keys = [];
  keyGrid.querySelectorAll('.key-chip.active').forEach(chip => {
    const label = chip.textContent;
    const entry = Object.entries(KEY_LABELS).find(([,v]) => v === label);
    if (entry) settingsDraft.keys.push(entry[0]);
  });
  if (settingsDraft.keys.length === 0) settingsDraft.keys = ['C'];

  // read clef chips
  settingsDraft.clefs = [];
  clefGrid.querySelectorAll('.key-chip.active').forEach(chip => {
    if (chip.dataset.clef) settingsDraft.clefs.push(chip.dataset.clef);
  });
  if (settingsDraft.clefs.length === 0) settingsDraft.clefs = ['treble'];

  // chord range
  let cMin = parseInt(chordMinEl.value) || 1;
  let cMax = parseInt(chordMaxEl.value) || 1;
  cMin = Math.max(1, Math.min(5, cMin));
  cMax = Math.max(1, Math.min(5, cMax));
  settingsDraft.chordMin = Math.min(cMin, cMax);
  settingsDraft.chordMax = Math.max(cMin, cMax);

  // timer
  settingsDraft.timerSeconds = Math.max(0, Math.min(120, parseInt(timerDurEl.value) || 0));

  // endless
  settingsDraft.endless = endlessEl.checked;

  // commit draft → settings
  settings = JSON.parse(JSON.stringify(settingsDraft));

  closeSettings();
  loadExercise();
}

function resetSettings() {
  settingsDraft = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  renderSettingsPanel();
}

// clef chips — event delegation (static HTML, not rebuilt)
clefGrid.addEventListener('click', e => {
  const chip = e.target.closest('.key-chip');
  if (chip) chip.classList.toggle('active');
});

// settings panel events
gearBtn.addEventListener('click', openSettings);
document.getElementById('settingsClose').addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', e => {
  if (e.target === settingsOverlay) closeSettings();
});
document.getElementById('applySettings').addEventListener('click', applySettings);
document.getElementById('resetSettings').addEventListener('click', resetSettings);

// ═══════════════ event binding ═══════════════
submitBtn.addEventListener('click', submit);
answerInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.repeat) {
    e.preventDefault();
    e.stopPropagation();
    submit();
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.repeat && phase === 'showing_result' && document.activeElement !== answerInput) {
    e.preventDefault();
    submit();
  }
});

// ═══════════════ init ═══════════════
function init() {
  if (typeof ABCJS === 'undefined') {
    staffPanel.innerHTML = '<p style="color:#b06060;padding:20px">abcjs 脚本加载失败，请检查网络连接后刷新页面重试。</p>';
    answerInput.disabled = true;
    submitBtn.disabled = true;
    return;
  }
  setAnswerMode('solfege');
  loadExercise();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
