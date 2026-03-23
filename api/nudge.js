const webpush = require('web-push');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { subscription, title, body } = req.body || {};

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing subscription' });
    }

    // Validate env vars
    const vapidEmail = process.env.VAPID_EMAIL;
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

    if (!vapidEmail || !vapidPublic || !vapidPrivate) {
      return res.status(500).json({
        error: 'VAPID keys not configured',
        detail: 'Missing: ' + [
          !vapidEmail && 'VAPID_EMAIL',
          !vapidPublic && 'VAPID_PUBLIC_KEY',
          !vapidPrivate && 'VAPID_PRIVATE_KEY'
        ].filter(Boolean).join(', ')
      });
    }

    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

    // Ensure subscription has required format
    const pushSub = {
      endpoint: subscription.endpoint,
      keys: {
        auth: subscription.keys && subscription.keys.auth,
        p256dh: subscription.keys && subscription.keys.p256dh
      }
    };

    if (!pushSub.keys.auth || !pushSub.keys.p256dh) {
      return res.status(400).json({ error: 'Invalid subscription — missing keys', keys: subscription.keys });
    }

    const payload = JSON.stringify({
      title: title || "Beag's Brain",
      body: body || 'You have a new nudge!'
    });

    await webpush.sendNotification(pushSub, payload);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Push failed:', err.message, err.statusCode, err.body);

    if (err.statusCode === 410 || err.statusCode === 404) {
      return res.status(410).json({ error: 'Subscription expired', code: 'EXPIRED' });
    }

    return res.status(500).json({
      error: 'Push failed',
      detail: err.message,
      statusCode: err.statusCode || null
    });
  }
};
