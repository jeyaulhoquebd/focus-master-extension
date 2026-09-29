/* ========== ফোকাস মাস্টার — সাইট ব্লকার ========== */
(function () {
  "use strict";
  const OVERLAY_ID = 'fm-focus-overlay';

  async function getState() {
    return new Promise(r => chrome.storage.local.get(
      ['blockingEnabled','blockedSites','focusState'],
      r
    ));
  }

  function hostMatches(host, list) {
    host = host.replace(/^www\./, '').toLowerCase();
    return list.some(s => {
      s = s.toLowerCase().replace(/^www\./, '');
      return host === s || host.endsWith('.' + s);
    });
  }

  function pauseMedia() {
    document.querySelectorAll('video,audio').forEach(m => {
      try { m.pause(); } catch (e) {}
    });
  }

  function removeOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
  }

  function showOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.innerHTML = `
      <div class="fm-card">
        <div class="fm-icon">🎯</div>
        <h1>এখন ফোকাসের সময়</h1>
        <p><b>ফোকাস মাস্টার</b> এই সাইটটি ব্লক করেছে।</p>
        <div class="fm-timer" id="fm-timer">--:--</div>
        <p class="fm-hint">কাজ শেষ করে পরে ফিরে আসুন।</p>
        <div class="fm-actions">
          <button id="fm-close">← ফিরে যাই</button>
        </div>
      </div>
    `;

    const mount = () => {
      if (document.body) document.body.appendChild(el);
      else document.documentElement.appendChild(el);
      const btn = document.getElementById('fm-close');
      if (btn) btn.addEventListener('click', () => {
        if (history.length > 1) history.back();
        else location.replace('about:blank');
      });
    };

    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });

    document.documentElement.style.overflow = 'hidden';
    pauseMedia();

    // update countdown
    const updateTimer = async () => {
      const t = document.getElementById('fm-timer');
      if (!t) return;
      const { focusState } = await getState();
      if (!focusState) { t.textContent = ''; return; }
      if (focusState.running && focusState.endTime) {
        const rem = Math.max(0, Math.round((focusState.endTime - Date.now()) / 1000));
        const m = Math.floor(rem / 60), s = rem % 60;
        t.textContent = `⏱️ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      } else {
        t.textContent = '';
      }
    };
    updateTimer();
    setInterval(updateTimer, 1000);

    // pause any new video that loads
    const mo = new MutationObserver(pauseMedia);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  async function check() {
    const { blockingEnabled, blockedSites = [] } = await getState();
    if (!blockingEnabled) { removeOverlay(); return; }
    if (hostMatches(location.hostname, blockedSites)) showOverlay();
    else removeOverlay();
  }

  chrome.storage.onChanged.addListener(check);
  check();
})();