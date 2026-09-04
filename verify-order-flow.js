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
    headers.set('Cookie', Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; '));
  }
  const response = await fetch(base + path, { ...options, headers });
  applyCookies(response.headers);
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

(async () => {
  const login = await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@ali.com', password: 'admin123' }) });
  console.log('LOGIN', login.status, JSON.stringify(login.data));
  const me = await api('/api/admin/me');
  console.log('ME', me.status, JSON.stringify(me.data));
  const products = await api('/api/products');
  const first = products.data.products.find(p => Number(p.active) === 1) || products.data.products[0];
  const create = await api('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerName: 'Verifier', email: 'v@example.com', phone: '123', deliveryAddress: 'Addr', items: [{ product_id: first.id, quantity: 1 }] }) });
  console.log('CREATE', create.status, JSON.stringify(create.data));
  const orderId = create.data.order.orderId;
  const dispatch = await api('/api/orders/' + orderId + '/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  console.log('DISPATCH', dispatch.status, JSON.stringify(dispatch.data));
  const invoice = await api('/api/orders/' + orderId + '/invoice');
  console.log('INVOICE', invoice.status, JSON.stringify(invoice.data));
  const orders = await api('/api/orders');
  const target = orders.data.orders.find(o => Number(o.id) === Number(orderId));
  console.log('ORDER_STATUS', target ? target.status : 'NOT_FOUND');
})();
