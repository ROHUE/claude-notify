// Claude Notify PWA App

const API_BASE = '';
const TMUX_API = window.TMUX_API_URL || '';

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const subscribeBanner = document.getElementById('subscribeBanner');
const subscribeBtn = document.getElementById('subscribeBtn');
const notificationsContainer = document.getElementById('notifications');
const countEl = document.getElementById('count');
const clearAllBtn = document.getElementById('clearAllBtn');
const sessionsContainer = document.getElementById('sessions');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// State
let isSubscribed = false;
let swRegistration = null;

// Update app badge count
async function updateBadge(notifications) {
  if ('setAppBadge' in navigator) {
    const unreadCount = notifications ? notifications.filter(n => !n.read).length : 0;
    if (unreadCount > 0) {
      navigator.setAppBadge(unreadCount);
    } else {
      navigator.clearAppBadge();
    }
  }
}

// Initialize
async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered');

      // Check subscription status
      const subscription = await swRegistration.pushManager.getSubscription();
      isSubscribed = !!subscription;
      updateSubscriptionUI();
    } catch (err) {
      console.error('SW registration failed:', err);
      setStatus('error', 'SW failed');
    }
  } else {
    setStatus('error', 'Not supported');
  }

  // Load notifications
  await loadNotifications();

  // Auto-refresh every 30 seconds
  setInterval(loadNotifications, 30000);
}

// Update UI based on subscription status
function updateSubscriptionUI() {
  if (isSubscribed) {
    setStatus('subscribed', 'Subscribed');
    subscribeBanner.style.display = 'none';
  } else {
    setStatus('', 'Not subscribed');
    subscribeBanner.style.display = 'block';
  }
}

// Set status indicator
function setStatus(state, text) {
  statusDot.className = 'status-dot ' + state;
  statusText.textContent = text;
}

