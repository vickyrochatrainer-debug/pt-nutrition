const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SPREADSHEET_ID = '1byoibj1SLQayKYf8mNB7f9zgn8k6Ti0BOhdy-d-mFQ8';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

let cachedToken = null;
let tokenExpiry = 0;

function loadCredentials() {
  if (process.env.GOOGLE_CREDENTIALS) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS);
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const creds = loadCredentials();
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const assertion = jwt.sign(payload, creds.private_key, { algorithm: 'RS256' });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Token error: ${data.error_description || data.error}`);

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

app.get('/api/clients', async (req, res) => {
  try {
    const token = await getAccessToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/A:ZZ`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error?.message || 'Sheets API error');

    const rows = data.values;
    if (!rows || rows.length < 2) {
      return res.json({ clients: [], headers: [] });
    }

    const headers = rows[0];
    const clients = rows.slice(1).map((row, index) => {
      const client = {};
      headers.forEach((header, i) => {
        client[header] = row[i] || '';
      });
      client._rowIndex = index;
      return client;
    });

    res.json({ clients, headers });
  } catch (error) {
    console.error('Error fetching clients:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PT Nutrition Generator running at http://localhost:${PORT}`);
});
