const webpush = require('web-push');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subscription, title, body } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' });
  }

  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: title || "Beag's Brain",
        body: body || 'You have a new nudge!'
      })
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Push failed:', err);
    // 410 = subscription expired/unsubscribed
    if (err.statusCode === 410) {
      return res.status(410).json({ error: 'Subscription expired', code: 'EXPIRED' });
    }
    return res.status(500).json({ error: 'Push failed', detail: err.message });
  }
};
