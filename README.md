# Quản lý chi phí ăn uống — Groq Vision → Google Sheet

Chụp ảnh hóa đơn → Groq Vision đọc thành JSON → bạn kiểm tra/sửa trên web → ghi thẳng vào tab `Raw_Data`
của bảng tính `Quan_Ly_Chi_Phi_An_Uong_Groq_AI` → Dashboard tự cập nhật.

```
Điện thoại/máy tính          Vercel (server)                Google
─────────────────────        ───────────────────────        ─────────────────────
public/index.html   ──POST─▶ /api/scan  ──▶ Groq Vision API
   (nén ảnh 1280px)          (giữ GROQ_API_KEY)
        │
        │ bạn sửa lại các dòng sai
        ▼
                    ──POST─▶ /api/push  ──▶ Apps Script /exec ──▶ Raw_Data
                              (giữ SHARED_SECRET)   (kiểm tra token)
```

**Vì sao đi vòng qua Vercel mà không gọi Groq thẳng từ trình duyệt:** gọi thẳng thì API key của bạn
nằm trong mã nguồn trang web, ai mở DevTools cũng lấy được. Toàn bộ key và secret chỉ nằm ở phía server.

---

## Bước 1 — Dựng cấu trúc bảng tính

1. Mở bảng tính → **Tiện ích mở rộng › Apps Script**.
2. Dán nội dung `apps-script/Setup.gs` vào (đổi tên file thành `Setup.gs`).
3. Chọn hàm `setupSpreadsheet` → **Run** → cấp quyền khi Google hỏi.

Kết quả: 3 tab `Raw_Data`, `Dashboard`, `Menu_De_Xuat` đầy đủ header, công thức, dropdown, biểu đồ.

> Script đặt **locale bảng tính = en_US** để công thức dùng dấu phẩy `,`. Tiền vẫn hiển thị `1.250.000 ₫`
> nhờ định dạng số `#,##0 "₫"`. Đừng đổi locale sang Việt Nam, mọi công thức sẽ hỏng.

Chạy lại `setupSpreadsheet` bất cứ lúc nào cũng an toàn: dữ liệu trong `Raw_Data` được giữ nguyên,
chỉ header/công thức/định dạng được dựng lại.

### Cấu trúc `Raw_Data`

| Cột | Tên | Nguồn |
|---|---|---|
| A | Ngày | API ghi |
| B | Mã HĐ | API ghi (dùng để chống ghi trùng) |
| C | Bữa | API ghi — dropdown 5 giá trị |
| D | Cửa hàng | API ghi |
| E | Món / Mặt hàng | API ghi |
| F | SL | API ghi |
| G | Đơn giá | API ghi |
| **H** | **Thành tiền** | **ARRAYFORMULA `F×G` — đừng gõ tay vào cột này** |
| I | Nhóm dinh dưỡng | API ghi — dropdown |
| J | Ghi chú | API ghi |
| **K** | **Tuần** | **ARRAYFORMULA `T##/YYYY`** |
| **L** | **Tháng** | **ARRAYFORMULA `YYYY-MM`** — Dashboard lọc theo cột này |
| M | Nguồn ghi | API ghi |

Cột H, K, L là công thức mảng đặt ở dòng 1 và tự phủ xuống mọi dòng mới. Chỉ cần thêm dòng vào A–G
là ba cột này tự tính. Nếu lỡ gõ đè lên H2/K2/L2 sẽ báo `#REF!` — chạy lại `setupSpreadsheet` để sửa.

### `Dashboard`
- `C4` = tháng phân tích (`YYYY-MM`), `C5` = ngân sách tháng. Sửa 2 ô này là toàn bộ dashboard đổi theo.
- 6 thẻ KPI: tổng chi, TB/ngày, số ngày có chi, % ngân sách (đỏ khi vượt 100%, vàng khi ≥80%),
  ăn ngoài, đi chợ.
- 6 bảng `QUERY`: theo bữa, top cửa hàng, theo nhóm dinh dưỡng, theo ngày, theo tuần, top món tốn tiền.
- 2 biểu đồ: cột chi tiêu theo ngày, tròn tỷ trọng theo bữa.

---

## Bước 2 — Deploy Apps Script làm Web App

1. Vẫn trong Apps Script, thêm file thứ hai `Code.gs`, dán nội dung `apps-script/Code.gs`.
2. **Project Settings › Script Properties › Add script property**
   - key: `SHARED_SECRET`
   - value: một chuỗi ngẫu nhiên dài. Tạo nhanh: `openssl rand -hex 32`
3. **Deploy › New deployment › Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy URL dạng `https://script.google.com/macros/s/AKfycb.../exec` — dán vào biến `APPS_SCRIPT_URL`.

Kiểm tra nhanh: mở URL đó bằng trình duyệt, phải thấy `{"ok":true,"sheet":"Raw_Data","rows":0}`.

> "Anyone" nghĩa là ai biết URL cũng gọi được — đó là lý do `doPost` bắt buộc phải khớp `SHARED_SECRET`.
> Mỗi lần sửa `Code.gs` phải **Deploy › Manage deployments › Edit › New version** thì thay đổi mới có hiệu lực.

---

## Bước 3 — GitHub + Vercel

```bash
git init && git add . && git commit -m "Quét hóa đơn ăn uống bằng Groq Vision"
git remote add origin https://github.com/<tài-khoản>/quan-ly-chi-phi-an-uong.git
git push -u origin main
```

Project `quan-ly-chi-phi-an-uong` **đã tồn tại** trên Vercel (kèm env vars và domain
`quan-ly-chi-phi-an-uong.vercel.app`). Đừng Import lại thành project mới — hãy nối repo vào project cũ:

