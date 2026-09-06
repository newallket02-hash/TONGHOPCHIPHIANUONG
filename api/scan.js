// POST /api/scan  { image: "data:image/jpeg;base64,..." }
// -> goi Groq Vision, tra ve JSON hoa don da chuan hoa (CHUA ghi vao Sheet)

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3.6-27b';

const MEALS = ['Bữa sáng', 'Bữa trưa', 'Bữa tối', 'Café / Ăn vặt', 'Đi chợ / Siêu thị'];
const TAGS = ['Đạm', 'Tinh bột', 'Rau xanh', 'Trái cây', 'Đồ uống ngọt', 'Đồ uống khác', 'Khác'];

const SYSTEM_PROMPT = `Bạn là chuyên gia trích xuất dữ liệu hóa đơn ăn uống tại Việt Nam.
Trả về DUY NHẤT một object JSON, không giải thích, không markdown.

Dùng ĐÚNG schema rút gọn sau (khóa ngắn để tiết kiệm token):
{"id":"mã hóa đơn, không có thì để rỗng","d":"YYYY-MM-DD","s":"tên quán/siêu thị","m":"loại bữa","t":tổng tiền in trên bill (number),"it":[["tên món",SL,đơn giá,"nhóm"]]}

- "m" là một trong: ${MEALS.join(' | ')}
- "nhóm" là một trong: ${TAGS.join(' | ')}
- Mỗi phần tử của "it" là MẢNG 4 phần tử đúng thứ tự [tên, SL, đơn giá, nhóm]. Không thêm khóa nào khác.
- Giá kiểu 45.000 hoặc 45,000 => trả về number 45000.
- SL × đơn giá phải bằng thành tiền. Bill cân ký thì SL là số lẻ (vd 0.27). Nếu chỉ đọc được thành tiền, đặt SL=1 và đơn giá=thành tiền.
- Bỏ các dòng không phải hàng hóa: tiền khách đưa, tiền thối, điểm tích lũy, số tiền tiết kiệm, phụ phí thanh toán.
- Siêu thị/cửa hàng tạp hóa thì "m" = "Đi chợ / Siêu thị".
- Không bịa dữ liệu. Ô nào không đọc được thì để 0 hoặc chuỗi rỗng.`;

