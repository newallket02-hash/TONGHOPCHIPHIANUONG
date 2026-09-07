/**
 * Setup.gs — chay 1 lan de dung toan bo cau truc bang tinh
 * Quan_Ly_Chi_Phi_An_Uong_Groq_AI
 *
 * Cach dung: Extensions > Apps Script > dan file nay > chon ham setupSpreadsheet > Run
 * Chay lai duoc nhieu lan (idempotent): tab da co se duoc reset header/cong thuc,
 * DU LIEU trong Raw_Data KHONG bi xoa.
 */

var MEAL_TYPES = ['Bữa sáng', 'Bữa trưa', 'Bữa tối', 'Café / Ăn vặt', 'Đi chợ / Siêu thị'];
var NONFOOD = 'Đồ dùng (phi thực phẩm)';   // loai khoi moi con so ve chi phi AN UONG
var NUTRITION_TAGS = ['Đạm', 'Tinh bột', 'Rau xanh', 'Trái cây', 'Đồ uống ngọt', 'Đồ uống khác',
                      NONFOOD, 'Khác'];

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
  // Cot E va I la khoang trong cua cac block ben duoi -> hang KPI nhay qua chung.
  var notNF = ',Raw_Data!$I:$I,"<>' + NONFOOD + '"';
  var kpi = [
    ['B', 'Tổng chi ăn uống',
     '=SUMIFS(Raw_Data!$H:$H,Raw_Data!$L:$L,$C$4' + notNF + ')', '#,##0 "₫"'],
    ['C', 'Trung bình / ngày', '=IFERROR($B$8/$D$8,0)', '#,##0 "₫"'],
    ['D', 'Số ngày có chi',
     '=COUNTUNIQUEIFS(Raw_Data!$A:$A,Raw_Data!$L:$L,$C$4)', '#,##0" ngày"'],
    ['F', '% ngân sách đã dùng', '=IFERROR($B$8/$C$5,0)', '0.0%'],
    ['G', 'Ăn ngoài',
     '=SUMIFS(Raw_Data!$H:$H,Raw_Data!$L:$L,$C$4,Raw_Data!$C:$C,"<>Đi chợ / Siêu thị"' + notNF + ')', '#,##0 "₫"'],
    ['H', 'Đi chợ / Siêu thị',
     '=SUMIFS(Raw_Data!$H:$H,Raw_Data!$L:$L,$C$4,Raw_Data!$C:$C,"Đi chợ / Siêu thị"' + notNF + ')', '#,##0 "₫"'],
    ['J', 'Đồ dùng (không tính vào ăn uống)',
     '=SUMIFS(Raw_Data!$H:$H,Raw_Data!$L:$L,$C$4,Raw_Data!$I:$I,"' + NONFOOD + '")', '#,##0 "₫"']
  ];
  kpi.forEach(function (k) {
    var nf = (k[0] === 'J');
    sh.getRange(k[0] + '7').setValue(k[1])
      .setBackground(nf ? GOLD : CELADON).setFontColor(nf ? '#FFFFFF' : '#1B3B2F')
      .setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
    sh.getRange(k[0] + '8').setFormula(k[2]).setNumberFormat(k[3])
      .setBackground(nf ? GOLD_LT : CELADON_LT).setFontSize(14).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
  });
  sh.setRowHeight(7, 34);
  sh.setRowHeight(8, 44);
  sh.getRange('B7:D8').setBorder(true, true, true, true, true, true, '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange('F7:H8').setBorder(true, true, true, true, true, true, '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange('J7:J8').setBorder(true, true, true, true, false, false, '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Canh bao vuot ngan sach
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(1)
      .setBackground('#F4C7C3').setFontColor('#A50E0E')
      .setRanges([sh.getRange('E8')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(0.8, 1)
      .setBackground(GOLD_LT).setFontColor('#7A5B00')
      .setRanges([sh.getRange('E8')]).build()
  ]);

  sh.getRange('J9').setValue('Kem đánh răng, giấy, dầu gội… gán nhóm "' + NONFOOD
      + '" là tự nhảy vào ô này và bị loại khỏi mọi con số ăn uống bên trái.')
    .setFontSize(8).setFontColor('#8C8271').setWrap(true);
  sh.setRowHeight(9, 32);

  // Cac bang QUERY
  blockTitle_(sh, 'B10', 'CHI TIÊU THEO BỮA');
  sh.getRange('B11').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select C, sum(H), count(E) where L = \'"&$C$4&"\' and C is not null and I <> \'Đồ dùng (phi thực phẩm)\' group by C order by sum(H) desc label C \'Bữa\', sum(H) \'Tổng chi\', count(E) \'Số món\'"),"Chưa có dữ liệu")');

  blockTitle_(sh, 'F10', 'TOP 10 CỬA HÀNG');
  sh.getRange('F11').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select D, sum(H), count(E) where L = \'"&$C$4&"\' and D is not null and I <> \'Đồ dùng (phi thực phẩm)\' group by D order by sum(H) desc limit 10 label D \'Cửa hàng\', sum(H) \'Tổng chi\', count(E) \'Số món\'"),"Chưa có dữ liệu")');

  blockTitle_(sh, 'J10', 'THEO NHÓM DINH DƯỠNG');
  sh.getRange('J11').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select I, sum(H) where L = \'"&$C$4&"\' and I is not null and I <> \'Đồ dùng (phi thực phẩm)\' group by I order by sum(H) desc label I \'Nhóm\', sum(H) \'Tổng chi\'"),"Chưa có dữ liệu")');

  blockTitle_(sh, 'B20', 'CHI TIÊU THEO NGÀY');
  sh.getRange('B21').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select A, sum(H) where L = \'"&$C$4&"\' and A is not null and I <> \'Đồ dùng (phi thực phẩm)\' group by A order by A label A \'Ngày\', sum(H) \'Tổng chi\'"),"Chưa có dữ liệu")');

  blockTitle_(sh, 'F20', 'CHI TIÊU THEO TUẦN');
  sh.getRange('F21').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select K, sum(H), count(E) where L = \'"&$C$4&"\' and K is not null and I <> \'Đồ dùng (phi thực phẩm)\' group by K order by K label K \'Tuần\', sum(H) \'Tổng chi\', count(E) \'Số món\'"),"Chưa có dữ liệu")');

  blockTitle_(sh, 'J20', 'TOP 10 MÓN TỐN TIỀN NHẤT');
  sh.getRange('J21').setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select E, sum(H) where L = \'"&$C$4&"\' and E is not null and I <> \'Đồ dùng (phi thực phẩm)\' group by E order by sum(H) desc limit 10 label E \'Món\', sum(H) \'Tổng chi\'"),"Chưa có dữ liệu")');

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
/**
 * Chay rieng ham nay khi muon dung lai tab Menu_De_Xuat ma khong dung
 * lai Raw_Data / Dashboard.
 */