// Subscribe to push notifications
async function subscribe() {
  subscribeBtn.disabled = true;
  subscribeBtn.textContent = 'Subscribing...';

  try {
    // Get VAPID public key
    const res = await fetch(`${API_BASE}/api/vapid-public-key`);
    const { publicKey } = await res.json();

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permission denied');
    }

    // Subscribe to push
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    // Send subscription to server
    await fetch(`${API_BASE}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON())
    });

    isSubscribed = true;
    updateSubscriptionUI();
  } catch (err) {
    console.error('Subscribe failed:', err);
    setStatus('error', 'Subscribe failed');
    subscribeBtn.textContent = 'Try Again';
    subscribeBtn.disabled = false;
  }
}

// Load notifications from server
async function loadNotifications() {
  try {
    const res = await fetch(`${API_BASE}/api/notifications`);
    const notifications = await res.json();

    renderNotifications(notifications);
    updateBadge(notifications);
  } catch (err) {
    console.error('Failed to load notifications:', err);
    renderError('Failed to load notifications');
  }
}

// Render error state
function renderError(message) {
  notificationsContainer.replaceChildren();
  const div = document.createElement('div');
  div.className = 'empty';

  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.textContent = '!';

  const p = document.createElement('p');
  p.textContent = message;

  div.appendChild(icon);
  div.appendChild(p);
  notificationsContainer.appendChild(div);
}

// Render notifications list
function renderNotifications(notifications) {
  notificationsContainer.replaceChildren();

  if (!notifications || notifications.length === 0) {
    const div = document.createElement('div');
    div.className = 'empty';

    const icon = document.createElement('div');
    icon.className = 'empty-icon';
    icon.textContent = '\u{1F514}'; // Bell emoji

    const p1 = document.createElement('p');
    p1.textContent = 'No notifications yet';

    const p2 = document.createElement('p');
    p2.style.marginTop = '0.5rem';
    p2.style.fontSize = '0.875rem';
    p2.textContent = "You'll see Claude Code notifications here";

    div.appendChild(icon);
    div.appendChild(p1);
    div.appendChild(p2);
    notificationsContainer.appendChild(div);

    countEl.textContent = '';
    clearAllBtn.style.display = 'none';
    return;
  }

  const unread = notifications.filter(n => !n.read).length;
  const countText = `${notifications.length} notification${notifications.length !== 1 ? 's' : ''}`;
  countEl.textContent = unread > 0 ? `${countText} (${unread} unread)` : countText;
  clearAllBtn.style.display = 'block';

  notifications.forEach(n => {
    const card = document.createElement('div');
    card.className = 'notification' + (n.read ? ' read' : '');
    card.dataset.id = n.id;

    // Header
    const header = document.createElement('div');
    header.className = 'notification-header';

    const session = document.createElement('div');
    session.className = 'notification-session';
    if (n.session) {
      const span = document.createElement('span');
      span.textContent = n.session;
      session.appendChild(span);
      session.appendChild(document.createTextNode('/' + (n.window || 'unknown')));
    } else {
      session.textContent = 'Unknown session';
    }

    const time = document.createElement('div');
    time.className = 'notification-time';
    time.textContent = formatTime(n.timestamp);

    header.appendChild(session);
    header.appendChild(time);

    // Message
    const message = document.createElement('div');
    message.className = 'notification-message';
    message.textContent = n.message;

    card.appendChild(header);
    card.appendChild(message);

    // Type badge
    if (n.notification_type) {
      const typeBadge = document.createElement('div');
      typeBadge.className = 'notification-type';
      typeBadge.textContent = n.notification_type;
      card.appendChild(typeBadge);
    }

    // Actions
    const actions = document.createElement('div');
    actions.className = 'notification-actions';

    if (n.terminalUrl || (n.session && window.TTYD_URL)) {
      const terminalBtn = document.createElement('button');
      terminalBtn.textContent = 'Terminal';
      terminalBtn.style.background = 'var(--blue)';
      terminalBtn.addEventListener('click', () => {
        // Build tmux target: session:window
        const target = n.window ? `${n.session}:${n.window}` : n.session;
        const url = n.terminalUrl || `${window.TTYD_URL}/?arg=${encodeURIComponent(target)}`;
        window.open(url, '_blank');
      });
      actions.appendChild(terminalBtn);
    }

    if (!n.read) {
      const readBtn = document.createElement('button');
      readBtn.textContent = 'Mark Read';
      readBtn.addEventListener('click', () => markRead(n.id));
      actions.appendChild(readBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'secondary';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteNotification(n.id));
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    notificationsContainer.appendChild(card);
  });
}

// Mark notification as read
async function markRead(id) {
  try {
    await fetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'PATCH' });
    await loadNotifications();
  } catch (err) {
    console.error('Failed to mark read:', err);
  }
}

// Delete notification
async function deleteNotification(id) {
  try {
    await fetch(`${API_BASE}/api/notifications/${id}`, { method: 'DELETE' });
    await loadNotifications();
  } catch (err) {
    console.error('Failed to delete:', err);
  }
}

// Clear all notifications
async function clearAll() {
  if (!confirm('Clear all notifications?')) return;

  clearAllBtn.disabled = true;
  clearAllBtn.textContent = 'Clearing...';

  try {
    const res = await fetch(`${API_BASE}/api/notifications`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    await loadNotifications();
  } catch (err) {
    console.error('Failed to clear:', err);
    alert('Failed to clear notifications: ' + err.message);
  } finally {
    clearAllBtn.disabled = false;
    clearAllBtn.textContent = 'Clear All';
  }
}

// Utility: Format timestamp
function formatTime(timestamp) {
  // Server stores UTC - append Z if no timezone marker
  const utcTimestamp = timestamp.includes('Z') || timestamp.includes('+')
    ? timestamp
    : timestamp.replace(' ', 'T') + 'Z';
  const date = new Date(utcTimestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Utility: Convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Tab switching
function switchTab(tabName) {
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === tabName + 'Tab');
  });

  if (tabName === 'sessions') {
    loadSessions();
  }
}

// Load tmux sessions
async function loadSessions() {
  if (!TMUX_API) {
    renderSessionsError('Tmux API not configured');
    return;
  }

  try {
    const res = await fetch(`${TMUX_API}/api/sessions`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    renderSessions(data.sessions);
  } catch (err) {
    console.error('Failed to load sessions:', err);
    renderSessionsError('Failed to load sessions');
  }
}

// Render sessions error
function renderSessionsError(message) {
  sessionsContainer.innerHTML = `
    <div class="sessions-error">
      <p>${message}</p>
      <button class="refresh-btn" onclick="loadSessions()">Retry</button>
    </div>
  `;
}

// Render sessions list
function renderSessions(sessions) {
  sessionsContainer.replaceChildren();

  if (!sessions || sessions.length === 0) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.innerHTML = `
      <div class="empty-icon">\u{1F4BB}</div>
      <p>No tmux sessions found</p>
      <button class="refresh-btn" onclick="loadSessions()">Refresh</button>
    `;
    sessionsContainer.appendChild(div);
    return;
  }

  sessions.forEach(session => {
    const card = document.createElement('div');
    card.className = 'session-card';

    // Header
    const header = document.createElement('div');
    header.className = 'session-header';
    header.addEventListener('click', () => {
      card.classList.toggle('expanded');
    });

    const nameDiv = document.createElement('div');
    nameDiv.className = 'session-name';
    nameDiv.textContent = session.name;

    const badge = document.createElement('span');
    badge.className = 'session-badge ' + (session.attached ? 'attached' : 'detached');
    badge.textContent = session.attached ? 'attached' : 'detached';
    nameDiv.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'session-meta';
    meta.textContent = `${session.windows.length} window${session.windows.length !== 1 ? 's' : ''}`;

    header.appendChild(nameDiv);
    header.appendChild(meta);
    card.appendChild(header);

    // Windows
    const windowsDiv = document.createElement('div');
    windowsDiv.className = 'session-windows';

    session.windows.forEach(win => {
      const windowItem = document.createElement('div');
      windowItem.className = 'window-item';

      const info = document.createElement('div');
      info.className = 'window-info';

      const winName = document.createElement('div');
      winName.className = 'window-name';

      const index = document.createElement('span');
      index.className = 'index';
      index.textContent = `${win.index}:`;
      winName.appendChild(index);

      winName.appendChild(document.createTextNode(win.name));

      if (win.active) {
        const activeDot = document.createElement('span');
        activeDot.className = 'active-dot';
        winName.appendChild(activeDot);
      }

      info.appendChild(winName);

      // Show pane title if available
      if (win.panes && win.panes.length > 0) {
        const pane = win.panes[0];
        if (pane.title) {
          const title = document.createElement('div');
          title.className = 'window-title';
          title.textContent = pane.title;
          info.appendChild(title);
        }
        const cmd = document.createElement('div');
        cmd.className = 'window-command';
        cmd.textContent = pane.command;
        info.appendChild(cmd);
      }

      windowItem.appendChild(info);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'window-actions';

      const switchBtn = document.createElement('button');
      switchBtn.textContent = 'Switch';
      switchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        switchToWindow(session.name, win.index, e.target);
      });
      actions.appendChild(switchBtn);

      const termBtn = document.createElement('button');
      termBtn.textContent = 'Terminal';
      termBtn.style.background = 'var(--blue)';
      termBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = `${session.name}:${win.index}`;
        window.open(`${window.TTYD_URL}/?arg=${encodeURIComponent(target)}`, '_blank');
      });
      actions.appendChild(termBtn);

      windowItem.appendChild(actions);
      windowsDiv.appendChild(windowItem);
    });

    card.appendChild(windowsDiv);
    sessionsContainer.appendChild(card);
  });
}

// Switch to a specific window
async function switchToWindow(session, windowIndex, btnElement) {
  try {
    const res = await fetch(`${TMUX_API}/api/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, window: windowIndex })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const result = await res.json();
    if (result.success && btnElement) {
      // Visual feedback
      const originalText = btnElement.textContent;
      btnElement.textContent = 'Switched!';
      btnElement.disabled = true;
      setTimeout(() => {
        btnElement.textContent = originalText;
        btnElement.disabled = false;
      }, 1000);
    }
  } catch (err) {
    console.error('Failed to switch:', err);
    alert('Failed to switch: ' + err.message);
  }
}

// Event listeners
subscribeBtn.addEventListener('click', subscribe);
clearAllBtn.addEventListener('click', clearAll);

// Tab event listeners
tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// Start app
init();
