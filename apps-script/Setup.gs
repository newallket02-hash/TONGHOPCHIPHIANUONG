/**
 * Setup.gs — chay 1 lan de dung toan bo cau truc bang tinh
 * Quan_Ly_Chi_Phi_An_Uong_Groq_AI
 *
 * Cach dung: Extensions > Apps Script > dan file nay > chon ham setupSpreadsheet > Run
 * Chay lai duoc nhieu lan (idempotent): tab da co se duoc reset header/cong thuc,
 * DU LIEU trong Raw_Data KHONG bi xoa.
 */

var MEAL_TYPES = ['Bữa sáng', 'Bữa trưa', 'Bữa tối', 'Café / Ăn vặt', 'Đi chợ / Siêu thị'];
var NUTRITION_TAGS = ['Đạm', 'Tinh bột', 'Rau xanh', 'Trái cây', 'Đồ uống ngọt', 'Đồ uống khác', 'Khác'];

var NAVY = '#2F4F4F';      // celadon-dark: header
var CELADON = '#AEC9B4';   // celadon: nhan phu
var CELADON_LT = '#E8F1EA';
var GOLD = '#C9A227';      // gold: KPI / diem nhan
var GOLD_LT = '#FBF3D9';

function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Formula dung dau phay "," => ep locale en_US. Dinh dang tien van hien thi ₫.
  ss.setSpreadsheetLocale('en_US');
  ss.setSpreadsheetTimeZone('Asia/Ho_Chi_Minh');

  var raw = setupRawData_(ss);
  setupDashboard_(ss);
  setupMenu_(ss);
  cleanupDefaultSheet_(ss);

  ss.setActiveSheet(ss.getSheetByName('Dashboard'));
  SpreadsheetApp.getUi().alert('Đã dựng xong 3 tab: Raw_Data, Dashboard, Menu_De_Xuat.');
}

/* ------------------------------------------------------------------ RAW_DATA */
function setupRawData_(ss) {
  var sh = ss.getSheetByName('Raw_Data') || ss.insertSheet('Raw_Data', 0);

  var headers = ['Ngày', 'Mã HĐ', 'Bữa', 'Cửa hàng', 'Món / Mặt hàng', 'SL', 'Đơn giá',
                 'Thành tiền', 'Nhóm dinh dưỡng', 'Ghi chú', 'Tuần', 'Tháng', 'Nguồn ghi'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);

  // H, K, L la cot tinh tu dong -> xoa sach roi ghi ARRAYFORMULA de bat het dong moi do API append
  if (sh.getMaxRows() > 1) {
    sh.getRange(2, 8, sh.getMaxRows() - 1, 1).clearContent();   // H
    sh.getRange(2, 11, sh.getMaxRows() - 1, 2).clearContent();  // K, L
  }
  sh.getRange('H1').setFormula(
    '=ARRAYFORMULA(IF(ROW(A:A)=1,"Thành tiền",IF(A:A="","",IFERROR(N(F:F)*N(G:G),0))))');
  sh.getRange('K1').setFormula(
    '=ARRAYFORMULA(IF(ROW(A:A)=1,"Tuần",IF(A:A="","","T"&TEXT(ISOWEEKNUM(A:A),"00")&"/"&YEAR(A:A))))');
  sh.getRange('L1').setFormula(
    '=ARRAYFORMULA(IF(ROW(A:A)=1,"Tháng",IF(A:A="","",TEXT(A:A,"YYYY-MM"))))');

  // Dinh dang
  sh.getRange(1, 1, 1, headers.length)
    .setBackground(NAVY).setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 38);

  sh.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  sh.getRange('F2:F').setNumberFormat('#,##0.##');
  sh.getRange('G2:H').setNumberFormat('#,##0 "₫"');
  sh.getRange('M2:M').setNumberFormat('yyyy-mm-dd hh:mm');

  var widths = [95, 130, 120, 170, 240, 55, 100, 110, 130, 220, 80, 80, 140];
  for (var i = 0; i < widths.length; i++) sh.setColumnWidth(i + 1, widths[i]);

  // Dropdown
  sh.getRange('C2:C').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(MEAL_TYPES, true).setAllowInvalid(true).build());
  sh.getRange('I2:I').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(NUTRITION_TAGS, true).setAllowInvalid(true).build());

  // To mau xen ke theo bua an cho de doc
  sh.setConditionalFormatRules([]);
  var rules = [];
  var colors = [GOLD_LT, '#EAF3FB', '#F3E8F1', '#FDEDE3', CELADON_LT];
  for (var m = 0; m < MEAL_TYPES.length; m++) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$C2="' + MEAL_TYPES[m] + '"')
      .setBackground(colors[m])
      .setRanges([sh.getRange('A2:M')]).build());
  }
  sh.setConditionalFormatRules(rules);

  if (sh.getMaxColumns() > headers.length) {
    sh.deleteColumns(headers.length + 1, sh.getMaxColumns() - headers.length);
  }
  return sh;
}

