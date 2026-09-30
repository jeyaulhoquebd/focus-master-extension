/* ========== ফোকাস মাস্টার — popup v3.0 ========== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const S = {
  async get(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); },
  async set(obj)   { return new Promise(r => chrome.storage.local.set(obj, r)); },
  async del(k)     { return new Promise(r => chrome.storage.local.remove(k, r)); }
};

const DEFAULTS = {
  focusState: {
    mode:'focus', running:false, endTime:null,
    remaining:25*60, total:25*60, round:1, focusMin:25, breakMin:5
  },
  blockingEnabled: false,
  focusMode: false,
  focusStartAt: null,
  blockedSites: ['facebook.com','youtube.com','instagram.com','twitter.com','x.com','reddit.com','tiktok.com'],
  notificationsOn: true,
  soundOn: true,
  goal: '',
  distractions: [],
  deepWork: { start:'08:00', end:'10:00' },
  wakeTime: '06:00',
  stats: {},
  guardStats: {},     // { "YYYY-MM-DD": { distractions, blockedShown, focusSeconds } }
  htList: [],         // [{ id, name, startDate, targetDays, createdAt }]
  theme: 'dark'
};

/* ---------- THEME ---------- */
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

/* ---------- TABS ---------- */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $(`.panel[data-panel="${t.dataset.tab}"]`).classList.add('active');
  if (t.dataset.tab === 'habits') refreshHabitsView();
  if (t.dataset.tab === 'ht')     renderHT();
  if (t.dataset.tab === 'guard')  refreshGuard();
}));

/* ============================================================
   TIMER (unchanged logic)
   ============================================================ */
const RING_CIRC = 2 * Math.PI * 88;
const ringFg   = $('#ringFg');
const modeLbl  = $('#modeLabel');
const timeLbl  = $('#timeLabel');
const roundLbl = $('#roundLabel');
const startBtn = $('#startBtn');
const resetBtn = $('#resetBtn');
const skipBtn  = $('#skipBtn');
const chips    = $$('.chip');

let state = null, uiInterval = null;

async function loadState() {
  const { focusState } = await S.get('focusState');
  state = focusState || { ...DEFAULTS.focusState };
  if (!state.endTime && typeof state.remaining !== 'number') state.remaining = 25 * 60;
  if (!state.total) state.total = state.focusMin * 60;
}
const saveState = () => S.set({ focusState: state });

function remainingSecs() {
  if (state.running && state.endTime)
    return Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
  return state.remaining;
}
const fmt = s => String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');

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

startBtn.addEventListener('click', async () => {
  if (state.running) {
    const rem = remainingSecs();
    state.running = false; state.endTime = null; state.remaining = rem;
    await chrome.alarms.clear('focusTimer');
  } else {
    state.running = true;
    state.endTime = Date.now() + state.remaining * 1000;
    await chrome.alarms.create('focusTimer', { when: state.endTime });
  }
  await saveState(); paint();
});
resetBtn.addEventListener('click', async () => {
  await chrome.alarms.clear('focusTimer');
  state.running = false; state.endTime = null;
  state.mode = 'focus'; state.round = 1;
  state.total = state.focusMin * 60; state.remaining = state.total;
  await saveState(); paint();
});
skipBtn.addEventListener('click', async () => {
  await chrome.alarms.clear('focusTimer');
  await transitionMode(); await saveState(); paint();
});
chips.forEach(c => c.addEventListener('click', async () => {
  chips.forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  const [f,b] = c.dataset.preset.split(',').map(Number);
  await chrome.alarms.clear('focusTimer');
  state.focusMin = f; state.breakMin = b;
  state.mode = 'focus'; state.round = 1;
  state.running = false; state.endTime = null;
  state.total = f * 60; state.remaining = state.total;
  await saveState(); paint();
}));

