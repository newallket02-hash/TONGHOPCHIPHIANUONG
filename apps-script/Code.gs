/**
 * Code.gs — Web App endpoint nhan JSON hoa don tu Vercel va ghi vao Raw_Data
 *
 * Deploy: Apps Script > Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Copy URL ...\/exec vao bien moi truong APPS_SCRIPT_URL tren Vercel.
 *
 * Bao mat: endpoint mo cong khai nen BAT BUOC phai co shared secret.
 *   Apps Script > Project Settings > Script Properties:
 *   key = SHARED_SECRET, value = chuoi ngau nhien dai (giong het bien tren Vercel)
 */

var SHEET_NAME = 'Raw_Data';
var VALID_MEALS = ['Bữa sáng', 'Bữa trưa', 'Bữa tối', 'Café / Ăn vặt', 'Đi chợ / Siêu thị'];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    var expected = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (!expected) return json_({ ok: false, error: 'SHARED_SECRET chưa được đặt trong Script Properties' });
    if (body.token !== expected) return json_({ ok: false, error: 'Sai token' });

    var items = body.items || [];
    if (!items.length) return json_({ ok: false, error: 'Không có dòng nào để ghi' });

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
      if (!sh) return json_({ ok: false, error: 'Không tìm thấy tab ' + SHEET_NAME + ' — chạy setupSpreadsheet() trước' });

      var lastRow = lastDataRow_(sh);

      var invoiceId = String(body.invoice_id || '').trim();
      if (invoiceId && isDuplicate_(sh, lastRow, invoiceId)) {
        return json_({ ok: false, duplicate: true, error: 'Hóa đơn ' + invoiceId + ' đã được ghi trước đó' });
      }

      var date = normalizeDate_(body.date);
      var store = String(body.store_name || '').trim();
      var stamp = new Date();
      var source = (body.source || 'Groq Vision') + ' • ' + Utilities.formatDate(stamp, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm');

      var rows = items.map(function (it) {
        var qty = toNumber_(it.qty);
        var unit = toNumber_(it.unit_price);
        var total = toNumber_(it.total_price);
        // Bat buoc SL * Don gia = Thanh tien, vi cot H la ARRAYFORMULA F*G
        if (!qty || !unit) { qty = qty || 1; unit = total ? total / qty : unit; }
        return [
          date,
          invoiceId,
          VALID_MEALS.indexOf(it.meal_type) >= 0 ? it.meal_type : guessMeal_(date, it.meal_type),
          store,
          String(it.name || '').trim(),
          qty,
          Math.round(unit),
          '',                                   // H: ARRAYFORMULA tu tinh, khong ghi de
          String(it.tag || '').trim(),
          String(it.note || body.note || '').trim(),
          '', '',                               // K, L: ARRAYFORMULA
          source
        ];
      });

      var startRow = lastRow + 1;
      var needed = startRow + rows.length - 1 - sh.getMaxRows();
      if (needed > 0) sh.insertRowsAfter(sh.getMaxRows(), needed + 100);

      // Chi ghi cot A:G, I:J, M — bo qua cot cong thuc H, K, L
      sh.getRange(startRow, 1, rows.length, 7).setValues(rows.map(function (r) { return r.slice(0, 7); }));
      sh.getRange(startRow, 9, rows.length, 2).setValues(rows.map(function (r) { return [r[8], r[9]]; }));
      sh.getRange(startRow, 13, rows.length, 1).setValues(rows.map(function (r) { return [r[12]]; }));

      SpreadsheetApp.flush();
      return json_({ ok: true, rows: rows.length, invoice_id: invoiceId, start_row: startRow });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Health check: mo URL ...\/exec tren trinh duyet de kiem tra deploy */
function doGet() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  return json_({ ok: true, sheet: SHEET_NAME, rows: sh ? Math.max(lastDataRow_(sh) - 1, 0) : null });
}

/**
 * KHONG dung sh.getLastRow(): cot H, K, L la ARRAYFORMULA phu ca cot va tra ve ""
 * cho moi dong trong. Google Sheets coi "" la CO noi dung, nen getLastRow() luon
 * bang so dong toi da cua sheet (mac dinh 1000) du bang chua co du lieu nao.
 * Dong du lieu that duoc xac dinh bang cot A (Ngay) - cot nay khong co cong thuc.
 */
function lastDataRow_(sh) {
  var vals = sh.getRange(1, 1, sh.getMaxRows(), 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).trim() !== '') return i + 1;
  }
  return 1;
}

function isDuplicate_(sh, lastRow, invoiceId) {
  if (lastRow < 2) return false;
  var ids = sh.getRange(2, 2, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === invoiceId) return true;
  }
  return false;
}

function normalizeDate_(v) {
  if (!v) return new Date();
  var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  var n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** Khong doan duoc bua tu AI thi suy ra tu gio ghi nhan */
function guessMeal_(date, raw) {
  if (raw) {
    var r = String(raw).toLowerCase();
    if (r.indexOf('sáng') >= 0) return 'Bữa sáng';
    if (r.indexOf('trưa') >= 0) return 'Bữa trưa';
    if (r.indexOf('tối') >= 0) return 'Bữa tối';
    if (r.indexOf('chợ') >= 0 || r.indexOf('siêu thị') >= 0) return 'Đi chợ / Siêu thị';
    if (r.indexOf('café') >= 0 || r.indexOf('cafe') >= 0 || r.indexOf('vặt') >= 0) return 'Café / Ăn vặt';
  }
  var h = new Date().getHours();
  if (h < 10) return 'Bữa sáng';
  if (h < 14) return 'Bữa trưa';
  if (h < 17) return 'Café / Ăn vặt';
  return 'Bữa tối';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