/* ------------------------------------------------------------------ DASHBOARD */
function setupDashboard_(ss) {
  var sh = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard', 1);
  sh.clear();
  sh.clearConditionalFormatRules();
  removeAllCharts_(sh);

  sh.setHiddenGridlines(true);
  sh.setColumnWidth(1, 30);
  [190, 150, 150, 150, 40, 190, 130, 110, 40, 190, 150].forEach(function (w, i) {
    sh.setColumnWidth(i + 2, w);
  });

  // Tieu de
  sh.getRange('B2:L2').merge().setValue('DASHBOARD CHI TIÊU ĂN UỐNG')
    .setBackground(NAVY).setFontColor('#FFFFFF').setFontSize(16).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(2, 44);

  // Bo loc
  sh.getRange('B4').setValue('Tháng phân tích').setFontWeight('bold');
  sh.getRange('C4').setFormula('=TEXT(TODAY(),"YYYY-MM")')
    .setBackground(GOLD_LT).setFontWeight('bold').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, false, false, GOLD, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange('D4').setValue('← sửa ô này thành YYYY-MM để đổi tháng').setFontColor('#888888').setFontStyle('italic');

  sh.getRange('B5').setValue('Ngân sách tháng (₫)').setFontWeight('bold');
  sh.getRange('C5').setValue(3000000).setNumberFormat('#,##0 "₫"')
    .setBackground(GOLD_LT).setFontWeight('bold').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, false, false, GOLD, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // KPI
  var kpiLabels = ['Tổng chi tháng', 'Trung bình / ngày', 'Số ngày có chi', '% ngân sách đã dùng', 'Ăn ngoài', 'Đi chợ / Siêu thị'];
  var kpiCells = ['B7', 'C7', 'D7', 'E7', 'F7', 'G7'];
  var kpiFormulas = [
    '=SUMIF(Raw_Data!$L:$L,$C$4,Raw_Data!$H:$H)',
    '=IFERROR($B$8/$D$8,0)',
    '=COUNTUNIQUEIFS(Raw_Data!$A:$A,Raw_Data!$L:$L,$C$4)',
    '=IFERROR($B$8/$C$5,0)',
    '=SUMIFS(Raw_Data!$H:$H,Raw_Data!$L:$L,$C$4,Raw_Data!$C:$C,"<>Đi chợ / Siêu thị")',
    '=SUMIFS(Raw_Data!$H:$H,Raw_Data!$L:$L,$C$4,Raw_Data!$C:$C,"Đi chợ / Siêu thị")'
  ];
  var kpiFormats = ['#,##0 "₫"', '#,##0 "₫"', '#,##0" ngày"', '0.0%', '#,##0 "₫"', '#,##0 "₫"'];

  for (var i = 0; i < kpiLabels.length; i++) {
    var col = 2 + i;
    sh.getRange(7, col).setValue(kpiLabels[i])
      .setBackground(CELADON).setFontColor('#1B3B2F').setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setWrap(true);
    sh.getRange(8, col).setFormula(kpiFormulas[i]).setNumberFormat(kpiFormats[i])
      .setBackground(CELADON_LT).setFontSize(14).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
  }
  sh.setRowHeight(7, 32);
  sh.setRowHeight(8, 44);
  sh.getRange('B7:G8').setBorder(true, true, true, true, true, true, '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Canh bao vuot ngan sach
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(1)
      .setBackground('#F4C7C3').setFontColor('#A50E0E')
      .setRanges([sh.getRange('E8')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(0.8, 1)
      .setBackground(GOLD_LT).setFontColor('#7A5B00')
      .setRanges([sh.getRange('E8')]).build()
  ]);

  // Cac bang QUERY
  blockTitle_(sh, 'B10', 'CHI TIÊU THEO BỮA');
  sh.getRange('B11').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select C, sum(H), count(E) where L = \'"&$C$4&"\' and C is not null group by C order by sum(H) desc label C \'Bữa\', sum(H) \'Tổng chi\', count(E) \'Số món\'"),"Chưa có dữ liệu")');

  blockTitle_(sh, 'F10', 'TOP 10 CỬA HÀNG');
  sh.getRange('F11').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select D, sum(H), count(E) where L = \'"&$C$4&"\' and D is not null group by D order by sum(H) desc limit 10 label D \'Cửa hàng\', sum(H) \'Tổng chi\', count(E) \'Số món\'"),"Chưa có dữ liệu")');

  blockTitle_(sh, 'J10', 'THEO NHÓM DINH DƯỠNG');
  sh.getRange('J11').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select I, sum(H) where L = \'"&$C$4&"\' and I is not null group by I order by sum(H) desc label I \'Nhóm\', sum(H) \'Tổng chi\'"),"Chưa có dữ liệu")');

  blockTitle_(sh, 'B20', 'CHI TIÊU THEO NGÀY');
  sh.getRange('B21').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select A, sum(H) where L = \'"&$C$4&"\' and A is not null group by A order by A label A \'Ngày\', sum(H) \'Tổng chi\'"),"Chưa có dữ liệu")');

  blockTitle_(sh, 'F20', 'CHI TIÊU THEO TUẦN');
  sh.getRange('F21').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select K, sum(H), count(E) where L = \'"&$C$4&"\' and K is not null group by K order by K label K \'Tuần\', sum(H) \'Tổng chi\', count(E) \'Số món\'"),"Chưa có dữ liệu")');

  blockTitle_(sh, 'J20', 'TOP 10 MÓN TỐN TIỀN NHẤT');
  sh.getRange('J21').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select E, sum(H) where L = \'"&$C$4&"\' and E is not null group by E order by sum(H) desc limit 10 label E \'Món\', sum(H) \'Tổng chi\'"),"Chưa có dữ liệu")');

  sh.getRange('C11:D30').setNumberFormat('#,##0 "₫"');
  sh.getRange('G11:H30').setNumberFormat('#,##0 "₫"');
  sh.getRange('K11:K30').setNumberFormat('#,##0 "₫"');
  sh.getRange('C21:C60').setNumberFormat('#,##0 "₫"');
  sh.getRange('G21:H60').setNumberFormat('#,##0 "₫"');
  sh.getRange('K21:K60').setNumberFormat('#,##0 "₫"');
  sh.getRange('B21:B60').setNumberFormat('yyyy-mm-dd');

  buildCharts_(sh);
  return sh;
}

