// ══════════════════════════════════════════════
// Instacart Developer Platform — Shopping List API
// POST /api/instacart
// Body: { items: [{ name, quantity, unit }], zipCode }
// Returns: { url: "https://..." }
// ══════════════════════════════════════════════

const INSTACART_BASE = 'https://connect.instacart.com';

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.INSTACART_API_KEY;
  if (!apiKey) {
    return res.status(501).json({
      error: 'Instacart API key not configured',
      fallback: true
    });
  }

  const { items, zipCode } = req.body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }

  const zip = zipCode || '78666'; // default San Marcos, TX area

  try {
    // Step 1: Find H-E-B retailer for this zip code
    const retailerKey = await findHebRetailer(apiKey, zip);

    // Step 2: Create shopping list page
    const listUrl = await createShoppingList(apiKey, items, retailerKey);

    return res.status(200).json({ url: listUrl });
  } catch (err) {
    console.error('Instacart API error:', err.message || err);
    return res.status(500).json({
      error: 'Failed to create Instacart shopping list',
      detail: err.message || 'Unknown error',
      fallback: true
    });
  }
};

async function findHebRetailer(apiKey, zipCode) {
  const resp = await fetch(`${INSTACART_BASE}/idp/v1/retailers?postal_code=${zipCode}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Retailer lookup failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const retailers = data.retailers || data.data || [];

  // Look for H-E-B by name (case-insensitive)
  const heb = retailers.find(r =>
    (r.name || '').toLowerCase().includes('h-e-b') ||
    (r.name || '').toLowerCase().includes('heb') ||
    (r.retailer_key || r.key || '').toLowerCase().includes('heb')
  );

  if (heb) {
    return heb.retailer_key || heb.key || heb.id;
  }

  // Fallback: return null, we'll create list without retailer filter
  console.warn('H-E-B not found for zip', zipCode, '— available:', retailers.map(r => r.name).join(', '));
  return null;
}

async function createShoppingList(apiKey, items, retailerKey) {
  const payload = {
    title: "Beag's Brain Grocery List",
    line_items: items.map(item => ({
      name: item.name,
      quantity: item.quantity || 1,
      unit: item.unit || 'each'
    }))
  };

  // Include retailer if found
  if (retailerKey) {
    payload.retailer_key = retailerKey;
  }

  const resp = await fetch(`${INSTACART_BASE}/idp/v1/products/shopping_list`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Shopping list creation failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  let url = data.url || data.shopping_list_url || data.data?.url || '';

  // Append retailer_key to URL if we have it and it's not already in the URL
  if (retailerKey && url && !url.includes('retailer_key')) {
    const separator = url.includes('?') ? '&' : '?';
    url += `${separator}retailer_key=${retailerKey}`;
  }

  if (!url) {
    throw new Error('No URL returned from Instacart API');
  }

  return url;
}
