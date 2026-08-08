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

// register slices per clef (inclusive pool indices)
const REGISTER_RANGES = {
  treble: { low: [0, 4], mid: [4, 8], high: [8, 12] },
  bass:   { low: [0, 4], mid: [3, 7], high: [6, 10] },
};
const REGISTER_LABELS = { low: '低', mid: '中', high: '高' };
const REGISTER_HINT = {
  treble: { low: 'C3–G3', mid: 'G3–D4', high: 'D4–A4' },
  bass:   { low: 'G1–D2', mid: 'C2–G2', high: 'F2–C3' },
};

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
  sound:       false,
  hideStaff:   false,
  registers:   ['low', 'mid', 'high'],
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

// Random scale intervals between chord notes (in scale steps). Thirds stay
// the most common, but fourths/fifths/sixths (and occasionally seconds) also
// appear, so chords are not always stacked thirds.
const CHORD_INTERVALS = [2, 3, 3, 3, 3, 4, 4, 5, 5, 6];

function pickNotes(pool, count) {
  if (count === 1) {
    return [pool[randInt(0, pool.length - 1)]];
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const start = randInt(0, pool.length - 1);
    const out = [pool[start]];
    let idx = start;
    let ok = true;
    for (let i = 1; i < count; i++) {
      idx += CHORD_INTERVALS[randInt(0, CHORD_INTERVALS.length - 1)];
      if (idx >= pool.length) { ok = false; break; }
      out.push(pool[idx]);
    }
    if (ok) return out;
  }
  // fallback — stacked thirds, like before
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

function poolForClef(clef) {
  const full = clef === 'treble' ? TREBLE_NOTES : BASS_NOTES;
  const regs = settings.registers || [];
  if (regs.length === 0) return full;
  const idx = new Set();
  regs.forEach(r => {
    const rng = REGISTER_RANGES[clef] && REGISTER_RANGES[clef][r];
    if (rng) for (let i = rng[0]; i <= rng[1]; i++) idx.add(i);
  });
  const pool = [];
  idx.forEach(i => { if (i >= 0 && i < full.length) pool.push(full[i]); });
  return pool.length > 0 ? pool : full;
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
    const pool = poolForClef(clef);
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
  const pool = poolForClef(clef);
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
  if (settings.hideStaff) renderStaff(exercise);
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
  let clefLabelText = clefText + ' · ' + KEY_LABELS[exercise.key];
  const regs = (settings.registers || []).filter(r =>
    REGISTER_RANGES[exercise.clef] && REGISTER_RANGES[exercise.clef][r]
  );
  if (regs.length > 0 && regs.length < 3) {
    clefLabelText += ' · ' + regs.map(r => REGISTER_LABELS[r] + '音域').join('/');
  }
  clefLabel.textContent = clefLabelText;
  const scoreBar = document.querySelector('.score-bar');
  scoreBar.style.display = settings.endless ? 'none' : '';
  if (settings.hideStaff) {
    staffPanel.innerHTML = '<p class="staff-hidden-hint">🎧 谱面已隐藏 · 提交答案后显示</p>';
  } else {
    renderStaff(exercise);
  }
  syncSoundUI();
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
const registerGrid   = document.getElementById('registerGrid');
const noteGrid       = document.getElementById('noteGrid');
const quickSelects   = document.getElementById('quickSelects');
const chordMinEl     = document.getElementById('chordMin');
const chordMaxEl     = document.getElementById('chordMax');
const timerDurEl     = document.getElementById('timerDuration');
const endlessEl      = document.getElementById('endlessMode');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const hideStaffModeEl = document.getElementById('hideStaffMode');

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

  // ── register chips ──
  registerGrid.innerHTML = '';
  ['low', 'mid', 'high'].forEach(r => {
    const chip = document.createElement('button');
    chip.className = 'key-chip' + (settingsDraft.registers.includes(r) ? ' active' : '');
    chip.textContent = REGISTER_LABELS[r];
    chip.title = '高音谱号 ' + REGISTER_HINT.treble[r] + ' · 低音谱号 ' + REGISTER_HINT.bass[r];
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
    });
    registerGrid.appendChild(chip);
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
  hideStaffModeEl.checked = settingsDraft.hideStaff;
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

  // register
  settingsDraft.registers = [];
  registerGrid.querySelectorAll('.key-chip.active').forEach(chip => {
    const label = chip.textContent;
    const entry = Object.entries(REGISTER_LABELS).find(([, v]) => v === label);
    if (entry) settingsDraft.registers.push(entry[0]);
  });
  if (settingsDraft.registers.length === 0) settingsDraft.registers = ['low', 'mid', 'high'];

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

  // hide staff (listen mode)
  settingsDraft.hideStaff = hideStaffModeEl.checked;

  // commit draft → settings
  settings = JSON.parse(JSON.stringify(settingsDraft));

  // hiding the staff only makes sense when sound is on
  if (settings.hideStaff && !settings.sound) {
    settings.sound = true;
    updateSoundToggleUI();
  }

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

// ═══════════════ piano sound (Web Audio, off by default) ═══════════════
let audioCtx = null;
let noiseBuffer = null;
let masterCompressor = null;
const activeNotes = new Set();

function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctx();
      masterCompressor = audioCtx.createDynamicsCompressor();
      masterCompressor.threshold.value = -14;
      masterCompressor.knee.value = 18;
      masterCompressor.ratio.value = 6;
      masterCompressor.attack.value = 0.002;
      masterCompressor.release.value = 0.18;
      masterCompressor.connect(audioCtx.destination);
    } catch (_) {
      audioCtx = null;
      masterCompressor = null;
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    try { audioCtx.resume(); } catch (_) {}
  }
  return audioCtx;
}

