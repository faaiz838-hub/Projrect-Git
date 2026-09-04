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
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
(async () => {
  const login = await api('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ali.com', password: 'admin123' })
  });
  console.log('LOGIN', login.status, JSON.stringify(login.data));

  const products = await api('/api/products');
  const target = products.data.products.find((p) => Number(p.opening_stock_finalized || 0) !== 1) || products.data.products[0];
  console.log('TARGET_PRODUCT', JSON.stringify({ id: target.id, name: target.name, opening_stock: target.opening_stock, opening_stock_finalized: target.opening_stock_finalized }));

  const batches = await api('/api/inventory/opening-stock/batches?product_id=' + target.id);
  console.log('BATCHES', batches.status, JSON.stringify(batches.data));
  const batchId = batches.data.batches && batches.data.batches.length ? batches.data.batches[0].id : null;

  if (!batchId) {
    console.log('NO_BATCH_AVAILABLE');
    process.exit(0);
  }

  const post = await api('/api/inventory/opening-stock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: target.id,
      batch_id: batchId,
      quantity: 7,
      unit_cost: 9.5,
      notes: 'Live verification opening stock'
    })
  });

  console.log('OPENING_STOCK_POST', post.status, JSON.stringify(post.data));

  const productAfter = await api('/api/products/' + target.id);
  console.log('PRODUCT_AFTER', productAfter.status, JSON.stringify(productAfter.data.product && {
    id: productAfter.data.product.id,
    name: productAfter.data.product.name,
    opening_stock: productAfter.data.product.opening_stock,
    opening_stock_finalized: productAfter.data.product.opening_stock_finalized
  }));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