function rebuildMenu() {
  setupMenu_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('Đã dựng lại tab Menu_De_Xuat.');
}

function setupMenu_(ss) {
  var sh = ss.getSheetByName('Menu_De_Xuat') || ss.insertSheet('Menu_De_Xuat', 2);
  sh.clear();
  sh.setHiddenGridlines(true);

  sh.getRange('A1:G1').merge()
    .setValue('THỰC ĐƠN GỢI Ý TRONG TUẦN — món miền Trung, dựa trên hóa đơn đã mua')
    .setBackground(NAVY).setFontColor('#FFFFFF').setFontSize(14).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(1, 42);

  var head = ['Thứ', 'Bữa sáng (ăn ngoài)', 'Bữa tối (tự nấu)',
              'Nguyên liệu chính', 'Đã có trong hóa đơn', 'Cần mua thêm', 'Dự chi/ngày (₫)'];
  sh.getRange(3, 1, 1, head.length).setValues([head])
    .setBackground(CELADON).setFontColor('#1B3B2F').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(3, 36);
  sh.setFrozenRows(3);

  // Cot D la danh sach tu khoa, ngan cach bang dau phay — cot E va F do
  // chinh no ma tra nguoc vao Raw_Data, nen sua D la E/F tu cap nhat.
  var rows = [
    ['Thứ Hai',
     'Bánh mì kẹp trứng + cà phê phin đen (bánh sandwich đã có sẵn)',
     'Cá nục kho ớt nghệ + canh bắp cải thảo nấu tôm khô',
     'cá nục, bắp cải, bánh sanwich', 55000],
    ['Thứ Ba',
     'Bún bò Huế',
     'Canh củ dền hầm xương + thịt xay xào đậu que',
     'xương heo, củ dền, thịt xay', 75000],
    ['Thứ Tư',
     'Mì Quảng gà / tôm thịt',
     'Khổ qua xào trứng + canh mướp hương nấu thịt xay',
     'khổ qua, mướp hương, thịt xay', 70000],
    ['Thứ Năm',
     'Bánh bèo – bánh nậm – bánh lọc',
     'Cá nục hấp cuốn bánh tráng + rau sống chấm mắm nêm',
     'cá nục, bánh tráng', 65000],
    ['Thứ Sáu',
     'Cháo lòng + bánh tráng ớt nướng',
     'Ram cuốn cải (chả ram Bình Định) + canh khoai tây hầm xương',
     'thịt xay, bánh tráng, khoai tây, xương heo', 75000],
    ['Thứ Bảy',
     'Bánh canh Nam Phổ / bánh canh cá lóc',
     'Bún cá ngừ kho thơm + rau luộc chấm mắm nêm',
     'cá ngừ', 90000],
    ['Chủ Nhật',
     'Bánh ướt thịt nướng + cà phê',
     'Mít trộn bánh tráng (Đà Nẵng) + canh bắp cải cuốn thịt',
     'mít, bánh tráng, bắp cải, thịt xay', 85000]
  ];

  for (var i = 0; i < rows.length; i++) {
    var r = 4 + i;
    sh.getRange(r, 1).setValue(rows[i][0]);
    sh.getRange(r, 2).setValue(rows[i][1]);
    sh.getRange(r, 3).setValue(rows[i][2]);
    sh.getRange(r, 4).setValue(rows[i][3]);
    sh.getRange(r, 5).setFormula(matchFormula_(r, true));
    sh.getRange(r, 6).setFormula(matchFormula_(r, false));
    sh.getRange(r, 7).setValue(rows[i][4]);
  }

  var last = 3 + rows.length;
  sh.getRange(last + 1, 1, 1, 6).merge().setValue('TỔNG DỰ CHI TUẦN')
    .setFontWeight('bold').setHorizontalAlignment('right').setBackground(GOLD_LT);
  sh.getRange(last + 1, 7).setFormula('=SUM(G4:G' + last + ')')
    .setFontWeight('bold').setBackground(GOLD_LT);

  sh.getRange(4, 1, rows.length, 7).setWrap(true).setVerticalAlignment('top');
  sh.getRange('A4:A' + (last + 1)).setFontWeight('bold').setBackground(CELADON_LT);
  sh.getRange('G4:G' + (last + 1)).setNumberFormat('#,##0 "₫"').setHorizontalAlignment('right');
  sh.getRange('E4:E' + last).setFontColor('#1B6B3A');
  sh.getRange('F4:F' + last).setFontColor('#A8500A');
  for (var r2 = 4; r2 <= last; r2++) sh.setRowHeight(r2, 52);
  sh.getRange(3, 1, rows.length + 2, 7)
    .setBorder(true, true, true, true, true, true, '#C9D6CD', SpreadsheetApp.BorderStyle.SOLID);

  // Kho nguyen lieu: doc thang tu Raw_Data, chi lay cac lan di cho
  var pantryRow = last + 3;
  sh.getRange(pantryRow, 1, 1, 3).merge()
    .setValue('NGUYÊN LIỆU ĐÃ MUA TRONG 14 NGÀY (tự đọc từ Raw_Data)')
    .setBackground(GOLD).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(10)
    .setVerticalAlignment('middle');
  sh.setRowHeight(pantryRow, 26);
  sh.getRange(pantryRow + 1, 1).setFormula(
    '=IFERROR(QUERY(Raw_Data!$A$2:$L,"select E, I, A where A >= date \'"&TEXT(TODAY()-14,"yyyy-mm-dd")&"\' and C = \'Đi chợ / Siêu thị\' and I <> \'Đồ dùng (phi thực phẩm)\' order by A desc label E \'Nguyên liệu\', I \'Nhóm\', A \'Ngày mua\'"),"Chưa có hóa đơn đi chợ nào trong 14 ngày")');
  sh.getRange(pantryRow + 1, 3, 40, 1).setNumberFormat('yyyy-mm-dd');

  sh.getRange(pantryRow + 5, 5, 1, 3).merge()
    .setValue('Cột "Đã có" và "Cần mua" là công thức dò ngược vào Raw_Data theo từ khóa ở cột D. '
            + 'Sửa từ khóa ở D là hai cột kia tự đổi theo.')
    .setWrap(true).setFontSize(9).setFontColor('#8C8271').setVerticalAlignment('top');

  [95, 250, 300, 200, 175, 175, 110].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  return sh;
}

