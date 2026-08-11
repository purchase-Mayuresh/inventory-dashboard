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
  try { data = JSON.parse(text); } catch(e) { throw new Error('Token parse failed: ' + text.substring(0,200)); }
  if (!data.access_token) throw new Error('Auth failed: ' + JSON.stringify(data));
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
  return cachedToken;
}

app.get('/api/inventory', async (req, res) => {
  try {
    const token = await getToken();
    const invRes = await fetch(`https://${TENANT}.unicommerce.com/services/rest/v1/inventory/inventorySnapshot/get`, {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer ' + token, 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ pageNumber: 0, pageSize: 500 })
    });
    const text = await invRes.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { 
      throw new Error('Inventory parse failed (status ' + invRes.status + '): ' + text.substring(0,300));
    }
    res.json({ success: true, data, syncTime: new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
