const base = 'http://localhost:3000';
const jar = {};

function applyCookies(headers) {
  const raw = headers.get('set-cookie');
  if (!raw) return;
  for (const part of raw.split(',')) {
    const [cookiePair] = part.split(';');
    const idx = cookiePair.indexOf('=');
    if (idx > 0) {
      const key = cookiePair.slice(0, idx).trim();
      const value = cookiePair.slice(idx + 1).trim();
      if (key && value) jar[key] = value;
    }
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (Object.keys(jar).length) {
    headers.set('Cookie', Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '));
  }
  const res = await fetch(base + path, { ...options, headers });
  applyCookies(res.headers);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  const login = await api('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@premierstore.com', password: 'admin123' })
  });
  console.log('LOGIN', login.status, JSON.stringify(login.data));

  const products = await api('/api/products');
  const product = (products.data.products || []).find((p) => Number(p.sale_rate || 0) > 0);
  console.log('PRODUCT', product ? { id: product.id, sale_rate: product.sale_rate } : 'NONE');

  const create = await api('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Confirmed Verify',
      email: 'cv@example.com',
      phone: '7777777777',
      city: 'X',
      deliveryAddress: 'Y',
      items: [{ product_id: product.id, quantity: 2, unit_price: 0 }]
    })
  });
  console.log('CREATE', create.status, JSON.stringify(create.data));

  const orderId = create.data?.order?.orderId;
  const confirm = await api(`/api/orders/${orderId}/confirm`, { method: 'POST' });
  console.log('CONFIRM', confirm.status, JSON.stringify({
    status: confirm.data?.order?.status,
    order_total: confirm.data?.order?.order_total,
    invoice_total: confirm.data?.invoice?.total
  }));

  const confirmed = await api('/api/orders/confirmed');
  const match = (confirmed.data?.orders || []).find((o) => Number(o.id) === Number(orderId));
  console.log('MATCH', match ? JSON.stringify(match) : 'NOT_FOUND');
})();
