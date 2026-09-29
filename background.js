/* ========== ফোকাস মাস্টার — service worker ========== */

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

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(null);
  const merged = { ...DEFAULTS, ...cur };
  await chrome.storage.local.set(merged);
});

/* ---------- alarm: timer ended ---------- */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'focusTimer') return;

  const { focusState, notificationsOn, stats = {} } = await chrome.storage.local.get(['focusState','notificationsOn','stats']);
  const s = focusState;
  if (!s || !s.running) return;

  const wasFocus = s.mode === 'focus';
  let next;

  if (wasFocus) {
    const isLong = s.round >= 4;
    next = {
      ...s,
      mode: 'break',
      total: (isLong ? 15 : s.breakMin) * 60,
      remaining: (isLong ? 15 : s.breakMin) * 60,
      running: false,
      endTime: null
    };

    // stats update
    const today = new Date().toISOString().slice(0,10);
    stats[today] = stats[today] || { sessions: 0, minutes: 0 };
    stats[today].sessions += 1;
    stats[today].minutes  += Math.round(s.total / 60);
    await chrome.storage.local.set({ stats });

    if (notificationsOn) notify(
      '✅ ফোকাস সেশন শেষ!',
      isLong ? 'বড় বিরতি নিন — ১৫ মিনিট।' : `ছোট বিরতি নিন — ${s.breakMin} মিনিট।`
    );
  } else {
    next = {
      ...s,
      mode: 'focus',
      round: Math.min(s.round + 1, 4),
      total: s.focusMin * 60,
      remaining: s.focusMin * 60,
      running: false,
      endTime: null
    };
    if (notificationsOn) notify('⏱️ বিরতি শেষ!', 'আবার ফোকাস সেশনে ফিরে যান।');
  }

  await chrome.storage.local.set({ focusState: next });
});

function notify(title, message) {
  try {
    chrome.notifications.create('fm-' + Date.now(), {
      type: 'basic',
      title,
      message,
      priority: 2,
      requireInteraction: false
    });
  } catch (e) {}
}

/* ---------- keep service worker responsive on install ---------- */
chrome.runtime.onStartup.addListener(() => {
  // Ensure defaults exist
  chrome.storage.local.get(null).then(cur => {
    chrome.storage.local.set({ ...DEFAULTS, ...cur });
  });
});