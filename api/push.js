// POST /api/push  { invoice: {...} }
// -> gan shared secret roi forward sang Google Apps Script Web App

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Chỉ nhận POST' });

  const url = process.env.APPS_SCRIPT_URL;
  const token = process.env.SHARED_SECRET;
  if (!url || !token) {
    return res.status(500).json({ ok: false, error: 'Thiếu APPS_SCRIPT_URL hoặc SHARED_SECRET' });
  }

  const gate = process.env.APP_PASSWORD;
  if (gate && req.headers['x-app-password'] !== gate) {
    return res.status(401).json({ ok: false, error: 'Sai mật khẩu ứng dụng' });
  }

  const invoice = req.body?.invoice;
  if (!invoice || !Array.isArray(invoice.items) || invoice.items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Không có dòng nào để lưu' });
  }

  const body = {
    token,
    invoice_id: invoice.invoice_id,
    date: invoice.date,
    store_name: invoice.store_name,
    note: invoice.note || '',
    source: 'Groq Vision',
    items: invoice.items.map((it) => ({
      name: it.name,
      qty: Number(it.qty) || 1,
      unit_price: Number(it.unit_price) || 0,
      total_price: Number(it.total_price) || 0,
      meal_type: it.meal_type || invoice.meal_type || '',
      tag: it.tag || '',
      note: it.note || ''
    }))
  };

  try {
    // Apps Script /exec tra ve 302 sang googleusercontent -> phai follow redirect
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return res.status(502).json({ ok: false, error: 'Apps Script trả về nội dung không phải JSON — kiểm tra lại quyền "Anyone" khi deploy' }); }

    return res.status(data.ok ? 200 : 400).json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