function blockTitle_(sh, a1, text) {
  var r = sh.getRange(a1);
  sh.getRange(r.getRow(), r.getColumn(), 1, 3).merge().setValue(text)
    .setBackground(GOLD).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sh.setRowHeight(r.getRow(), 26);
}

function removeAllCharts_(sh) {
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
}

function buildCharts_(sh) {
  var daily = sh.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sh.getRange('B21:C60'))
    .setPosition(65, 2, 0, 0)
    .setOption('title', 'Chi tiêu theo ngày')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [GOLD])
    .setOption('width', 620).setOption('height', 300)
    .build();
  sh.insertChart(daily);

  var pie = sh.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sh.getRange('B11:C18'))
    .setPosition(65, 8, 0, 0)
    .setOption('title', 'Tỷ trọng theo bữa')
    .setOption('pieHole', 0.45)
    .setOption('colors', [GOLD, CELADON, '#7FA894', '#E0C97F', '#4F6F64'])
    .setOption('width', 480).setOption('height', 300)
    .build();
  sh.insertChart(pie);
}

/* ------------------------------------------------------------------ MENU */
function setupMenu_(ss) {
  var sh = ss.getSheetByName('Menu_De_Xuat') || ss.insertSheet('Menu_De_Xuat', 2);
  sh.clear();
  sh.setHiddenGridlines(true);

  sh.getRange('A1:F1').merge().setValue('THỰC ĐƠN GỢI Ý TRONG TUẦN — cân bằng dinh dưỡng & ngân sách')
    .setBackground(NAVY).setFontColor('#FFFFFF').setFontSize(14).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(1, 42);

  var head = ['Thứ / Ngày', 'Bữa sáng (30–50k)', 'Bữa trưa (45–65k)', 'Bữa tối (tự nấu)',
              'Mẹo cân bằng', 'Dự chi/ngày (₫)'];
  sh.getRange(2, 1, 1, head.length).setValues([head])
    .setBackground(CELADON).setFontColor('#1B3B2F').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(2, 36);
  sh.setFrozenRows(2);

  var rows = [
    ['Thứ Hai', 'Bánh mì ốp la + cà phê đen', 'Cơm gà luộc xé phay rau răm', 'Canh bầu nấu tôm + cá bống kho tộ', 'Mở tuần thanh nhẹ, hạn chế dầu mỡ', 120000],
    ['Thứ Ba', 'Bún mọc / bún thang', 'Cơm văn phòng cá thu sốt cà', 'Trứng chiên hành + canh mồng tơi cua đồng', 'Ưu tiên đạm và canxi', 125000],
    ['Thứ Tư', 'Cháo yến mạch ức gà', 'Cơm sườn nướng kèm kim chi', 'Canh chua cá lóc + rau muống luộc', 'Bổ sung vitamin C và chất xơ', 130000],
    ['Thứ Năm', 'Hủ tiếu Nam Vang', 'Cơm cá ba sa phi lê kho thơm', 'Canh khổ qua nhồi thịt băm', 'Thanh nhiệt giữa tuần', 125000],
    ['Thứ Sáu', 'Bánh cuốn chả quế', 'Bún bò Huế / bún chả', 'Đậu hũ sốt cà chua + rau củ kho quẹt', 'Bữa nhẹ bụng, dồn ngân sách cho cuối tuần', 130000],
    ['Thứ Bảy', 'Phở bò tái gầu', 'Bún chả giò thịt nướng', 'Lẩu gà lá giang / cá nướng giấy bạc', 'Đổi vị cuối tuần', 165000],
    ['Chủ Nhật', 'Bánh canh cua', 'Steak bò nướng salad / ăn ngoài', 'Súp bí đỏ thịt băm + salad cá ngừ', 'Tổng kết tuần, sơ chế nguyên liệu cho tuần sau', 175000]
  ];
  sh.getRange(3, 1, rows.length, head.length).setValues(rows)
    .setWrap(true).setVerticalAlignment('top');

  sh.getRange(3 + rows.length, 1, 1, 5).merge().setValue('TỔNG DỰ CHI TUẦN')
    .setFontWeight('bold').setHorizontalAlignment('right').setBackground(GOLD_LT);
  sh.getRange(3 + rows.length, 6).setFormula('=SUM(F3:F' + (2 + rows.length) + ')')
    .setFontWeight('bold').setBackground(GOLD_LT);

  sh.getRange('A3:A' + (3 + rows.length)).setFontWeight('bold').setBackground(CELADON_LT);
  sh.getRange('F3:F' + (3 + rows.length)).setNumberFormat('#,##0 "₫"').setHorizontalAlignment('right');
  [110, 210, 220, 260, 240, 130].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  for (var r = 3; r <= 2 + rows.length; r++) sh.setRowHeight(r, 52);

  sh.getRange(2, 1, rows.length + 2, head.length)
    .setBorder(true, true, true, true, true, true, '#C9D6CD', SpreadsheetApp.BorderStyle.SOLID);
  return sh;
}

function cleanupDefaultSheet_(ss) {
  ['Sheet1', 'Trang tính1', 'Trang tính 1'].forEach(function (name) {
    var s = ss.getSheetByName(name);
    if (s && ss.getSheets().length > 1 && s.getLastRow() === 0) ss.deleteSheet(s);
  });
}
