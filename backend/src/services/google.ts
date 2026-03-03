import { google } from "googleapis";
import fs from "fs";

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive'
];

function getAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH not set');
  const keyFile = fs.readFileSync(keyPath, 'utf8');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(keyFile),
    scopes: SCOPES,
  });
  return auth;
}

export async function fetchSheetRows(spreadsheetId: string, range = 'Sheet1!A:Z') {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

export async function appendSheetRow(spreadsheetId: string, values: any[] = []) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.append({ spreadsheetId, range: 'Sheet1!A:Z', valueInputOption: 'USER_ENTERED', requestBody: { values: [values] } });
  return res.data;
}

export async function uploadFileToDrive(name: string, mimeType: string, buffer: Buffer | any) {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.create({
    requestBody: { name, mimeType },
    media: { mimeType, body: buffer }
  });
  return res.data;
}