/**
 * Cot D chua cac tu khoa ngan cach bang dau phay. Ham nay tra ve cong thuc
 * loc nhung tu khoa CO (matched=true) hoac KHONG CO (matched=false) trong
 * cot "Món / Mặt hàng" cua Raw_Data.
 */
function matchFormula_(row, matched) {
  var op = matched ? '>0' : '=0';
  var alt = matched ? '"— chưa có món nào"' : '"— đủ nguyên liệu"';
  return '=IF($D' + row + '="","",IFERROR(IF(TEXTJOIN(", ",TRUE,ARRAYFORMULA(IF('
       + 'COUNTIF(Raw_Data!$E:$E,"*"&TRIM(SPLIT($D' + row + ',","))&"*")' + op + ','
       + 'TRIM(SPLIT($D' + row + ',",")),"")))="",' + alt + ','
       + 'TEXTJOIN(", ",TRUE,ARRAYFORMULA(IF('
       + 'COUNTIF(Raw_Data!$E:$E,"*"&TRIM(SPLIT($D' + row + ',","))&"*")' + op + ','
       + 'TRIM(SPLIT($D' + row + ',",")),"")))),""))';
}

function cleanupDefaultSheet_(ss) {
  ['Sheet1', 'Trang tính1', 'Trang tính 1'].forEach(function (name) {
    var s = ss.getSheetByName(name);
    if (s && ss.getSheets().length > 1 && s.getLastRow() === 0) ss.deleteSheet(s);
  });
}
