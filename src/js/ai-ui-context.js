/**
 * Client-Side Structured UI Context Provider
 * Scans current page state, active tab, selected assessment, and available controls
 * without sending heavy HTML/DOM payloads.
 */

export function getCurrentUiContext() {
  const pathname = window.location.pathname || '';
  const rawPage = pathname.split('/').pop()?.replace(/\.html$/, '') || 'dashboard';
  const pageId = rawPage === '' || rawPage === 'index' ? 'dashboard' : rawPage;

  // Title lookup
  const pageTitle =
    document.title?.replace(' | Project KIT', '').trim() ||
    document.querySelector('h1')?.textContent?.trim() ||
    pageId;

  // Active Tab lookup
  const activeTabEl = document.querySelector(
    '[data-tab].border-brand-500, [data-tab].text-brand-600, .nav-tab.active, .tab-btn.active'
  );
  const activeTab = activeTabEl?.getAttribute('data-tab') || activeTabEl?.textContent?.trim();

  // Selected Section / Subject lookup
  const sectionSelect = document.querySelector('#filter-section, #exam-import-section-select');
  const activeSection = sectionSelect?.value || undefined;

  // Active Assessment Context
  const urlParams = new URLSearchParams(window.location.search);
  const assessmentIdFromUrl = urlParams.get('id') || urlParams.get('assessmentId');
  const workspaceTitleEl = document.querySelector('#detail-title, #assessment-title, [data-assessment-title]');
  const workspaceStatusEl = document.querySelector('#detail-status-badge, [data-assessment-status]');

  let assessment;
  if (assessmentIdFromUrl) {
    assessment = {
      id: assessmentIdFromUrl,
      title: workspaceTitleEl?.textContent?.trim() || undefined,
      status: workspaceStatusEl?.textContent?.trim() || undefined,
    };
  }

  // Available & Disabled Actions Scanning
  const availableActions = [];
  const disabledActions = [];

  document.querySelectorAll('button, a.btn, label.btn').forEach((el) => {
    const btn = el;
    const label = btn.innerText?.trim().replace(/\s+/g, ' ');
    if (!label || label.length > 40) return;

    if (btn.disabled || btn.classList.contains('disabled') || btn.getAttribute('aria-disabled') === 'true') {
      const reason =
        btn.getAttribute('title') ||
        btn.getAttribute('data-disabled-reason') ||
        'Action unavailable in current state';
      disabledActions.push({ action: label, reason });
    } else {
      if (!availableActions.includes(label)) {
        availableActions.push(label);
      }
    }
  });

  // Device detection
  const width = window.innerWidth;
  const deviceType = width < 640 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
  const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  return {
    route: pathname,
    pageId,
    pageTitle,
    activeTab: activeTab || undefined,
    activeSection,
    assessment,
    availableActions: availableActions.slice(0, 15),
    disabledActions: disabledActions.slice(0, 10),
    device: {
      type: deviceType,
      hasCamera,
    },
  };
}
