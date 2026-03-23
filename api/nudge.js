// Nudge API — currently unused, nudges sent via iMessage directly from client
// This endpoint is reserved for future SMS/email integration
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(200).json({ success: true, method: 'imessage' });
};
