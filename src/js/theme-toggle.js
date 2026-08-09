// Theme toggle helper — persist theme, update document class, and broadcast across tabs
export function initThemeToggle() {
  // Unique sender id to avoid processing our own BroadcastChannel messages
  const senderId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `tab-${Math.floor(Math.random()*1e9)}`;
  let lastChangeAt = 0;
  const CHANGE_LOCK_MS = 500; // ignore incoming changes within this window (avoid loops)

  function syncAlpineDarkMode(isDark) {
    try {
      // Find all Alpine roots and set their darkMode if present
      const roots = document.querySelectorAll('[x-data]');
      roots.forEach(root => {
        try {
          // Alpine stores internal data on __x ? __x.$data : nothing — guard
          const store = root.__x && root.__x.$data ? root.__x.$data : null;
          if (store && Object.prototype.hasOwnProperty.call(store, 'darkMode')) {
            store.darkMode = !!isDark;
          }
        } catch (e) {
          // ignore per-root errors
        }
      });
    } catch (e) {
      // ignore
    }
  }

  const apply = (isDark, meta = {}) => {
    try {
      const now = Date.now();
      // prevent rapid re-applications
      if (now - lastChangeAt < CHANGE_LOCK_MS) return;
      lastChangeAt = now;

      if (isDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');

      // Normalize stored value to 'true'/'false'
      localStorage.setItem('darkMode', isDark ? 'true' : 'false');

      // Sync Alpine state so :class bindings that rely on darkMode reflect the change
      syncAlpineDarkMode(isDark);

      // Broadcast to other tabs with senderId and optional meta
      if ('BroadcastChannel' in window) {
        try {
          const ch = new BroadcastChannel('deped_theme_channel');
          ch.postMessage({ type: 'THEME_CHANGED', payload: { dark: isDark, senderId, meta } });
          ch.close();
        } catch (e) {
          // ignore BroadcastChannel errors
        }
      }

      // Notify listeners in this tab
      window.dispatchEvent(new CustomEvent('deped_theme_changed', { detail: { dark: isDark, meta } }));
    } catch (e) {
      console.error('[ThemeToggle] Failed to apply theme', e);
    }
  };

  // Toggle handler via window event to avoid duplicate click handlers with Alpine
  function toggleHandler() {
    const stored = localStorage.getItem('darkMode');
    const isDark = stored === 'true';
    apply(!isDark, { source: 'user-toggle' });
  }

  // Listen for explicit toggle requests (dispatched from header Alpine click)
  window.addEventListener('deped_theme_toggle_request', () => {
    try {
      toggleHandler();
    } catch (e) {
      console.error('[ThemeToggle] deped_theme_toggle_request handler failed', e);
    }
  });

  // Listen for BroadcastChannel messages but ignore messages coming from this tab (senderId)
  try {
    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel('deped_theme_channel');
      ch.onmessage = (m) => {
        try {
          const data = m?.data;
          if (!data || data.type !== 'THEME_CHANGED') return;
          const payload = data.payload || {};
          if (payload.senderId && payload.senderId === senderId) return; // ignore our own

          // rate-limit handling to prevent loops
          const now = Date.now();
          if (now - lastChangeAt < CHANGE_LOCK_MS) return;

          apply(Boolean(payload.dark), { source: 'broadcast', originSender: payload.senderId });
        } catch (e) {
          // ignore
        }
      };
    }
  } catch (e) {
    // ignore
  }

  // On init, ensure the theme reflects stored value (and normalize it)
  try {
    const stored = localStorage.getItem('darkMode');
    const isDark = stored === 'true' || stored === 'dark';
    apply(isDark, { source: 'init' });
  } catch (e) {
    // ignore
  }

  // Expose apply for programmatic use
  return { apply };
}