async function transitionMode() {
  if (state.mode === 'focus') {
    const isLong = state.round >= 4;
    state.mode = 'break';
    state.total = (isLong ? 15 : state.breakMin) * 60;
  } else {
    state.mode = 'focus';
    state.round = Math.min(state.round + 1, 4);
    state.total = state.focusMin * 60;
  }
  state.remaining = state.total;
  state.running = false; state.endTime = null;
}

function startUiLoop() {
  if (uiInterval) clearInterval(uiInterval);
  uiInterval = setInterval(async () => {
    const { focusState } = await S.get('focusState');
    state = focusState || state;
    paint();
    if (state.running && state.endTime && Date.now() >= state.endTime) {
      await chrome.alarms.clear('focusTimer');
      await transitionMode(); await saveState();
    }
  }, 500);
}

/* ---------- STATS ---------- */
async function loadStats() {
  const { stats = {} } = await S.get('stats');
  const today = new Date().toISOString().slice(0,10);
  const t = stats[today] || { sessions:0, minutes:0 };
  $('#todaySessions').textContent = t.sessions;
  $('#todayFocus').textContent    = t.minutes;
}

/* ---------- GOAL ---------- */
async function initGoal() {
  const { goal = '' } = await S.get('goal');
  $('#goalInput').value = goal;
}
$('#goalSave').addEventListener('click', async () => {
  const v = $('#goalInput').value.trim();
  await S.set({ goal: v });
  const btn = $('#goalSave'); const old = btn.textContent;
  btn.textContent = '✅ সংরক্ষিত';
  setTimeout(() => btn.textContent = old, 1200);
});

