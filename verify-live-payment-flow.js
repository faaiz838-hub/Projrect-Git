const base = 'http://localhost:3000';
const jar = {};

function applyCookies(headers) {
  const raw = headers.get('set-cookie');
  if (!raw) return;
  for (const part of raw.split(',')) {
    const pair = (part.split(';')[0] || '').trim();
    if (pair && pair.includes('=')) {
      const idx = pair.indexOf('=');
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (key) jar[key] = value;
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

  const create = await api('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Gateway Verifier',
      email: 'gateway@example.com',
      phone: '456',
      deliveryAddress: 'Checkout Lane',
      items: [{ product_id: 1, quantity: 2 }]
    })
  });

  const orderId = create.data?.order?.orderId;
  const orderNumber = create.data?.order?.orderNumber;

  const session = await api('/api/public/payment-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: orderId,
      order_number: orderNumber,
      email: 'gateway@example.com',
      amount: 75,
      payment_method: 'card'
    })
  });

  const track = await api(`/api/public/order-status?order_number=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent('gateway@example.com')}`);

  console.log(JSON.stringify({
    login: login.status,
    create: create.status,
    session: session.status,
    sessionData: session.data,
    track: track.status,
    trackData: track.data?.status || track.data
  }, null, 2));
})();
