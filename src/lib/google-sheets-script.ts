/**
 * The exact Google Apps Script customers paste into their own Google account
 * for the Google Sheets integration. Shown in the Google Sheets setup dialog
 * (Settings → Integrations → Google Sheets) so the flow is fully self-serve.
 *
 * The script is container-bound (created from a sheet via Extensions → Apps
 * Script), so SpreadsheetApp.getActiveSpreadsheet() always resolves.
 *
 * Keep this in sync with the payload MunchReach POSTs: a flat JSON object
 * { event, ...payload } where lead events carry `lead` and campaign/reply
 * events carry `summary` / `message` / `campaign`.
 */
export const GOOGLE_SHEETS_APPS_SCRIPT = `/**
 * MunchReach → Google Sheets
 * Receives MunchReach events (new lead, reply, campaign completed, meeting
 * booked) and appends one row per event to the "MunchReach" tab of this
 * spreadsheet. The tab and its header row are created automatically on the
 * first event.
 */

var SHEET_NAME = "MunchReach";

var HEADERS = [
  "Timestamp",
  "Event",
  "Email",
  "First name",
  "Last name",
  "Company",
  "Campaign",
  "Summary",
  "Raw JSON"
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents || "{}");
    var lead = data.lead || {};
    var sheet = getTargetSheet_();

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.event || "",
      lead.email || "",
      lead.first_name || "",
      lead.last_name || "",
      lead.company || "",
      (data.campaign && data.campaign.name) || data.campaign_name || "",
      data.summary || data.message || "",
      JSON.stringify(data)
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getTargetSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }
  return sheet;
}

// Optional: open the web app URL in a browser to confirm it is live.
function doGet() {
  return ContentService.createTextOutput("MunchReach receiver is running.");
}
`;

export const GOOGLE_SHEETS_SETUP_STEPS: Array<{ title: string; text: string }> = [
  {
    title: "Create a Google Sheet",
    text: "Go to sheets.new and give the spreadsheet a name, e.g. “MunchReach events”.",
  },
  {
    title: "Open Apps Script",
    text: "In the sheet, open Extensions → Apps Script. Delete any code in the editor.",
  },
  {
    title: "Paste the script",
    text: "Copy the code below, paste it into the editor and press Save.",
  },
  {
    title: "Deploy as a web app",
    text: "Click Deploy → New deployment → Web app. Set “Execute as” to Me and “Who has access” to Anyone, then Deploy and authorize with your Google account.",
  },
  {
    title: "Paste the URL above",
    text: "Copy the Web app URL (it ends in /exec) into the field on this screen, connect, then send a test — a row appears in your sheet within seconds.",
  },
];
