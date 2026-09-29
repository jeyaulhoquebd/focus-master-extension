/* ========== ফোকাস মাস্টার — popup ========== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- storage helpers ---------- */
const S = {
  async get(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); },
  async set(obj)   { return new Promise(r => chrome.storage.local.set(obj, r)); },
  async del(k)     { return new Promise(r => chrome.storage.local.remove(k, r)); }
};

/* ---------- defaults ---------- */
const DEFAULTS = {
  focusState: {
    mode: 'focus', running: false, endTime: null,
    remaining: 25 * 60, total: 25 * 60, round: 1,
    focusMin: 25, breakMin: 5
  },
  blockingEnabled: false,
  blockedSites: ['facebook.com','youtube.com','instagram.com','twitter.com','x.com','reddit.com','tiktok.com'],
  notificationsOn: true,
  goal: '',
  distractions: [],
  deepWork: { start: '08:00', end: '10:00' },
  wakeTime: '06:00',
  stats: {},
  theme: 'dark'
};

/* ========== 1. THEME ========== */
const root = document.documentElement;
const themeBtn = $('#themeBtn');
async function initTheme() {
  const { theme } = await S.get('theme');
  const t = theme || 'dark';
  root.setAttribute('data-theme', t);
  themeBtn.textContent = t === 'dark' ? '🌙' : '☀️';
}
themeBtn.addEventListener('click', async () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  themeBtn.textContent = next === 'dark' ? '🌙' : '☀️';
  await S.set({ theme: next });
});

/* ========== 2. TABS ========== */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $(`.panel[data-panel="${t.dataset.tab}"]`).classList.add('active');
}));

/* ========== 3. TIMER ========== */
const RING_CIRC = 2 * Math.PI * 88;
const ringFg   = $('#ringFg');
const modeLbl  = $('#modeLabel');
const timeLbl  = $('#timeLabel');
const roundLbl = $('#roundLabel');
const startBtn = $('#startBtn');
const resetBtn = $('#resetBtn');
const skipBtn  = $('#skipBtn');
const chips    = $$('.chip');

let state = null;
let uiInterval = null;

async function loadState() {
  const { focusState } = await S.get('focusState');
  state = focusState || { ...DEFAULTS.focusState };
  if (!state.endTime && typeof state.remaining !== 'number') state.remaining = 25 * 60;
  if (!state.total) state.total = state.focusMin * 60;
}
async function saveState() { await S.set({ focusState: state }); }

function remainingSecs() {
  if (state.running && state.endTime) {
    return Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
  }
  return state.remaining;
}
function fmt(s) {
  const m = Math.floor(s / 60), x = s % 60;
  return String(m).padStart(2,'0') + ':' + String(x).padStart(2,'0');
}
function paint() {
  const rem = remainingSecs();
  const isFocus = state.mode === 'focus';
  timeLbl.textContent  = fmt(rem);
  modeLbl.textContent  = isFocus ? 'FOCUS' : 'BREAK';
  modeLbl.style.color  = isFocus ? 'var(--accent)' : 'var(--accent-2)';
  ringFg.style.stroke  = isFocus ? 'var(--accent)' : 'var(--accent-2)';
  roundLbl.textContent = `রাউন্ড ${state.round} / ৪`;
  const prog = state.total > 0 ? rem / state.total : 0;
  ringFg.style.strokeDasharray  = RING_CIRC;
  ringFg.style.strokeDashoffset = RING_CIRC * (1 - prog);
  startBtn.textContent = state.running ? 'পজ' : (rem < state.total ? 'চালু' : 'শুরু');
}

/* -- start / pause -- */
startBtn.addEventListener('click', async () => {
  if (state.running) {
    // pause
    const rem = remainingSecs();
    state.running = false;
    state.endTime = null;
    state.remaining = rem;
    await chrome.alarms.clear('focusTimer');
  } else {
    state.running = true;
    state.endTime = Date.now() + state.remaining * 1000;
    await chrome.alarms.create('focusTimer', { when: state.endTime });
  }
  await saveState();
  paint();
});

/* -- reset -- */
resetBtn.addEventListener('click', async () => {
  await chrome.alarms.clear('focusTimer');
  state.running = false;
  state.endTime = null;
  state.mode = 'focus';
  state.round = 1;
  state.total = state.focusMin * 60;
  state.remaining = state.total;
  await saveState();
  paint();
});

/* -- skip -- */
skipBtn.addEventListener('click', async () => {
  await chrome.alarms.clear('focusTimer');
  await transitionMode(true);
  await saveState();
  paint();
});