function toNumber(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function extractJson(text) {
  const cleaned = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : cleaned;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model không trả về JSON hợp lệ');
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Doi schema rut gon {id,d,s,m,t,it:[[...]]} ve dang day du */
function expand(raw) {
  if (!Array.isArray(raw.it)) return raw;
  return {
    invoice_id: raw.id,
    date: raw.d,
    store_name: raw.s,
    meal_type: raw.m,
    total: raw.t,
    discount: raw.disc,
    warnings: raw.warnings,
    items: raw.it.map((row) =>
      Array.isArray(row)
        ? { name: row[0], qty: row[1], unit_price: row[2], tag: row[3] }
        : row)
  };
}

function normalize(input) {
  const raw = expand(input);
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.slice() : [];

  let items = (Array.isArray(raw.items) ? raw.items : []).map((it) => {
    let qty = toNumber(it.qty);
    let unit = toNumber(it.unit_price);
    let total = toNumber(it.total_price);

    if (!total && qty && unit) total = qty * unit;
    if (!qty || !unit) { qty = qty || 1; unit = total ? Math.round(total / qty) : unit; }
    if (qty && unit && total && Math.abs(qty * unit - total) > Math.max(1000, total * 0.02)) {
      warnings.push(`Dòng "${it.name}": SL × đơn giá (${qty * unit}) lệch so với thành tiền (${total})`);
      unit = Math.round(total / qty);
    }
    return {
      name: String(it.name || '').trim(),
      qty,
      unit_price: Math.round(unit),
      total_price: Math.round(qty * unit),
      tag: TAGS.includes(it.tag) ? it.tag : 'Khác'
    };
  }).filter((it) => it.name && it.total_price > 0);

  const sum = items.reduce((a, it) => a + it.total_price, 0);
  const stated = toNumber(raw.total);
  if (stated && Math.abs(stated - sum) > Math.max(2000, stated * 0.03)) {
    warnings.push(`Tổng các dòng (${sum.toLocaleString('vi-VN')}₫) lệch so với tổng in trên bill (${stated.toLocaleString('vi-VN')}₫) — kiểm tra lại trước khi lưu`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') ? raw.date : today;
  if (date === today && raw.date && raw.date !== today) warnings.push('Không đọc được ngày trên bill, đang dùng ngày hôm nay');

  return {
    invoice_id: String(raw.invoice_id || '').trim() || `HD-${Date.now().toString(36).toUpperCase()}`,
    date,
    store_name: String(raw.store_name || '').trim(),
    meal_type: MEALS.includes(raw.meal_type) ? raw.meal_type : '',
    items,
    subtotal: sum,
    discount: toNumber(raw.discount),
    total: stated || sum,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
    warnings
  };
}

/** Anh bi cat thanh nhieu manh -> bao model biet no dang doc manh nao */
function buildUserPrompt_(part, parts) {
  const base = 'Trích xuất hóa đơn này thành JSON theo đúng schema rút gọn đã mô tả.';
  const p = Number(part), n = Number(parts);
  if (!p || !n || n < 2) return base;
  let extra = ` Ảnh này là PHẦN ${p}/${n} của một hóa đơn dài đã được cắt ngang.`;
  extra += ' Chỉ trích các dòng hàng nhìn thấy trong ảnh này, không suy đoán các dòng bị cắt mất.';
  if (p > 1) extra += ' Phần đầu hóa đơn không có ở đây nên "s", "d", "id" có thể để rỗng.';
  if (p < n) extra += ' Dòng tổng tiền không có ở đây nên "t" để 0.';
  return base + extra;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Chỉ nhận POST' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'Thiếu biến môi trường GROQ_API_KEY' });

  const gate = process.env.APP_PASSWORD;
  if (gate && req.headers['x-app-password'] !== gate) {
    return res.status(401).json({ ok: false, error: 'Sai mật khẩu ứng dụng' });
  }

  const { image, part, parts } = req.body || {};
  if (!image || !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(image)) {
    return res.status(400).json({ ok: false, error: 'Thiếu ảnh hoặc định dạng không hợp lệ' });
  }

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0,
        // qwen3.6 mac dinh BAT thinking, va reasoning token tinh vao output.
        // Voi tran 800 token cua goi free, model se tieu het vao suy luan roi
        // cat JSON giua chung => Groq bao "Failed to validate JSON".
        reasoning_effort: process.env.GROQ_REASONING_EFFORT || 'none',
        max_completion_tokens: Number(process.env.GROQ_MAX_TOKENS || 800),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: buildUserPrompt_(part, parts) },
              { type: 'image_url', image_url: { url: image } }
            ]
          }
        ]
      })
    });

    const payload = await groqRes.json();
    if (!groqRes.ok) {
      const msg = payload?.error?.message || `Groq trả về ${groqRes.status}`;
      if (groqRes.status === 429) {
        return res.status(429).json({
          ok: false,
          error: 'Groq đang giới hạn tốc độ (gói free chỉ cho ~1 hóa đơn/phút). Đợi khoảng 1 phút rồi bấm Đọc hóa đơn lại.'
        });
      }
      if (/validate JSON/i.test(msg)) {
        return res.status(502).json({
          ok: false,
          error: 'Model tr\u1ea3 v\u1ec1 JSON kh\u00f4ng h\u1ee3p l\u1ec7 \u2014 th\u01b0\u1eddng do h\u00f3a \u0111\u01a1n qu\u00e1 d\u00e0i so v\u1edbi tr\u1ea7n token. Ch\u1ee5p l\u00e0m 2 \u1ea3nh r\u1ed3i qu\u00e9t t\u1eebng \u1ea3nh.'
        });
      }
      return res.status(502).json({ ok: false, error: `Groq: ${msg}` });
    }

    const choice = payload?.choices?.[0];
    const content = choice?.message?.content;
    if (!content) return res.status(502).json({ ok: false, error: 'Groq không trả về nội dung' });
    if (choice.finish_reason === 'length') {
      return res.status(502).json({
        ok: false,
        error: 'Hóa đơn quá dài, JSON bị cắt giữa chừng. Chụp làm 2 ảnh (nửa trên / nửa dưới) rồi quét từng ảnh.'
      });
    }

    return res.status(200).json({
      ok: true,
      model: payload.model,
      finish_reason: choice.finish_reason,
      invoice: normalize(extractJson(content))
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
