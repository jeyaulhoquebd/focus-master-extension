/* ========== ফোকাস মাস্টার — offscreen alarm ========== */
let audioCtx = null;
let stopTimer = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'PLAY_ALARM') {
    playAlarm(msg.duration || 5000);
    sendResponse({ ok: true });
  }
  if (msg?.type === 'STOP_ALARM') {
    stopAlarm();
    sendResponse({ ok: true });
  }
});

function playAlarm(durationMs) {
  stopAlarm();
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;
  const duration = durationMs / 1000;

  // Pattern: দ্রুত "বিপ-বিপ" সাইরেন — ৩ সেকেন্ড মধুর টোন + ২ সেকেন্ড দ্রুত বিপ
  const startSoft = now;
  const softDur   = Math.min(3, duration);
  // soft siren
  for (let t = 0; t < softDur; t += 1.0) {
    siren(now + t, 0.5, 660, 990);   // up-down
    siren(now + t + 0.5, 0.5, 660, 990);
  }
  // fast beeps
  const fastStart = now + 3;
  const fastEnd   = now + duration;
  let t = fastStart;
  while (t < fastEnd) {
    beep(t, 0.14, 1046);  // C6
    beep(t + 0.18, 0.14, 1318); // E6
    t += 0.4;
  }

  stopTimer = setTimeout(stopAlarm, durationMs + 300);
}

function beep(startTime, dur, freq) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + dur + 0.05);
}

function siren(startTime, dur, f1, f2) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(f1, startTime);
  osc.frequency.linearRampToValueAtTime(f2, startTime + dur / 2);
  osc.frequency.linearRampToValueAtTime(f1, startTime + dur);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.28, startTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + dur + 0.05);
}

function stopAlarm() {
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  if (audioCtx) {
    try { audioCtx.close(); } catch (e) {}
    audioCtx = null;
  }
}