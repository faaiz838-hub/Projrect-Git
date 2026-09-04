const base = "http://localhost:3000";
const jar = {};

function applyCookies(headers) {
  const raw = headers.get("set-cookie");
  if (!raw) return;
  for (const part of raw.split(",")) {
    const [cookiePair] = part.split(";");
    const idx = cookiePair.indexOf("=");
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
    headers.set("Cookie", Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "));
  }
  const response = await fetch(base + path, { ...options, headers });
  applyCookies(response.headers);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

(async () => {
  const login = await api("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@ali.com", password: "admin123" })
  });

  const create = await api("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Gateway Verifier",
      email: "gateway@example.com",
      phone: "456",
      deliveryAddress: "Checkout Lane",
      items: [{ product_id: 1, quantity: 2 }]
    })
  });

  const session = await api("/api/public/payment-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: create.data.order.orderId,
      order_number: create.data.order.orderNumber,
      email: "gateway@example.com",
      amount: 75,
      payment_method: "card"
    })
  });

  const tracked = await api(`/api/public/order-status?order_number=${encodeURIComponent(create.data.order.orderNumber)}&email=${encodeURIComponent("gateway@example.com")}`);

  console.log(JSON.stringify({
    login: login.status,
    create: create.status,
    paymentSession: session.status,
    sessionData: session.data,
    tracked: tracked.status,
    trackedData: tracked.data.status
  }, null, 2));
})();