/* -- presets -- */
chips.forEach(c => c.addEventListener('click', async () => {
  chips.forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  const [f, b] = c.dataset.preset.split(',').map(Number);
  await chrome.alarms.clear('focusTimer');
  state.focusMin = f;
  state.breakMin = b;
  state.mode = 'focus';
  state.round = 1;
  state.running = false;
  state.endTime = null;
  state.total = f * 60;
  state.remaining = state.total;
  await saveState();
  paint();
}));

async function transitionMode(manual = false) {
  const wasFocus = state.mode === 'focus';
  if (wasFocus) {
    const isLong = state.round >= 4;
    state.mode = 'break';
    state.total = (isLong ? 15 : state.breakMin) * 60;
    state.remaining = state.total;
  } else {
    state.mode = 'focus';
    state.round = Math.min(state.round + 1, 4);
    state.total = state.focusMin * 60;
    state.remaining = state.total;
  }
  state.running = false;
  state.endTime = null;
}

/* -- UI loop -- */
function startUiLoop() {
  if (uiInterval) clearInterval(uiInterval);
  uiInterval = setInterval(async () => {
    // Reload state from storage every 500ms so background changes are reflected
    const { focusState } = await S.get('focusState');
    state = focusState || state;
    paint();
    if (state.running && state.endTime && Date.now() >= state.endTime) {
      // Safety: alarm may have been missed
      await chrome.alarms.clear('focusTimer');
      await transitionMode();
      await saveState();
    }
  }, 500);
}

/* ---------- stats ---------- */
async function loadStats() {
  const { stats = {} } = await S.get('stats');
  const today = new Date().toISOString().slice(0, 10);
  const t = stats[today] || { sessions: 0, minutes: 0 };
  $('#todaySessions').textContent = t.sessions;
  $('#todayFocus').textContent    = t.minutes;

  // progress list
  const list = $('#progressList');
  list.innerHTML = '';
  const days = Object.keys(stats).sort().slice(-7).reverse();
  if (!days.length) {
    list.innerHTML = `<div class="progress-item"><span class="muted">এখনো কোনো সেশন নেই</span></div>`;
  } else {
    days.forEach(d => {
      const s = stats[d];
      const el = document.createElement('div');
      el.className = 'progress-item';
      el.innerHTML = `<span>${d}</span><span><b>${s.sessions}</b> সেশন · <b>${s.minutes}</b> মিনিট</span>`;
      list.appendChild(el);
    });
  }
}

/* ========== 4. GOAL ========== */
async function initGoal() {
  const { goal = '' } = await S.get('goal');
  $('#goalInput').value = goal;
}
$('#goalSave').addEventListener('click', async () => {
  const v = $('#goalInput').value.trim();
  await S.set({ goal: v });
  const btn = $('#goalSave');
  const old = btn.textContent;
  btn.textContent = '✅ সংরক্ষিত';
  setTimeout(() => btn.textContent = old, 1200);
});

/* ========== 5. DISTRACTIONS ========== */
let distractions = [];
function renderDist() {
  const ul = $('#distList');
  ul.innerHTML = '';
  if (!distractions.length) {
    ul.innerHTML = `<li class="empty">এখনো কিছু নেই ✨</li>`;
    return;
  }
  distractions.forEach((txt, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(txt)}</span><button title="মুছুন">✕</button>`;
    li.querySelector('button').addEventListener('click', async () => {
      distractions.splice(i, 1);
      await S.set({ distractions });
      renderDist();
    });
    ul.appendChild(li);
  });
}
async function initDist() {
  const { distractions: d = [] } = await S.get('distractions');
  distractions = d;
  renderDist();
}
$('#distAdd').addEventListener('click', addDist);
$('#distInput').addEventListener('keydown', e => { if (e.key === 'Enter') addDist(); });
async function addDist() {
  const inp = $('#distInput');
  const v = inp.value.trim();
  if (!v) return;
  distractions.push(v);
  await S.set({ distractions });
  inp.value = '';
  inp.focus();
  renderDist();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ========== 6. SITE BLOCKER ========== */
let sites = [];
function renderSites() {
  const ul = $('#siteList');
  ul.innerHTML = '';
  if (!sites.length) {
    ul.innerHTML = `<li class="empty">কোনো সাইট যোগ করা হয়নি</li>`;
    return;
  }
  sites.forEach((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>🌐 ${escapeHtml(s)}</span><button title="মুছুন">✕</button>`;
    li.querySelector('button').addEventListener('click', async () => {
      sites.splice(i, 1);
      await S.set({ blockedSites: sites });
      renderSites();
    });
    ul.appendChild(li);
  });
}
async function initBlocker() {
  const { blockingEnabled = false, blockedSites = DEFAULTS.blockedSites } = await S.get(['blockingEnabled','blockedSites']);
  sites = [...blockedSites];
  $('#blockToggle').checked = !!blockingEnabled;
  renderSites();
}
$('#blockToggle').addEventListener('change', async (e) => {
  await S.set({ blockingEnabled: e.target.checked });
});
$('#siteAdd').addEventListener('click', addSite);
$('#siteInput').addEventListener('keydown', e => { if (e.key === 'Enter') addSite(); });
async function addSite() {
  const inp = $('#siteInput');
  let v = inp.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!v || sites.includes(v)) return;
  sites.push(v);
  await S.set({ blockedSites: sites });
  inp.value = '';
  renderSites();
}
$$('.quick-add button').forEach(b => b.addEventListener('click', async () => {
  const s = b.dataset.site;
  if (!sites.includes(s)) {
    sites.push(s);
    await S.set({ blockedSites: sites });
    renderSites();
  }
}));

