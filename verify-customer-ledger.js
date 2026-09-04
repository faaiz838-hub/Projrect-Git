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
  const response = await fetch(base + path, { ...options, headers });
  applyCookies(response.headers);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
(async () => {
  const login = await api('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ali.com', password: 'admin123' })
  });
  console.log('LOGIN', login.status, JSON.stringify(login.data));
  const products = await api('/api/products');
  const first = products.data.products.find(p => Number(p.active) === 1) || products.data.products[0];
  const create = await api('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Ledger Customer',
      email: 'ledger@example.com',
      phone: '222222',
      deliveryAddress: '45 Ledger Lane',
      items: [{ product_id: first.id, quantity: 1 }]
    })
  });
  console.log('CREATE', create.status, JSON.stringify(create.data));
  const orderId = create.data.order.orderId;
  const dispatch = await api('/api/orders/' + orderId + '/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  console.log('DISPATCH', dispatch.status, JSON.stringify(dispatch.data));
  const payment = await api('/api/orders/' + orderId + '/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 13.8, payment_method: 'Card', reference: 'PAY-LEDGER-1' })
  });
  console.log('PAYMENT', payment.status, JSON.stringify(payment.data));
  const publicInvoice = await api('/api/invoice/public?order_number=' + encodeURIComponent('ORD-' + Date.now()) + '&email=' + encodeURIComponent('ledger@example.com'));
  console.log('PUBLIC_QUERY', publicInvoice.status, typeof publicInvoice.data === 'string' ? publicInvoice.data : JSON.stringify(publicInvoice.data));
  const orderLookup = await api('/api/orders');
  const latest = orderLookup.data.orders.find(o => Number(o.customer_name) === 0 ? false : o.customer_name === 'Ledger Customer');
  const actual = orderLookup.data.orders.filter(o => o.customer_name === 'Ledger Customer')[0];
  const public = await api('/api/invoice/public?order_number=' + encodeURIComponent(actual.order_number) + '&email=' + encodeURIComponent(actual.email));
  console.log('PUBLIC_INVOICE', public.status, JSON.stringify(public.data));
  const page = await api('/invoice');
  console.log('CUSTOMER_PAGE', page.status, page.data.slice(0, 60));
})();
