import { escapeHTML } from './utils.js';

const NOTIFICATION_EVENT = 'deped_set_notifications';
const NOTIFICATION_CLICK_EVENT = 'deped_notification_clicked';

function renderNotificationItem(notification, index) {
  const id = escapeHTML(String(notification.id ?? notification.key ?? `notification-${index}`));
  const title = escapeHTML(notification.title || notification.sender || notification.subject || 'Notification');
  const message = escapeHTML(notification.message || notification.body || notification.description || 'No additional details available.');
  const source = escapeHTML(notification.source || notification.type || 'System');
  const time = escapeHTML(notification.time || notification.timestamp || 'Just now');
  const avatar = escapeHTML(notification.avatar || notification.image || './images/user/user-02.jpg');
  const unread = notification.unread === true || notification.read === false;
  const badgeClass = unread ? 'bg-success-500' : 'bg-gray-400';

  return `
    <li class="border-b border-gray-100 last:border-0 dark:border-gray-800">
      <button
        type="button"
        data-notification-id="${id}"
        class="group flex w-full items-start gap-3 rounded-xl px-3 py-4 text-left hover:bg-gray-100 dark:hover:bg-white/5"
      >
        <span class="relative z-1 block h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <img src="${avatar}" alt="${title} avatar" class="h-full w-full object-cover" />
          <span class="absolute right-0 bottom-0 block h-2.5 w-2.5 rounded-full border-[1.5px] border-white ${badgeClass} dark:border-gray-900"></span>
        </span>

        <span class="min-w-0 flex-1">
          <span class="text-theme-sm mb-1.5 block text-gray-700 dark:text-gray-200">
            <span class="font-medium text-gray-900 dark:text-white">${title}</span>
            <span class="block text-sm text-gray-500 dark:text-gray-400">${message}</span>
          </span>
          <span class="text-theme-xs flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <span>${source}</span>
            <span class="h-1 w-1 rounded-full bg-gray-400"></span>
            <span>${time}</span>
          </span>
        </span>
      </button>
    </li>
  `;
}

export function initNotificationAdapter() {
  const notificationList = document.getElementById('notification-list');
  const emptyState = document.getElementById('notification-empty-state');
  const unreadBadge = document.getElementById('notification-unread-badge');
  const dropdown = document.getElementById('btn-notifications');

  if (!notificationList || !emptyState) {
    return;
  }

  let currentNotifications = [];

  function updateEmptyState() {
    const hasNotifications = currentNotifications.length > 0;
    notificationList.classList.toggle('hidden', !hasNotifications);
    emptyState.classList.toggle('hidden', hasNotifications);
  }

  function updateUnreadBadge() {
    if (!unreadBadge) return;
    const hasUnread = currentNotifications.some((item) => item.unread === true || item.read === false);
    unreadBadge.classList.toggle('hidden', !hasUnread);
  }

  function renderNotifications(notifications) {
    currentNotifications = Array.isArray(notifications) ? notifications : [];
    notificationList.innerHTML = currentNotifications
      .map((notification, index) => renderNotificationItem(notification, index))
      .join('');

    updateEmptyState();
    updateUnreadBadge();
  }

  function normalizePayload(detail) {
    if (Array.isArray(detail)) return detail;
    if (detail && Array.isArray(detail.notifications)) return detail.notifications;
    return [];
  }

  window.addEventListener(NOTIFICATION_EVENT, (evt) => {
    try {
      const notifications = normalizePayload(evt.detail);
      renderNotifications(notifications);
    } catch (error) {
      console.error('[NotificationAdapter] Failed to render notifications', error);
    }
  });

  notificationList.addEventListener('click', (evt) => {
    const item = evt.target.closest('[data-notification-id]');
    if (!item) return;
    const notificationId = item.getAttribute('data-notification-id');
    const notification = currentNotifications.find((note) => String(note.id ?? note.key ?? note.subject) === notificationId);

    window.dispatchEvent(
      new CustomEvent(NOTIFICATION_CLICK_EVENT, {
        detail: {
          id: notificationId,
          notification,
        },
      }),
    );
  });

  // Start in a clean empty state.
  renderNotifications([]);
}
