/* Uses ZeeMan's persisted notification APIs. Browser audio plays only after
   the user's first click or keypress, as required by autoplay policies. */
(() => {
  const pollEveryMs = 12000;
  let role, baselineIds = new Set(), ready = false, polling = false, timer, audioContext;
  const api = async path => {
    const response = await fetch(`/api${path}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw Object.assign(new Error('Notification request failed.'), { status: response.status });
    return response.json();
  };
  const notificationRoute = () => role === 'admin' ? '/admin/notifications' : '/user/notifications';
  const endpoint = () => role === 'admin' ? '/admin/notifications?limit=20' : '/notifications?limit=20';

  function ensureBell() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return null;
    let button = topbar.querySelector('#bell, [data-live-notification-bell]');
    if (!button) {
      let actions = topbar.querySelector('.top-actions');
      if (!actions) { actions = document.createElement('div'); actions.className = 'top-actions'; topbar.append(actions); }
      button = document.createElement('button');
      button.type = 'button'; button.className = 'icon-btn notification-live-bell'; button.dataset.liveNotificationBell = 'true';
      button.innerHTML = 'Notifications <span id="unread" class="notification-count"></span>';
      button.addEventListener('click', () => location.assign(notificationRoute()));
      actions.prepend(button);
    }
    button.setAttribute('aria-label', 'Open notifications');
    return button;
  }
  function updateBadge(unread) {
    const badge = ensureBell()?.querySelector('#unread, .notification-count');
    if (badge) { badge.textContent = unread ? `(${unread})` : ''; badge.toggleAttribute('data-has-unread', Boolean(unread)); }
  }
  function showToast(message) {
    const root = document.querySelector('#toast-root'); if (!root) return;
    const item = document.createElement('div'); item.className = 'toast'; item.textContent = message;
    root.append(item); setTimeout(() => item.remove(), 4800);
  }
  async function unlockSound() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return;
      audioContext ||= new Audio(); if (audioContext.state === 'suspended') await audioContext.resume();
    } catch (_) { /* A browser may decline audio until a user gesture. */ }
  }
  function playSound() {
    if (!audioContext || audioContext.state !== 'running') return;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime;
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(720, now); oscillator.frequency.exponentialRampToValueAtTime(1040, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(now + 0.32);
  }
  async function poll() {
    if (polling || document.visibilityState === 'hidden') return;
    polling = true;
    try {
      if (!role) role = (await api('/auth/me')).user.role;
      const result = await api(endpoint()), notifications = result.notifications || [], ids = new Set(notifications.map(item => String(item.id)));
      if (ready) {
        const incoming = notifications.filter(item => !baselineIds.has(String(item.id)));
        if (incoming.length) { playSound(); showToast(incoming.length === 1 ? incoming[0].message : `You have ${incoming.length} new notifications.`); }
      }
      baselineIds = ids; ready = true; updateBadge(Number(result.unread) || 0);
    } catch (error) {
      if (error.status === 401 && timer) { clearInterval(timer); timer = null; }
    } finally { polling = false; }
  }
  function start() {
    document.addEventListener('pointerdown', unlockSound, { passive: true });
    document.addEventListener('keydown', unlockSound, { passive: true });
    new MutationObserver(ensureBell).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
    poll(); timer = setInterval(poll, pollEveryMs);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
