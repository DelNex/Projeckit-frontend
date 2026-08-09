import { AuthService } from './auth-service.js';
import { ConfigStore } from './stores/config-store.js';

const DEFAULT_AVATAR = './images/user/user-02.jpg';
const USER_PROFILE_EVENT = 'deped_set_user_profile';
const CONFIG_UPDATED_EVENT = 'deped_config_updated';

function getProfileImageUrl(userProfile) {
  if (!userProfile) return DEFAULT_AVATAR;
  return userProfile.avatar || userProfile.image || userProfile.profilePicture || DEFAULT_AVATAR;
}

function pickColor(seed) {
  const colors = ['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#F97316', '#06B6D4'];
  if (!seed) return colors[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return colors[Math.abs(h) % colors.length];
}

function generateInitialSvgDataUrl(letter, seed) {
  const bg = pickColor(seed);
  const fg = '#ffffff';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>` +
    `<rect width='100%' height='100%' fill='${bg}' rx='20' ry='20'/>` +
    `<text x='50%' y='50%' dy='0.35em' text-anchor='middle' font-family='Inter, system-ui, -apple-system, Roboto, "Helvetica Neue", Arial' font-size='64' fill='${fg}' font-weight='700'>${letter}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function safeText(value, fallback = 'Unknown') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function resolveProfileName(profile) {
  if (!profile) return 'Guest User';
  return (
    profile.name || profile.fullName || profile.displayName || profile.email || 'User'
  );
}

function renderUserProfile() {
  const config = ConfigStore.get() || {};
  const profile = config.userProfile || null;
  const avatarContainer = document.getElementById('user-avatar');
  const displayNameElement = document.getElementById('user-display-name');
  const fullNameElement = document.getElementById('user-fullname');
  const emailElement = document.getElementById('user-email');

  if (avatarContainer) {
    const avatarUrl = getProfileImageUrl(profile);
    const nameSource = profile && (profile.name || profile.displayName || profile.email) ? (profile.name || profile.displayName || profile.email) : 'U';
    const initial = String(nameSource[0] || 'U').toUpperCase();
    const svgDataUrl = generateInitialSvgDataUrl(initial, String(nameSource));

    avatarContainer.innerHTML = '';

    if (avatarUrl && avatarUrl !== DEFAULT_AVATAR) {
      const img = document.createElement('img');
      img.alt = 'User';
      img.className = 'h-full w-full object-cover';
      img.src = avatarUrl;
      img.onerror = () => {
        img.src = svgDataUrl;
      };
      avatarContainer.appendChild(img);
    } else {
      const img = document.createElement('img');
      img.alt = initial;
      img.className = 'h-full w-full object-cover';
      img.src = svgDataUrl;
      avatarContainer.appendChild(img);
    }
  }

  if (displayNameElement) {
    displayNameElement.textContent = profile ? resolveProfileName(profile) : 'Guest';
  }

  if (fullNameElement) {
    fullNameElement.textContent = profile ? resolveProfileName(profile) : 'Guest User';
  }

  if (emailElement) {
    emailElement.textContent = profile ? safeText(profile.email, 'No email provided') : 'Not signed in';
  }
}

function isAuthPage() {
  const path = window.location.pathname.toLowerCase();
  return path.endsWith('/login.html') || path.endsWith('/register.html') || path.endsWith('/forgot-password.html') || path.endsWith('/reset-password.html');
}

function isHomePage() {
  const page = window.location.pathname.split('/').pop().toLowerCase() || '';
  return page === '' || page === 'index.html';
}

function isAdminRole(role) {
  if (!role) return false;
  const normalized = String(role).trim().toLowerCase();
  return ['admin', 'administrator'].includes(normalized);
}

function isAdminRoute() {
  const page = window.location.pathname.split('/').pop().toLowerCase() || '';
  return ['admin.html', 'pending-users.html', 'audit-logs.html', 'app-config.html', 'app.html', 'tenants.html', 'tenant.html', 'system-health.html'].includes(page);
}

/**
 * Highlight the sidebar link that matches the current page.
 */
function highlightActiveLink() {
  const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const links = document.querySelectorAll('aside.sidebar a[href]');
  links.forEach((link) => {
    const href = (link.getAttribute('href') || '').toLowerCase();
    const linkPage = href.split('/').pop();

    if (linkPage && linkPage === currentPage) {
      link.classList.add('bg-brand-50', 'text-brand-600', 'dark:bg-brand-900/30', 'dark:text-brand-400', 'font-semibold');
      link.classList.remove('text-gray-700', 'dark:text-gray-200');
      const svg = link.querySelector('svg');
      if (svg) {
        svg.classList.add('text-brand-500');
        svg.classList.remove('text-gray-400');
      }
    }
  });
}

export async function initAuthAdapter() {
  renderUserProfile();
  window.addEventListener(CONFIG_UPDATED_EVENT, renderUserProfile);

  // ─── Fast-path: ONLY highlight sidebar links ───
  // NEVER redirect based on cached data — stale cache causes infinite loops.
  // Redirects are handled exclusively by the backend session validation below.
  highlightActiveLink();

  // ─── Centralized logout handler ───
  async function performLogout() {
    try {
      await AuthService.logout();
    } catch (err) {
      console.error('[AuthAdapter] Logout request failed', err);
    }

    try {
      const cfg = ConfigStore.get();
      cfg.userProfile = null;
      ConfigStore.saveLocal(cfg);
    } catch (err) {
      console.error('[AuthAdapter] Failed to clear user profile', err);
    }

    window.dispatchEvent(new CustomEvent('deped_user_logout', { detail: { timestamp: new Date().toISOString() } }));
    window.dispatchEvent(new CustomEvent('deped_auth_state_changed', { detail: { loggedIn: false } }));
    if (!isAuthPage()) {
      window.location.href = 'login.html';
    }
  }

  // Delegated click listener so logout buttons work everywhere
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('#btn-sign-out');
    if (btn) {
      e.preventDefault();
      performLogout();
    }
  });

  // ─── Profile event handler ───
  window.addEventListener(USER_PROFILE_EVENT, (evt) => {
    try {
      const payload = evt?.detail;
      if (!payload) return;
      const cfg = ConfigStore.get() || {};
      cfg.userProfile = payload;
      ConfigStore.saveLocal(cfg);
      window.dispatchEvent(new CustomEvent('deped_auth_state_changed', { detail: { loggedIn: true } }));
    } catch (e) {
      console.error('[AuthAdapter] deped_set_user_profile handler failed', e);
    }
  });

  // ─── Validate Session with Backend (single source of truth for routing) ───
  try {
    const session = await AuthService.init();
    renderUserProfile();
    const role = session.user?.role || session.user?.roleId;

    if (session.authenticated) {
      if (isAdminRole(role)) {
        // ADMIN USER
        if (isAuthPage() || isHomePage()) {
          window.location.href = 'admin.html';
          return true; // redirecting
        }
        highlightActiveLink();
      } else {
        // TEACHER USER
        if (isAdminRoute()) {
          window.location.href = 'index.html';
          return true; // redirecting
        }
        if (isAuthPage()) {
          window.location.href = 'index.html';
          return true; // redirecting
        }
        highlightActiveLink();
      }
    } else if (!isAuthPage()) {
      window.location.href = 'login.html';
      return true; // redirecting
    }
  } catch (error) {
    console.warn('[AuthAdapter] Session initialization failed', error);
    const cached = ConfigStore.get()?.userProfile;
    if (cached) {
      highlightActiveLink();
    } else if (!isAuthPage()) {
      window.location.href = 'login.html';
      return true; // redirecting
    }
  }

  return false; // no redirect, safe to continue
}
