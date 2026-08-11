const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const TENANT = 'secretalchemist1';
const USERNAME = 'purchase@secretalchemist.com';
const PASSWORD = process.env.UNIWARE_PASSWORD;

const FACILITIES = [
  { code: 'secretalchemist1', name: 'Secret Alchemist' },
  { code: 'Hydrabad', name: 'Shiprocket Hyderabad FC' }
];

let cachedToken = null;
let tokenExpiry = null;

async function getToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) return cachedToken;
  const url = `https://${TENANT}.unicommerce.com/oauth/token?grant_type=password&client_id=my-trusted-client&username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`;
  const res = await fetch(url);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { throw new Error('Token failed: ' + text.substring(0,200)); }
  if (!data.access_token) throw new Error('No token: ' + JSON.stringify(data));
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
  return cachedToken;
}

async function fetchInventory(token, facilityCode) {
  const res = await fetch(
    `https://${TENANT}.unicommerce.com/services/rest/v1/inventory/inventorySnapshot/get`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Facility': facilityCode
      },
      body: JSON.stringify({ pageNumber: 0, pageSize: 500 })
    }
  );
  const text = await res.text();
  if (res.status !== 200) return { error: 'Status ' + res.status, raw: text.substring(0,300) };
  try { return { data: JSON.parse(text) }; }
  catch(e) { return { error: 'Parse failed', raw: text.substring(0,300) }; }
}

app.get('/api/debug', async (req, res) => {
  try {
    const token = await getToken();
    const results = {};
    for (const fac of FACILITIES) {
      results[fac.code] = await fetchInventory(token, fac.code);
    }
    res.json({ token_ok: true, results });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const token = await getToken();
    let allItems = [];
    for (const fac of FACILITIES) {
      const r = await fetchInventory(token, fac.code);
      if (r.data) {
        const items = r.data.inventorySnapshotList || r.data.inventory || r.data.itemInventoryList || [];
        allItems = allItems.concat(items.map(i => ({ ...i, facilityCode: fac.code, facilityName: fac.name })));
      }
    }
    res.json({ success: true, data: { inventorySnapshotList: allItems }, syncTime: new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
