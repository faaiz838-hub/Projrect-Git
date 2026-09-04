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
  console.log("LOGIN", login.status, JSON.stringify(login.data));

  const create = await api("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Verifier",
      email: "v@example.com",
      phone: "123",
      deliveryAddress: "Addr",
      items: [{ product_id: 1, quantity: 1 }]
    })
  });
  console.log("CREATE", create.status, JSON.stringify(create.data));

  const orderNumber = create.data.order.orderNumber;
  const track = await api(`/api/public/order-status?order_number=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent("v@example.com")}`);
  console.log("TRACK", track.status, JSON.stringify(track.data));

  const capture = await api(`/api/public/orders/${create.data.order.orderId}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_number: orderNumber,
      email: "v@example.com",
      amount: 25,
      payment_method: "Card",
      reference: "TEST-001"
    })
  });
  console.log("CAPTURE", capture.status, JSON.stringify(capture.data));
})();
