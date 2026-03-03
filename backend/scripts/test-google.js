const { google } = require('googleapis');
const path = require('path');

async function main() {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || process.argv[2];
    if (!spreadsheetId) {
      console.error('ERROR: set env GOOGLE_SPREADSHEET_ID or pass it as the first arg');
      process.exit(2);
    }

    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || path.join(__dirname, '..', 'service-account.json.json');

    console.log('Using key file:', keyPath);
    console.log('Using spreadsheetId:', spreadsheetId);

    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:E10',
    });

    console.log('Rows:', JSON.stringify(res.data.values || [], null, 2));
  } catch (err) {
    console.error('Fatal error:', err.message || err);
    if (err.response && err.response.data) console.error('Google API response:', JSON.stringify(err.response.data));
    process.exit(1);
  }
}

main();
