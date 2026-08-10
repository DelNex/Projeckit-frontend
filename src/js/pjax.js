import Alpine from 'alpinejs';

const isSoftLink = (link) => {
  if (!(link instanceof HTMLAnchorElement)) return false;
  if (link.target && link.target !== '_self') return false;
  if (link.hasAttribute('download') || link.hasAttribute('ping')) return false;
  const href = link.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
  if (link.origin !== window.location.origin) return false;
  return link.pathname.endsWith('.html');
};

export async function softNavigate(url, { push = true } = {}) {
  let html;
  try {
    const res = await fetch(url.pathname + url.search, {
      headers: { Accept: 'text/html' },
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    // fall back to a full navigation (404s, network, etc.)
    window.location.href = url.href;
    return;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nextMain = doc.querySelector('main');
  const curMain = document.querySelector('main');
  if (!nextMain || !curMain) {
    window.location.href = url.href;
    return;
  }

  curMain.replaceWith(nextMain);
  document.title = doc.title;
  if (push) history.pushState({ url: url.href }, '', url.href);
  window.scrollTo(0, 0);

  try {
    Alpine.initTree(nextMain);
  } catch (e) {
    console.warn('[PJAX] Alpine re-init failed', e);
  }

  window.dispatchEvent(new CustomEvent('pjax:loaded', { detail: { url: url.href } }));
}

export function initSoftNavigation() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a');
    if (!isSoftLink(link)) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const url = new URL(link.href);
    const current = new URL(window.location.href);
    const samePage =
      url.pathname === current.pathname &&
      (url.search === current.search || (!url.search && !current.search));
    if (samePage) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    softNavigate(url);
  });

  window.addEventListener('popstate', (event) => {
    const url = event.state && event.state.url ? new URL(event.state.url) : new URL(window.location.href);
    if (url.href !== window.location.href) softNavigate(url, { push: false });
  });
}