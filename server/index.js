import express from 'express';
import webpush from 'web-push';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

// Database setup
const db = new Database(join(__dirname, 'notifications.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT,
    window TEXT,
    message TEXT,
    notification_type TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    read INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE,
    keys_p256dh TEXT,
    keys_auth TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Load or generate VAPID keys
const VAPID_FILE = join(__dirname, 'vapid-keys.json');
let vapidKeys;

if (fs.existsSync(VAPID_FILE)) {
  vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
  console.log('Generated new VAPID keys');
}

webpush.setVapidDetails(
  'mailto:notifications@claude-notify.local',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// API Routes

// Get VAPID public key (for client subscription)
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Subscribe to push notifications
app.post('/api/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO subscriptions (endpoint, keys_p256dh, keys_auth)
      VALUES (?, ?, ?)
    `);
    stmt.run(endpoint, keys.p256dh, keys.auth);
    res.json({ success: true });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Receive notification from Claude Code hook
app.post('/api/notify', async (req, res) => {
  const { session, window, message, notification_type } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }

  try {
    // Save to database
    const stmt = db.prepare(`
      INSERT INTO notifications (session, window, message, notification_type)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(session || '', window || '', message, notification_type || 'general');

    // Send push to all subscribed devices
    const subscriptions = db.prepare('SELECT * FROM subscriptions').all();

    const payload = JSON.stringify({
      title: `Claude: ${window || 'Notification'}`,
      body: message,
      data: {
        id: result.lastInsertRowid,
        session,
        window,
        notification_type
      }
    });

    const pushPromises = subscriptions.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys_p256dh,
          auth: sub.keys_auth
        }
      };

      return webpush.sendNotification(pushSubscription, payload)
        .catch(err => {
          // Remove invalid subscriptions
          if (err.statusCode === 410 || err.statusCode === 404) {
            db.prepare('DELETE FROM subscriptions WHERE endpoint = ?').run(sub.endpoint);
          }
          console.error('Push failed:', err.message);
        });
    });

    await Promise.all(pushPromises);

    res.json({
      success: true,
      id: result.lastInsertRowid,
      pushed: subscriptions.length
    });
  } catch (err) {
    console.error('Notify error:', err);
    res.status(500).json({ error: 'Failed to save notification' });
  }
});

// Get all notifications
app.get('/api/notifications', (req, res) => {
  try {
    const notifications = db.prepare(`
      SELECT * FROM notifications
      ORDER BY timestamp DESC
      LIMIT 50
    `).all();
    res.json(notifications);
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
app.patch('/api/notifications/:id/read', (req, res) => {
  try {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

// Delete notification
app.delete('/api/notifications/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// Clear all notifications
app.delete('/api/notifications', (req, res) => {
  try {
    db.prepare('DELETE FROM notifications').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve PWA for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Claude Notify server running on port ${PORT}`);
  console.log(`VAPID public key: ${vapidKeys.publicKey.substring(0, 20)}...`);
});
