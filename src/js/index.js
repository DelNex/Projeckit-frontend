import "../css/style.css";

// Apply stored theme early so the page doesn't flash the wrong theme before Alpine starts
import "./theme-init.js";

import Alpine from "alpinejs";
window.Alpine = Alpine;
Alpine.start();

import { initDashboard } from "./views/dashboard.js";
import { initTOSView } from "./views/tos.js";
import { initExamImportView } from "./views/exam-import.js";
import { initItemAnalysisView } from "./views/item-analysis.js";
import { initStudentsView } from "./views/students.js";
import { initAnalyticsView } from "./views/analytics.js";
import { initReportsView } from "./views/reports.js";
import { initConfigView } from "./views/config.js";
import { initSettingsView } from "./views/settings.js";
import { initAppSettingsView } from "./views/app-settings.js";
import { initAuditLogsView } from "./views/audit-logs.js";
import { initPendingUsersView } from "./views/pending-users.js";
import { initAdminConsoleView } from "./views/admin.js";
import { initTenantsView } from "./views/tenants.js";
import { initTenantView } from "./views/tenant.js";
import { initSystemHealthView } from "./views/system-health.js";
import { initAppHubView } from "./views/app-hub.js";
import { initRecommendationsView } from "./views/recommendations.js";
import { initLoginView } from "./views/login.js";
import { initRegisterView } from "./views/register.js";
import { initGlobalApiErrorHandler } from "./api/global-error-handler.js";
import { ConfigStore } from './stores/config-store.js';
import { ImportStore } from './stores/import-store.js';
import { ResponseStore } from './stores/response-store.js';
import { AppSettingsStore } from './stores/app-settings-store.js';

// Integration helpers
import { initThemeToggle } from './theme-toggle.js';
import { initAuthAdapter } from './auth-adapter.js';
import { initNotificationAdapter } from './notification-adapter.js';
import { initAIModal } from './ai-modal.js';
import { initSoftNavigation } from './pjax.js';
import { initGlobalSearch } from './global-search.js';

// Re-inits the view for the current URL after a soft (PJAX) navigation.
function initViewForPath(path) {
  if (path.endsWith("admin.html")) {
    initAdminConsoleView();
  } else if (path.endsWith("index.html") || path.endsWith("/") || path === "") {
    initDashboard();
  } else if (path.endsWith("tos.html")) {
    initTOSView();
  } else if (path.endsWith("exam-import.html")) {
    initExamImportView();
  } else if (path.endsWith("item-analysis.html")) {
    initItemAnalysisView();
  } else if (path.endsWith("students.html")) {
    initStudentsView();
  } else if (path.endsWith("analytics.html")) {
    initAnalyticsView();
  } else if (path.endsWith("reports.html")) {
    initReportsView();
  } else if (path.endsWith("config.html")) {
    initConfigView();
  } else if (path.endsWith("app-config.html")) {
    initAppSettingsView();
  } else if (path.endsWith("settings.html")) {
    initSettingsView();
  } else if (path.endsWith("audit-logs.html")) {
    initAuditLogsView();
  } else if (path.endsWith("pending-users.html")) {
    initPendingUsersView();
  } else if (path.endsWith("tenants.html")) {
    initTenantsView();
  } else if (path.endsWith("tenant.html")) {
    initTenantView();
  } else if (path.endsWith("system-health.html")) {
    initSystemHealthView();
  } else if (path.endsWith("app.html")) {
    initAppHubView();
  } else if (path.endsWith("recommendations.html")) {
    initRecommendationsView();
  } else if (path.endsWith("login.html")) {
    initLoginView();
  } else if (path.endsWith("register.html")) {
    initRegisterView();
  }
}

// Dispatch page-specific initialization on DOM Content Loaded
document.addEventListener("DOMContentLoaded", async () => {
  // Soft navigation (PJAX) — intercepts internal .html links and swaps <main> in place
  initSoftNavigation();
  window.addEventListener('pjax:loaded', () => initViewForPath(window.location.pathname));

  // Initialize integrations that are shared across pages (theme first for no flash)
  try {
    initThemeToggle();
  } catch (e) {
    console.warn('[Index] Theme toggle init failed', e);
  }

  try {
    initGlobalApiErrorHandler();
  } catch (e) {
    console.warn('[Index] Global API error handler init failed', e);
  }

  // ─── AUTH GATE: validate session and redirect BEFORE any view renders ───
  // initAuthAdapter() may redirect the page (e.g. teacher on admin page → index.html).
  // We MUST await it so that view initialization never runs on the wrong page.
  try {
    const redirected = await initAuthAdapter();
    if (redirected) return; // page is navigating away, don't init views
  } catch (e) {
    console.warn('[Index] Auth adapter init failed', e);
  }

  // ─── Store initialization (skip on auth pages — no session-less data needed) ───
  const authPath = window.location.pathname.toLowerCase();
  const isAuthPage = ['/login.html', '/register.html', '/forgot-password.html', '/reset-password.html'].some((page) => authPath.endsWith(page));
  if (!isAuthPage) {
    try {
      await Promise.all([ConfigStore.initialize(), ImportStore.initialize(), ResponseStore.initialize(), AppSettingsStore.initialize()]);
    } catch (e) {
      console.warn('[Index] Store initialization failed', e);
    }
  }

  // ─── Page-specific view initialization ───
  initViewForPath(window.location.pathname);

  try {
    initGlobalSearch();
  } catch (e) {
    console.warn('[Index] Global search init failed', e);
  }

  try {
    initNotificationAdapter();
  } catch (e) {
    console.warn('[Index] Notification adapter init failed', e);
  }

  try {
    initAIModal();
  } catch (e) {
    console.warn('[Index] AI modal init failed', e);
  }
});

