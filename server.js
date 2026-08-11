const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const TENANT = 'secretalchemist1';
const USERNAME = 'purchase@secretalchemist.com';
const PASSWORD = process.env.UNIWARE_PASSWORD;

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

async function tryInventory(token, facilityCode) {
  const res = await fetch(`https://${TENANT}.unicommerce.com/services/rest/v1/inventory/inventorySnapshot/get`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Facility': facilityCode
    },
    body: JSON.stringify({ pageNumber: 0, pageSize: 500 })
  });
  const text = await res.text();
  try { return { ok: res.status === 200, status: res.status, data: JSON.parse(text) }; }
  catch(e) { return { ok: false, status: res.status, raw: text.substring(0, 300) }; }
}

app.get('/api/debug', async (req, res) => {
  try {
    const token = await getToken();
    const r1 = await tryInventory(token, 'secretalchemist1');
    const r2 = await tryInventory(token, 'SHIPROCKET_HYD');
    res.json({ token_ok: true, secretalchemist1: r1, shiprocket: r2 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const token = await getToken();
    const facilities = ['secretalchemist1', 'SHIPROCKET_HYD'];
    let allItems = [];
    for (const fac of facilities) {
      const r = await tryInventory(token, fac);
      if (r.ok && r.data) {
        const items = r.data.inventorySnapshotList || r.data.inventory || [];
        allItems = allItems.concat(items.map(i => ({ ...i, _facility: fac })));
      }
    }
    res.json({ success: true, data: { inventorySnapshotList: allItems }, syncTime: new Date().toISOString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