/* ---------- DISTRACTIONS ---------- */
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
      distractions.splice(i,1);
      await S.set({ distractions }); renderDist();
    });
    ul.appendChild(li);
  });
}
async function initDist() {
  const { distractions: d = [] } = await S.get('distractions');
  distractions = d; renderDist();
}
$('#distAdd').addEventListener('click', addDist);
$('#distInput').addEventListener('keydown', e => { if (e.key === 'Enter') addDist(); });
async function addDist() {
  const inp = $('#distInput');
  const v = inp.value.trim(); if (!v) return;
  distractions.push(v);
  await S.set({ distractions });
  inp.value = ''; inp.focus(); renderDist();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ============================================================
   HABIT TRACKER (NEW)
   ============================================================ */
let htList = [];
let htTimerId = null;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

function htDiff(startDate) {
  const start = new Date(startDate + 'T00:00:00').getTime();
  let diff = Math.max(0, Date.now() - start);
  const days    = Math.floor(diff / 86400000); diff -= days * 86400000;
  const hours   = Math.floor(diff / 3600000);  diff -= hours * 3600000;
  const minutes = Math.floor(diff / 60000);    diff -= minutes * 60000;
  const seconds = Math.floor(diff / 1000);
  return { days, hours, minutes, seconds };
}
function htProgress(startDate, targetDays) {
  const start = new Date(startDate + 'T00:00:00').getTime();
  const passed = (Date.now() - start) / 86400000;
  const pct = targetDays > 0 ? Math.min(100, Math.max(0, (passed / targetDays) * 100)) : 0;
  const remainMs = Math.max(0, (start + targetDays * 86400000) - Date.now());
  return { pct, remainMs };
}
function htFmtRemain(ms) {
  if (ms <= 0) return '✅ সম্পন্ন';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return `${d} দিন ${h} ঘণ্টা বাকি`;
}

async function loadHT() {
  const { htList: l = [] } = await S.get('htList');
  htList = l;
}
const saveHT = () => S.set({ htList });

async function renderHT() {
  const listEl = $('#htList');
  if (!listEl) return;
  await loadHT();

  if (!htList.length) {
    listEl.innerHTML = `
      <div class="ht-empty">
        <span style="font-size:28px">📋</span>
        <b>এখনো কোনো অভ্যাস নেই</b>
        উপরে প্রথম অভ্যাস যোগ করে শুরু করুন।
      </div>`;
    return;
  }

  // fetch all notes at once
  const noteKeys = htList.map(h => `ht_note:${h.id}`);
  const notesData = await S.get(noteKeys);

  listEl.innerHTML = '';
  htList.forEach(h => {
    const d  = htDiff(h.startDate);
    const pr = htProgress(h.startDate, h.targetDays);
    const noteVal = notesData[`ht_note:${h.id}`] || '';
    const card = document.createElement('div');
    card.className = 'ht-card';
    card.dataset.id = h.id;
    card.innerHTML = `
      <div class="ht-head">
        <div style="flex:1;min-width:0">
          <h4>${escapeHtml(h.name)}</h4>
          <div class="ht-meta">
            <span>📅 <b>${h.startDate}</b></span>
            <span>🎯 <b>${h.targetDays} দিন</b></span>
          </div>
        </div>
        <button class="ht-del" title="মুছুন">✕</button>
      </div>

      <div class="ht-counter">
        <div class="ht-cb"><b data-fld="days">${d.days}</b><span>Days</span></div>
        <div class="ht-cb"><b data-fld="hours">${String(d.hours).padStart(2,'0')}</b><span>Hours</span></div>
        <div class="ht-cb"><b data-fld="minutes">${String(d.minutes).padStart(2,'0')}</b><span>Min</span></div>
        <div class="ht-cb"><b data-fld="seconds">${String(d.seconds).padStart(2,'0')}</b><span>Sec</span></div>
      </div>

      <div class="ht-pr-info">
        <span>অগ্রগতি: <b data-fld="pct">${pr.pct.toFixed(1)}%</b></span>
        <span data-fld="remain">${htFmtRemain(pr.remainMs)}</span>
      </div>
      <div class="ht-pr"><div class="ht-pr-fill" style="width:${pr.pct}%"></div></div>

      <div class="ht-notes-lbl">📝 Notes</div>
      <textarea class="ht-notes" placeholder="এই অভ্যাস নিয়ে আপনার ভাবনা লিখুন...">${escapeHtml(noteVal)}</textarea>
      <div class="ht-saved">✅ সংরক্ষিত</div>
    `;

    // delete
    card.querySelector('.ht-del').addEventListener('click', async () => {
      if (!confirm(`"${h.name}" মুছে ফেলবেন?`)) return;
      htList = htList.filter(x => x.id !== h.id);
      await saveHT();
      await S.del(`ht_note:${h.id}`);
      renderHT();
    });

    // notes auto-save (debounced)
    const ta  = card.querySelector('.ht-notes');
    const ind = card.querySelector('.ht-saved');
    let noteTid = null;
    ta.addEventListener('input', () => {
      clearTimeout(noteTid);
      noteTid = setTimeout(async () => {
        await S.set({ [`ht_note:${h.id}`]: ta.value });
        ind.classList.add('show');
        setTimeout(() => ind.classList.remove('show'), 1200);
      }, 400);
    });

    listEl.appendChild(card);
  });
}

function htUpdateCounters() {
  if (!$('#htList')) return;
  const cards = $$('#htList .ht-card');
  cards.forEach(card => {
    const h = htList.find(x => x.id === card.dataset.id);
    if (!h) return;
    const d  = htDiff(h.startDate);
    const pr = htProgress(h.startDate, h.targetDays);
    card.querySelector('[data-fld="days"]').textContent    = d.days;
    card.querySelector('[data-fld="hours"]').textContent   = String(d.hours).padStart(2,'0');
    card.querySelector('[data-fld="minutes"]').textContent = String(d.minutes).padStart(2,'0');
    card.querySelector('[data-fld="seconds"]').textContent = String(d.seconds).padStart(2,'0');
    card.querySelector('[data-fld="pct"]').textContent     = pr.pct.toFixed(1) + '%';
    card.querySelector('[data-fld="remain"]').textContent  = htFmtRemain(pr.remainMs);
    const fill = card.querySelector('.ht-pr-fill');
    if (fill) fill.style.width = pr.pct + '%';
  });
}

async function addHabit() {
  const name = $('#htName').value.trim();
  const startDate = $('#htStart').value;
  const targetDays = parseInt($('#htTarget').value, 10);
  if (!name)        return alert('অভ্যাসের নাম দিন');
  if (!startDate)   return alert('শুরুর তারিখ দিন');
  if (!targetDays || targetDays < 1) return alert('লক্ষ্য দিন (কমপক্ষে ১ দিন)');

  htList.unshift({
    id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
    name, startDate, targetDays, createdAt: Date.now()
  });
  await saveHT();

  $('#htName').value = '';
  $('#htStart').value = todayISO();
  $('#htTarget').value = 30;
  renderHT();
}

if ($('#htAdd')) {
  if (!$('#htStart').value) $('#htStart').value = todayISO();
  $('#htAdd').addEventListener('click', addHabit);
  $('#htName').addEventListener('keydown', e => { if (e.key === 'Enter') addHabit(); });
  // update counters every second while popup open
  htTimerId = setInterval(htUpdateCounters, 1000);
}

/* ============================================================
   FOCUS GUARD (NEW)
   ============================================================ */
let guardSites = [];
let guardStatsToday = { distractions:0, blockedShown:0, focusSeconds:0 };
let focusStartLocal = null;

async function refreshGuard() {
  const {
    focusMode = false,
    blockedSites = DEFAULTS.blockedSites,
    focusStartAt = null,
    guardStats = {}
  } = await S.get(['focusMode','blockedSites','focusStartAt','guardStats']);

  guardSites = [...blockedSites];
  focusStartLocal = focusStartAt;
  const today = new Date().toISOString().slice(0,10);
  guardStatsToday = guardStats[today] || { distractions:0, blockedShown:0, focusSeconds:0 };

  $('#guardToggle').checked = !!focusMode;
  renderSites();
  paintGuardStatus();
  paintGuardStats();
}

function paintGuardStatus() {
  const on = $('#guardToggle').checked;
  const st = $('#guardStatus');
  st.className = 'guard-status' + (on ? ' active' : '');
  st.innerHTML = `<span class="gdot"></span><span>${on ? 'Focus Mode চালু — সক্রিয় আছেন ✅' : 'Focus Mode বন্ধ — চালু করলে ট্র্যাকিং শুরু হবে'}</span>`;
}

function paintGuardStats() {
  $('#gDistractions').textContent = guardStatsToday.distractions || 0;
  $('#gBlocked').textContent      = guardSites.length;
  if ($('#guardToggle').checked && focusStartLocal) {
    const secs = Math.floor((Date.now() - focusStartLocal) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    $('#gTime').textContent = h > 0 ? `${h}h ${m}m` : (m > 0 ? `${m}m ${s}s` : `${s}s`);
  } else {
    $('#gTime').textContent = '0s';
  }
}

function renderSites() {
  const ul = $('#siteList');
  ul.innerHTML = '';
  if (!guardSites.length) {
    ul.innerHTML = `<li class="empty">এখনো কোনো সাইট যোগ করা হয়নি</li>`;
    return;
  }
  guardSites.forEach((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>🌐 ${escapeHtml(s)}</span><button title="মুছুন">✕</button>`;
    li.querySelector('button').addEventListener('click', async () => {
      guardSites.splice(i,1);
      await S.set({ blockedSites: guardSites });
      renderSites(); paintGuardStats();
    });
    ul.appendChild(li);
  });
}

if ($('#guardToggle')) {
  $('#guardToggle').addEventListener('change', async (e) => {
    const on = e.target.checked;
    const startAt = on ? Date.now() : null;
    focusStartLocal = startAt;
    await S.set({
      focusMode: on,
      focusStartAt: startAt,
      blockingEnabled: on      // চালু করলেই blocker সক্রিয়
    });
    paintGuardStatus(); paintGuardStats();
  });

  $('#siteAdd').addEventListener('click', addSite);
  $('#siteInput').addEventListener('keydown', e => { if (e.key === 'Enter') addSite(); });

  $$('.quick-add button').forEach(b => b.addEventListener('click', async () => {
    const s = b.dataset.site;
    if (!guardSites.includes(s)) {
      guardSites.push(s);
      await S.set({ blockedSites: guardSites });
      renderSites(); paintGuardStats();
    }
  }));

  setInterval(paintGuardStats, 1000);
}

async function addSite() {
  const inp = $('#siteInput');
  const v = inp.value.trim().toLowerCase()
    .replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  if (!v || guardSites.includes(v)) return;
  guardSites.push(v);
  await S.set({ blockedSites: guardSites });
  inp.value = '';
  renderSites(); paintGuardStats();
}

/* ============================================================
   DAILY HABITS (8টি অভ্যাস) — unchanged
   ============================================================ */
const todayKey = () => new Date().toISOString().slice(0,10);
const bnDate = key => ['রবি','সোম','মঙ্গল','বুধ','বৃহঃ','শুক্র','শনি'][new Date(key).getDay()];
const bnNum = n => String(n).replace(/\d/g, d => ['০','১','২','৩','৪','৫','৬','৭','৮','৯'][d]);

async function initHabits() {
  const boxes = $$('input[data-chk]');
  const today = todayKey();
  const keys = boxes.map(b => `habit:${today}:${b.dataset.chk}`);
  const saved = await S.get(keys);

  boxes.forEach(b => {
    const k = `habit:${today}:${b.dataset.chk}`;
    b.checked = !!saved[k];
    b.addEventListener('change', async () => {
      await S.set({ [k]: b.checked });
      refreshHabitsView();
    });
  });

  const dt = new Date();
  $('#habitTodayDate').textContent =
    `${bnDate(today)}, ${bnNum(dt.getDate())}/${bnNum(dt.getMonth()+1)}/${bnNum(dt.getFullYear())}`;

  await refreshHabitsView();
  await renderWeeklyStrip();
}

async function refreshHabitsView() {
  const boxes = $$('input[data-chk]');
  const today = todayKey();
  const keys = boxes.map(b => `habit:${today}:${b.dataset.chk}`);
  const saved = await S.get(keys);
  const total = keys.length;
  const done  = keys.filter(k => saved[k]).length;
  const pct   = total ? Math.round((done/total)*100) : 0;

  $('#habitProgressBar').style.width = pct + '%';
  $('#habitProgressLabel').textContent = `${bnNum(done)} / ${bnNum(total)} সম্পন্ন · ${bnNum(pct)}%`;

  $$('.habit').forEach(h => {
    const inner = [...h.querySelectorAll('input[data-chk]')];
    const doneN = inner.filter(i => saved[`habit:${today}:${i.dataset.chk}`]).length;
    const badge = h.querySelector(`[data-badge="${h.dataset.habit}"]`);
    if (badge) {
      badge.textContent = `${bnNum(doneN)}/${bnNum(inner.length)}`;
      badge.classList.toggle('done', inner.length > 0 && doneN === inner.length);
    }
  });
}

async function renderWeeklyStrip() {
  const strip = $('#weeklyDays'); if (!strip) return;
  strip.innerHTML = '';
  const boxes = $$('input[data-chk]');
  const perDay = boxes.length;
  const today = todayKey();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0,10));
  }
  const keys = [];
  days.forEach(d => boxes.forEach(b => keys.push(`habit:${d}:${b.dataset.chk}`)));
  const saved = await S.get(keys);

  days.forEach(d => {
    const doneN = boxes.filter(b => saved[`habit:${d}:${b.dataset.chk}`]).length;
    const pct = perDay ? doneN / perDay : 0;
    const el = document.createElement('div');
    el.className = 'ws-day';
    if (d === today) el.classList.add('today');
    if (pct >= 1) el.classList.add('done');
    else if (pct > 0) el.classList.add('partial');
    el.innerHTML = `<span>${bnDate(d)}</span><span class="ws-count">${bnNum(doneN)}</span>`;
    el.title = `${d} — ${doneN}/${perDay}`;
    strip.appendChild(el);
  });
}

/* ============================================================
   SETTINGS
   ============================================================ */
async function initSettings() {
  const {
    notificationsOn = true, soundOn = true,
    deepWork = DEFAULTS.deepWork, wakeTime = '06:00'
  } = await S.get(['notificationsOn','soundOn','deepWork','wakeTime']);
  $('#notifToggle').checked = !!notificationsOn;
  $('#soundToggle').checked = soundOn !== false;
  $('#dwStart').value = deepWork.start;
  $('#dwEnd').value   = deepWork.end;
  $('#wakeTime').value = wakeTime;
  calcSleep();
}
$('#notifToggle').addEventListener('change', e => S.set({ notificationsOn: e.target.checked }));
$('#soundToggle').addEventListener('change', e => S.set({ soundOn: e.target.checked }));
$('#dwSave').addEventListener('click', async () => {
  const start = $('#dwStart').value, end = $('#dwEnd').value;
  await S.set({ deepWork: { start, end } });
  const b = $('#dwSave'); const o = b.textContent;
  b.textContent = '✅ সংরক্ষিত';
  setTimeout(() => b.textContent = o, 1200);
});
$('#wakeTime').addEventListener('change', e => { S.set({ wakeTime: e.target.value }); calcSleep(); });
function calcSleep() {
  const wake = $('#wakeTime').value; if (!wake) return;
  const [h,m] = wake.split(':').map(Number);
  const wakeMin = h*60 + m;
  const box = $('#sleepResults'); box.innerHTML = '';
  [9, 8, 7.5, 7, 6].forEach(hrs => {
    const bed = (wakeMin - hrs*60 - 15 + 1440) % 1440;
    const bh = Math.floor(bed/60), bm = bed%60;
    const ampm = bh >= 12 ? 'PM' : 'AM';
    const h12 = bh % 12 === 0 ? 12 : bh % 12;
    const el = document.createElement('div');
    el.className = 'sleep-item';
    el.innerHTML = `<span>${hrs} ঘণ্টা</span><b>${String(h12).padStart(2,'0')}:${String(bm).padStart(2,'0')} ${ampm}</b>`;
    box.appendChild(el);
  });
}

$('#testAlarm').addEventListener('click', async () => {
  try {
    const ctxs = await chrome.runtime.getContexts({ contextTypes:['OFFSCREEN_DOCUMENT'] });
    if (ctxs.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Test 5s alarm'
      });
    }
    setTimeout(() => {
      chrome.runtime.sendMessage({ type:'PLAY_ALARM', duration:5000 }).catch(()=>{});
    }, 100);
    setTimeout(async () => {
      try {
        const c = await chrome.runtime.getContexts({ contextTypes:['OFFSCREEN_DOCUMENT'] });
        if (c.length > 0) await chrome.offscreen.closeDocument();
      } catch(e){}
    }, 6200);
  } catch(e) { alert('Test failed: ' + e.message); }
});

$('#resetAll').addEventListener('click', async () => {
  if (!confirm('সব ডেটা মুছে ফেলবেন?')) return;
  await new Promise(r => chrome.storage.local.clear(r));
  await S.set(DEFAULTS);
  location.reload();
});

/* ============================================================
   INIT
   ============================================================ */
(async function init() {
  await initTheme();
  await loadState(); paint();
  await loadStats();
  await initGoal();
  await initDist();
  await initHabits();
  await initSettings();
  await refreshGuard();
  await renderHT();
  startUiLoop();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.focusState) loadState().then(paint);
    if (changes.stats) loadStats();
    if (changes.guardStats) refreshGuard();
    if (changes.htList) { loadHT().then(renderHT); }
    if (Object.keys(changes).some(k => k.startsWith('habit:'))) refreshHabitsView();
  });
})();

