/**
 * ZeeMan Living Wallpaper & Dynamic Time-of-Day System
 * Automatically adapts website ambiance, lighting, and 3D depth gradients
 * according to the viewer's real-time local clock (Dawn, Midday, Sunset, Night).
 */
(() => {
  function getTimePhase() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 17) return 'day';
    if (hour >= 17 && hour < 21) return 'sunset';
    return 'night';
  }

  // The main palette follows the user's local time of day.  Within that
  // palette we also rotate the ambient mesh slightly every hour, so the
  // wallpaper stays alive without making text, statuses, or controls change
  // to unreadable colours.
  function applyHourlyAtmosphere(root) {
    const hour = new Date().getHours();
    const minutes = new Date().getMinutes();
    // A complete, gentle colour orbit every 12 hours; the minute component
    // avoids a visibly abrupt jump when an hour changes.
    const hue = ((hour % 12) * 10) + (minutes / 60) * 10;
    root.style.setProperty('--wallpaper-hour-hue', `${hue.toFixed(2)}deg`);
    root.style.setProperty('--wallpaper-hour', String(hour));
  }

  const phaseConfig = {
    morning: { label: '🌅 Sunrise Aura', desc: 'Dawn / Morning' },
    day: { label: '☀️ Horizon Daylight', desc: 'Midday Glow' },
    sunset: { label: '🌇 Twilight Sunset', desc: 'Golden Hour' },
    night: { label: '🌌 Obsidian Night', desc: 'Cosmic Evening' }
  };

  function applyTheme(forcedPhase) {
    const root = document.documentElement;
    const override = localStorage.getItem('zeeman_wallpaper_preview');
    const phase = forcedPhase || override || getTimePhase();
    
    root.setAttribute('data-theme-time', phase);
    applyHourlyAtmosphere(root);

    const pill = document.querySelector('#dynamic-wallpaper-indicator');
    if (pill) {
      const info = phaseConfig[phase] || phaseConfig.day;
      pill.innerHTML = `<span class="wallpaper-glow-orb"></span><span class="wallpaper-text">${info.label}</span>`;
      pill.setAttribute('aria-label', `Current ambient wallpaper: ${info.desc}. Click to preview next time phase.`);
      pill.title = `Current dynamic wallpaper: ${info.desc}. Click to cycle preview.`;
    }
  }

  window.cycleDynamicTheme = () => {
    const phases = ['morning', 'day', 'sunset', 'night'];
    const current = document.documentElement.getAttribute('data-theme-time') || getTimePhase();
    const next = phases[(phases.indexOf(current) + 1) % phases.length];
    localStorage.setItem('zeeman_wallpaper_preview', next);
    applyTheme(next);
  };

  window.resetDynamicThemeAuto = () => {
    localStorage.removeItem('zeeman_wallpaper_preview');
    applyTheme(getTimePhase());
  };

  applyTheme();

  setInterval(() => {
    if (!localStorage.getItem('zeeman_wallpaper_preview')) {
      applyTheme(getTimePhase());
    }
  }, 60000);

  function mountIndicator() {
    applyTheme();
    if (document.querySelector('#dynamic-wallpaper-indicator')) return;

    const host = document.querySelector('.top-actions') || document.querySelector('.marketing-actions');
    if (host) {
      const pill = document.createElement('button');
      pill.id = 'dynamic-wallpaper-indicator';
      pill.className = 'wallpaper-mood-pill';
      pill.type = 'button';
      pill.onclick = () => window.cycleDynamicTheme();
      host.prepend(pill);
      applyTheme();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountIndicator);
  } else {
    mountIndicator();
  }

  new MutationObserver(() => {
    if (!document.querySelector('#dynamic-wallpaper-indicator')) {
      mountIndicator();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();

