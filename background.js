/* ========== ফোকাস মাস্টার — service worker v3.0 ========== */

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
  guardStats: {},
  htList: [],
  theme: 'dark'
};

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULTS, ...cur });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(null).then(cur => {
    chrome.storage.local.set({ ...DEFAULTS, ...cur });
  });
});

/* ========== Pomodoro alarm ========== */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'focusTimer') return;

  const { focusState, notificationsOn, soundOn, stats = {} } =
    await chrome.storage.local.get(['focusState','notificationsOn','soundOn','stats']);
  const s = focusState;
  if (!s || !s.running) return;

  const wasFocus = s.mode === 'focus';
  let next;

  if (wasFocus) {
    const isLong = s.round >= 4;
    const breakSecs = (isLong ? 15 : s.breakMin) * 60;
    next = { ...s, mode:'break', total:breakSecs, remaining:breakSecs, running:false, endTime:null };

    const today = new Date().toISOString().slice(0,10);
    stats[today] = stats[today] || { sessions:0, minutes:0 };
    stats[today].sessions += 1;
    stats[today].minutes  += Math.round(s.total / 60);
    await chrome.storage.local.set({ stats });

    if (soundOn !== false) playAlarmSound(5000);
    if (notificationsOn !== false) {
      notify('✅ ফোকাস সেশন শেষ!',
        isLong ? 'বড় বিরতি নিন — ১৫ মিনিট।' : `ছোট বিরতি নিন — ${s.breakMin} মিনিট।`);
    }
  } else {
    next = {
      ...s, mode:'focus', round: Math.min(s.round + 1, 4),
      total: s.focusMin * 60, remaining: s.focusMin * 60,
      running: false, endTime: null
    };
    if (soundOn !== false) playAlarmSound(5000);
    if (notificationsOn !== false) notify('⏱️ বিরতি শেষ!', 'আবার ফোকাসে ফিরে যান।');
  }

  await chrome.storage.local.set({ focusState: next });
});

/* ========== 5-second alarm ========== */
async function playAlarmSound(duration) {
  try {
    const existing = await chrome.runtime.getContexts({ contextTypes:['OFFSCREEN_DOCUMENT'] });
    if (existing.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play 5-second alarm when focus session ends'
      });
    }
    setTimeout(() => {
      chrome.runtime.sendMessage({ type:'PLAY_ALARM', duration }).catch(()=>{});
    }, 100);
    setTimeout(async () => {
      try {
        const c = await chrome.runtime.getContexts({ contextTypes:['OFFSCREEN_DOCUMENT'] });
        if (c.length > 0) await chrome.offscreen.closeDocument();
      } catch(e){}
    }, duration + 1200);
  } catch(e) { console.warn('Alarm failed:', e); }
}

function notify(title, message) {
  try {
    chrome.notifications.create('fm-' + Date.now(), {
      type:'basic', title, message, priority:2, requireInteraction:false
    });
  } catch(e){}
}

/* ========== Focus Mode distraction counting ========== */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'DISTRACTION') {
    incrementGuardStat('distractions');
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === 'BLOCKED_SHOWN') {
    incrementGuardStat('blockedShown');
    sendResponse({ ok: true });
    return true;
  }
});

async function incrementGuardStat(field) {
  const { guardStats = {} } = await chrome.storage.local.get('guardStats');
  const today = new Date().toISOString().slice(0,10);
  guardStats[today] = guardStats[today] || { distractions:0, blockedShown:0, focusSeconds:0 };
  guardStats[today][field] = (guardStats[today][field] || 0) + 1;
  await chrome.storage.local.set({ guardStats });
}

/* ========== Periodic habit cleanup (30+ days old) ========== */
async function cleanupOldHabits() {
  const all = await chrome.storage.local.get(null);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0,10);
  const toRemove = [];
  Object.keys(all).forEach(k => {
    const m = k.match(/^habit:(\d{4}-\d{2}-\d{2}):/);
    if (m && m[1] < cutoffStr) toRemove.push(k);
  });
  if (toRemove.length) await chrome.storage.local.remove(toRemove);
}
chrome.runtime.onInstalled.addListener(cleanupOldHabits);
chrome.runtime.onStartup.addListener(cleanupOldHabits);

/* ========== Update badge with focus state ========== */
chrome.storage.onChanged.addListener((changes) => {
  if (changes.focusState) {
    const s = changes.focusState.newValue;
    if (s?.running) {
      chrome.action.setBadgeText({ text: '▶' });
      chrome.action.setBadgeBackgroundColor({ color: '#34d399' });
    } else if (s?.mode === 'break') {
      chrome.action.setBadgeText({ text: '☕' });
      chrome.action.setBadgeBackgroundColor({ color: '#60a5fa' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }
});

