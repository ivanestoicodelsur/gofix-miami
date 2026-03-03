/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function loadEnvFromDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function printOk() {
  console.log('✅ Google Sheets configurado correctamente');
}

function printFail(reason) {
  console.log(`❌ Error: ${reason}`);
  process.exitCode = 1;
}

async function main() {
  loadEnvFromDotEnv();

  const credsPath = path.join(process.cwd(), 'config', 'google-credentials.json');
  if (!fs.existsSync(credsPath)) {
    return printFail('No existe config/google-credentials.json');
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    return printFail('GOOGLE_SPREADSHEET_ID no está definido en .env');
  }

  let google;
  try {
    google = require('googleapis').google;
  } catch {
    return printFail("Falta dependencia 'googleapis' (ejecuta npm i)");
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A1:A1',
    });

    printOk();
  } catch (e) {
    const message = e?.message ? String(e.message) : String(e);
    printFail(`Google Sheets API no responde: ${message}`);
  }
}

main();