/* ========== 7. HABITS CHECKLISTS ========== */
async function initHabits() {
  const boxes = $$('input[data-chk]');
  const keys = boxes.map(b => 'chk:' + b.dataset.chk);
  const saved = await S.get(keys);
  boxes.forEach(b => {
    b.checked = !!saved['chk:' + b.dataset.chk];
    b.addEventListener('change', async () => {
      await S.set({ ['chk:' + b.dataset.chk]: b.checked });
    });
  });
}

/* ========== 8. SETTINGS ========== */
async function initSettings() {
  const { notificationsOn = true, deepWork = DEFAULTS.deepWork, wakeTime = '06:00' } = await S.get(['notificationsOn','deepWork','wakeTime']);
  $('#notifToggle').checked = !!notificationsOn;
  $('#dwStart').value = deepWork.start;
  $('#dwEnd').value   = deepWork.end;
  $('#wakeTime').value = wakeTime;
  calcSleep();
}
$('#notifToggle').addEventListener('change', async e => S.set({ notificationsOn: e.target.checked }));
$('#dwSave').addEventListener('click', async () => {
  const start = $('#dwStart').value, end = $('#dwEnd').value;
  await S.set({ deepWork: { start, end } });
  const btn = $('#dwSave');
  const old = btn.textContent;
  btn.textContent = '✅ সংরক্ষিত';
  setTimeout(() => btn.textContent = old, 1200);
});
$('#wakeTime').addEventListener('change', async e => {
  await S.set({ wakeTime: e.target.value });
  calcSleep();
});
function calcSleep() {
  const wake = $('#wakeTime').value;
  if (!wake) return;
  const [h, m] = wake.split(':').map(Number);
  const wakeMin = h * 60 + m;
  const box = $('#sleepResults');
  box.innerHTML = '';
  [9, 8, 7.5, 7, 6].forEach(hrs => {
    const bed = (wakeMin - hrs * 60 - 15 + 1440) % 1440;
    const bh = Math.floor(bed / 60), bm = bed % 60;
    const ampm = bh >= 12 ? 'PM' : 'AM';
    const h12 = bh % 12 === 0 ? 12 : bh % 12;
    const el = document.createElement('div');
    el.className = 'sleep-item';
    el.innerHTML = `<span>${hrs} ঘণ্টা ঘুমাতে</span><b>${String(h12).padStart(2,'0')}:${String(bm).padStart(2,'0')} ${ampm}</b>`;
    box.appendChild(el);
  });
}
$('#resetAll').addEventListener('click', async () => {
  if (!confirm('সব ডেটা মুছে ফেলবেন? এটা ফেরানো যাবে না।')) return;
  await new Promise(r => chrome.storage.local.clear(r));
  // re-init defaults
  await S.set(DEFAULTS);
  location.reload();
});

/* ========== INIT ========== */
(async function init() {
  await initTheme();
  await loadState();
  paint();
  await loadStats();
  await initGoal();
  await initDist();
  await initBlocker();
  await initHabits();
  await initSettings();
  startUiLoop();

  // refresh stats & state if changed externally
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.focusState) { loadState().then(paint); }
    if (changes.stats)      { loadStats(); }
  });
})();