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

let tokenCache = {};

async function getToken(facilityCode) {
  const now = Date.now();
  if (tokenCache[facilityCode] && tokenCache[facilityCode].expiry > now) {
    return tokenCache[facilityCode].token;
  }
  const url = `https://${TENANT}.unicommerce.com/oauth/token?grant_type=password&client_id=my-trusted-client&username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}&facility_code=${encodeURIComponent(facilityCode)}`;
  const res = await fetch(url);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { throw new Error('Token failed for ' + facilityCode + ': ' + text.substring(0,200)); }
  if (!data.access_token) throw new Error('No token for ' + facilityCode + ': ' + JSON.stringify(data));
  tokenCache[facilityCode] = { token: data.access_token, expiry: now + (data.expires_in * 1000) - 60000 };
  return data.access_token;
}

async function fetchInventory(facilityCode) {
  const token = await getToken(facilityCode);
  const res = await fetch(
    `https://${TENANT}.unicommerce.com/services/rest/v1/inventory/inventorySnapshot/get`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ pageNumber: 0, pageSize: 500 })
    }
  );
  const text = await res.text();
  if (res.status !== 200) return { error: 'Status ' + res.status, raw: text.substring(0,400) };
  try { return { data: JSON.parse(text) }; }
  catch(e) { return { error: 'Parse failed', raw: text.substring(0,400) }; }
}

app.get('/api/debug', async (req, res) => {
  try {
    const results = {};
    for (const fac of FACILITIES) {
      try { results[fac.code] = await fetchInventory(fac.code); }
      catch(e) { results[fac.code] = { error: e.message }; }
    }
    res.json({ results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventory', async (req, res) => {
  try {
    let allItems = [];
    for (const fac of FACILITIES) {
      try {
        const r = await fetchInventory(fac.code);
        if (r.data) {
          const items = r.data.inventorySnapshotList || r.data.inventory || r.data.itemInventoryList || [];
          allItems = allItems.concat(items.map(i => ({ ...i, facilityCode: fac.code, facilityName: fac.name })));
        }
      } catch(e) { console.log('Facility error:', fac.code, e.message); }
    }
    res.json({ success: true, data: { inventorySnapshotList: allItems }, syncTime: new Date().toISOString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