// ABC note string -> MIDI number (c = C4 in ABC convention)
function abcToMidi(abc, pitchAcc) {
  const letter = abc[0].toLowerCase();
  const semis = { c:0, d:2, e:4, f:5, g:7, a:9, b:11 }[letter] ?? 0;
  let octave = abc[0] === abc[0].toLowerCase() ? 4 : 3; // lowercase=oct4, uppercase=oct3
  for (const ch of abc) {
    if (ch === ',') octave -= 1;
    if (ch === "'") octave += 1;
  }
  let midi = (octave + 1) * 12 + semis;
  if (pitchAcc === '#') midi += 1;
  if (pitchAcc === 'b') midi -= 1;
  return midi;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Piano-ish additive synthesis: 8 partials with slight inharmonicity,
// double-string detuning, a hammer noise transient, damping lowpass,
// and pitch-dependent decay (low notes ring longer).
const PIANO_PARTIALS = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
  n,
  a: Math.pow(0.72, n - 1),
}));

function getNoiseBuffer(ctx) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    const len = Math.floor(ctx.sampleRate * 0.12);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function pianoDuration(freq) {
  return Math.max(1.2, Math.min(5.0, 5.5 * Math.pow(130 / freq, 0.5)));
}

function playPianoNote(freq, when) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const dur = pianoDuration(freq);
  const bright = Math.min(1, freq / 900);
  const peak = 0.13 * (0.45 + 0.75 * bright);

  const noteMaster = ctx.createGain();
  noteMaster.connect(masterCompressor);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(6500, freq * 6 + 1300);
  lp.Q.value = 0.4;
  lp.connect(noteMaster);

  const sources = [];
  const envGains = [];

  for (const p of PIANO_PARTIALS) {
    // string inharmonicity: higher partials stretch slightly sharper
    const f = freq * p.n * Math.sqrt(1 + 0.00045 * p.n * p.n);
    const amp = peak * p.a;
    for (const detune of [-1, 1]) {
      const g = ctx.createGain();
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = detune * 1.2; // cents — subtle double-string beating
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp / 2), when + 0.005); // attack
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, (amp / 2) * 0.35), when + 0.06); // initial decay
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur); // ringing tail
      o.connect(g);
      g.connect(lp);
      o.start(when);
      o.stop(when + dur + 0.05);
      sources.push(o);
      envGains.push(g);
    }
  }

  // hammer: brief filtered noise burst at the attack
  const nsrc = ctx.createBufferSource();
  nsrc.buffer = getNoiseBuffer(ctx);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.09 * bright + 0.03, when);
  ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(5200, freq * 7 + 900);
  bp.Q.value = 0.9;
  nsrc.connect(bp);
  bp.connect(ng);
  ng.connect(noteMaster);
  nsrc.start(when);
  nsrc.stop(when + 0.06);
  sources.push(nsrc);

  const note = { master: noteMaster, sources, gains: envGains };
  activeNotes.add(note);
  sources[0].onended = () => {
    activeNotes.delete(note);
    try { noteMaster.disconnect(); } catch (_) {}
  };
}

function stopAllVoices() {
  const now = audioCtx ? audioCtx.currentTime : 0;
  for (const n of activeNotes) {
    for (const s of n.sources) {
      try { s.stop(); } catch (_) {}
    }
    for (const g of n.gains) {
      try { g.gain.cancelScheduledValues(now); } catch (_) {}
      try { g.gain.setValueAtTime(0.0001, now); } catch (_) {}
    }
    try { n.master.disconnect(); } catch (_) {}
  }
  activeNotes.clear();
}

function playExerciseSound(ex) {
  try {
    stopAllVoices();
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime + 0.03;
    ex.notes.forEach(n => {
      playPianoNote(midiToFreq(abcToMidi(n.abc, n.pitchAcc)), now);
    });
  } catch (_) {}
}

function syncSoundUI() {
  if (settings.sound) {
    if (exercise) playExerciseSound(exercise);
  } else {
    stopAllVoices();
  }
}

function updateSoundToggleUI() {
  soundToggleBtn.textContent = settings.sound ? '🔊 声音' : '🔇 声音';
  soundToggleBtn.classList.toggle('active', settings.sound);
  soundToggleBtn.title = settings.sound ? '关闭钢琴音' : '开启钢琴音（出题时自动播放）';
}

function toggleSound() {
  settings.sound = !settings.sound;
  if (!settings.sound && settings.hideStaff) {
    settings.hideStaff = false;
    if (exercise) renderStaff(exercise);
  }
  updateSoundToggleUI();
  if (settings.sound) {
    if (exercise) playExerciseSound(exercise);
  } else {
    stopAllVoices();
  }
}

// ═══════════════ event binding ═══════════════
submitBtn.addEventListener('click', submit);
soundToggleBtn.addEventListener('click', toggleSound);
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
  updateSoundToggleUI();
  loadExercise();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
