const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = globalThis.fetch || require('node-fetch');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function signJwt(header, payload, privateKey) {
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const toSign = `${encodedHeader}.${encodedPayload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  const signature = sign.sign(privateKey, 'base64');
  const encodedSig = signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${toSign}.${encodedSig}`;
}

async function getAccessToken(saPath, scopes) {
  const raw = fs.readFileSync(saPath, 'utf8');
  const key = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: key.client_email,
    scope: scopes.join(' '),
    aud: key.token_uri,
    exp: now + 3600,
    iat: now,
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const assertion = signJwt(header, payload, key.private_key);

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', assertion);

  const res = await fetch(key.token_uri, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`token request failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function main(){
  try{
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || process.argv[2];
    if(!spreadsheetId){
      console.error('Provide spreadsheetId as arg or set GOOGLE_SPREADSHEET_ID');
      process.exit(2);
    }
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || path.join(__dirname, '..', 'service-account.json.json');
    if(!fs.existsSync(keyPath)){
      console.error('service account file missing at', keyPath);
      process.exit(2);
    }
    console.log('Using service account file:', keyPath);
    const token = await getAccessToken(keyPath, ['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if(!resp.ok){
      const t = await resp.text();
      throw new Error(`Sheets API error ${resp.status}: ${t}`);
    }
    const js = await resp.json();
    const titles = (js.sheets || []).map(s => s.properties && s.properties.title).filter(Boolean);
    console.log('Found sheet titles:', titles);
  }catch(err){
    console.error('Fatal:', err.message || err);
    if(err.response) console.error(err.response);
    process.exit(1);
  }
}

main();