**Vercel › quan-ly-chi-phi-an-uong › Settings › Git › Connect Git Repository** → chọn repo vừa push.

Từ lúc đó mỗi `git push` lên nhánh chính là Vercel tự build và deploy production. Không cần chọn
framework (zero-config: `public/` là static, `api/` là serverless functions), Root Directory để trống.

**Settings › Environment Variables** — thêm 5 biến (xem `.env.example`):

| Biến | Giá trị |
|---|---|
| `GROQ_API_KEY` | lấy ở https://console.groq.com/keys |
| `GROQ_MODEL` | `qwen/qwen3.6-27b` |
| `APPS_SCRIPT_URL` | URL `/exec` ở bước 2 |
| `SHARED_SECRET` | **giống hệt** Script Property ở bước 2 |
| `APP_PASSWORD` | tùy chọn — đặt để người lạ có link cũng không dùng được |

Deploy xong, mở link Vercel trên điện thoại và **Add to Home Screen** để dùng như app: bấm là mở camera.

---

## Lưu ý về model Groq

Kế hoạch ban đầu ghi `llama-3.2-11b-vision-preview` / `llama-3.2-90b-vision-preview`. **Hai model này
đã bị gỡ khỏi GroqCloud**, gọi vào sẽ lỗi 404 — chúng bị thay bằng `meta-llama/llama-4-scout...`, và
đến nay dòng Llama 4 cũng không còn trong danh sách model của Groq nữa.

Tính đến 09/2026, model nhận ảnh trên Groq là:

| Model | Ảnh/request | JSON mode |
|---|---|---|
| `qwen/qwen3.6-27b` | 5 | có |
| `qwen/qwen3.8-27b` | 3 | không nêu trong tài liệu |

Code dùng `qwen/qwen3.6-27b` vì có JSON mode. Đổi model chỉ cần sửa biến `GROQ_MODEL`, không cần sửa code.

### Giới hạn tốc độ của gói free (đã gặp thật)

Gói free có **OTPM = 1000 output token/phút**, áp cho từng model và **không hiện trong bảng
Settings › Limits** (bảng đó chỉ ghi TPM tổng 8K). Xin `max_completion_tokens` lớn hơn 1000 là
Groq từ chối ngay, chưa kịp đọc ảnh:

> Request too large … on output tokens per minute (OTPM): Limit 1000, Requested 2048

Đo thực tế trên tài khoản free: khai 1000 → Groq tính 1016; khai 900 → tính 1003; **800 thì lọt**.
Vì vậy `GROQ_MAX_TOKENS` mặc định là **800**.

Nhưng hạ trần token thôi chưa đủ. `qwen3.6-27b` **mặc định bật thinking**, mà reasoning token cũng
tính vào output — model tiêu hết 800 token vào phần suy luận rồi cắt JSON giữa chừng, Groq trả
`Failed to validate JSON`. Nên request luôn gửi kèm:

```json
"reasoning_effort": "none"
```

đổi được qua biến `GROQ_REASONING_EFFORT`. Tắt thinking vừa cho JSON đủ chỗ, vừa nhanh hơn hẳn.

Hệ quả thực tế:

- Quét được khoảng **1 hóa đơn mỗi phút**. Quét dồn sẽ dính 429 — web app báo rõ và bạn đợi 1 phút.
- Hóa đơn siêu thị rất dài (trên ~25 dòng) có thể bị cắt JSON giữa chừng. Web app báo lỗi và
  gợi ý chụp làm 2 ảnh. Muốn xử lý gọn thì nâng Groq lên Dev Tier rồi tăng `GROQ_MAX_TOKENS` lên 2048.
- Đổi hai model qwen cho nhau **không** thoát được giới hạn này — chúng cùng một hạn mức.
Danh sách model thay đổi khá thường xuyên — nếu một ngày `/api/scan` trả lỗi `model_not_found`,
kiểm tra lại https://console.groq.com/docs/models.

---

## Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `Sai token` | `SHARED_SECRET` trên Vercel khác Script Property. Sửa xong phải **redeploy** Vercel. |
| `Apps Script trả về nội dung không phải JSON` | Deploy chưa để "Anyone", Google trả về trang đăng nhập. |
| `Không tìm thấy tab Raw_Data` | Chưa chạy `setupSpreadsheet`. |
| Ghi được nhưng cột Thành tiền trống | Ai đó xóa/gõ đè ARRAYFORMULA ở `H1`. Chạy lại `setupSpreadsheet`. |
| Hóa đơn ghi xuống dòng 1001 | Bug đã sửa ở v2. Nguyên nhân: `getLastRow()` bị ARRAYFORMULA (trả `""`) đẩy lên bằng số dòng tối đa. Nay dùng `lastDataRow_()` đọc cột A. |
| Dashboard trống trơn | `C4` không khớp `YYYY-MM` của dữ liệu, hoặc bảng tính bị đổi về locale Việt Nam. |
| `413` khi tải ảnh | Ảnh quá nặng. Frontend đã nén xuống 1280px/JPEG 75%, hiếm khi xảy ra. |
| Đọc sai số tiền | Bill mờ hoặc in nhiệt bị bay chữ. Web app luôn cho sửa tay trước khi lưu — cứ sửa rồi bấm Lưu. |

## Bảo mật

- API key và secret chỉ nằm trong biến môi trường Vercel, không bao giờ gửi xuống trình duyệt.
- Ảnh hóa đơn không được lưu ở đâu cả: nén trong trình duyệt → gửi thẳng Groq → bỏ.
- `doPost` chống ghi trùng theo `Mã HĐ`: quét lại cùng một bill sẽ bị từ chối thay vì nhân đôi chi tiêu.
- Nếu bật `APP_PASSWORD`, web app hỏi mật khẩu trước khi cho gọi API.
