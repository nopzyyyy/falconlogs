(function () {
  if (window.__shopAnalyticsInit) return;
  window.__shopAnalyticsInit = true;

  function sendEvent(payload) {
    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon('/api/analytics/beacon', blob)) return;
      }
    } catch (_) {}
    fetch('/api/analytics/beacon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  }

  document.addEventListener('click', (e) => {
    const target = e.target.closest('a, button, [data-analytics]');
    if (!target) return;
    if (target.closest('[data-analytics-ignore]')) return;

    let label = target.getAttribute('data-analytics');
    if (!label) {
      if (target.tagName === 'A') label = target.getAttribute('href') || target.textContent;
      else label = target.textContent;
    }
    label = String(label || target.tagName || 'click').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!label) return;

    sendEvent({
      type: 'click',
      path: location.pathname,
      label,
    });
  }, { passive: true });
})();
