const express = require('express');
const session = require('express-session');
const path = require('path');
const { db, getProductStock, formatDate } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin@premierstore.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ali-medical-admin-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.get(['/Demo', '/Demo.html', '/demo', '/demo.html'], (req, res) => {
  res.redirect('/landing/');
});

app.use('/admin', (req, res, next) => {
  const adminPath = req.path || '/';
  const adminPages = new Set([
    '/', '',
    '/index.html',
    '/inventory', '/inventory.html',
    '/purchases', '/purchases.html',
    '/orders', '/orders.html',
    '/reports', '/reports.html',
    '/settings', '/settings.html',
    '/company-settings', '/company-settings.html',
    '/accounts', '/accounts.html'
  ]);
  const isAdminHtml = adminPages.has(adminPath);
  const isLoginPage = adminPath === '/login.html';

  if (isLoginPage) return next();
  if (req.session && req.session.isAdmin && isAdminHtml) return next();
  if (isAdminHtml) return res.redirect('/admin/login.html');
  return next();
});
app.use(express.static(__dirname));

const TRACK_LIMIT_WINDOW_MS = 60 * 1000;
const TRACK_LIMIT_REQUESTS = 10;
const trackLookupAttempts = new Map();

function normalizeCustomerName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeInvoiceNumber(value) {
  return String(value ?? '').trim().toUpperCase();
}

function applyTrackRateLimit(req, res, next) {
  const clientIp = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const bucket = trackLookupAttempts.get(clientIp) || [];
  const recent = bucket.filter((timestamp) => now - timestamp < TRACK_LIMIT_WINDOW_MS);

  if (recent.length >= TRACK_LIMIT_REQUESTS) {
    return res.status(429).json({
      error: 'We couldn\'t verify this order. Please check your invoice number and customer name and try again.'
    });
  }

  recent.push(now);
  trackLookupAttempts.set(clientIp, recent);
  next();
}

function requireAdminAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
}

function requireAdminPage(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/admin/login.html');
}

function getCompanySettings() {
  const row = db.prepare(`
    SELECT * FROM company_settings ORDER BY id DESC LIMIT 1
  `).get();
  return row || {
    company_name: 'Business Name',
    legal_business_name: 'Business Name Ltd',
    business_type: 'Business',
    company_registration_number: '',
    tax_number: '',
    industry_category: 'Retail',
    primary_phone: '+44 20 0000 0000',
    secondary_phone: '',
    email: 'sales@yourbusiness.com',
    website: 'https://yourbusiness.com',
    whatsapp_number: '',
    address_line_1: '123 Wellness Street',
    address_line_2: '',
    area_locality: 'City Centre',
    city: 'London',
    state_province: 'Greater London',
    postal_code: 'SW1A 1AA',
    country: 'United Kingdom',
    logo_data_url: '',
    alternate_logo_data_url: '',
    document_header: '',
    document_footer: '',
    terms_and_conditions: 'Please pay within 30 days. Goods remain the property of the seller until full payment is received.',
    return_policy: 'Returns accepted within 14 days for sealed items in original packaging.',
    payment_terms: 'Payment due upon receipt. All invoices are due net 30 days.',
    footer_tagline: 'Your trusted destination for premium essentials, dependable delivery, and a refined shopping experience.',
    general_notes: 'Thank you for your business.',
    authorized_signature_name: 'Operations Director',
    authorized_signature_designation: 'Director',
    signature_image_data_url: '',
    customer_support_contact: 'Customer support: +44 20 0000 0000',
    show_logo: 1,
    show_address: 1,
    show_phone: 1,
    show_email: 1,
    show_website: 1,
    show_tax_number: 1,
    show_authorized_signature: 1,
    currency: 'GBP',
    currency_symbol: '£',
    date_format: 'DD/MM/YYYY',
    time_format: '24H',
    time_zone: 'UTC',
    decimal_places: 2,
    number_formatting: '1,234.56',
    tax_registration_number: '',
    default_tax_configuration: 'Standard VAT',
    tax_display_preference: 'Exclusive',
    tax_inclusive_preference: 0,
    invoice_prefix: 'INV',
    invoice_number_format: 'INV-YYYYMM-######',
    starting_number: 1,
    number_of_digits: 6,
    free_delivery_threshold: 35,
    invoice_terms: 'Net 30 days',
    default_notes: 'Thank you for shopping with Business Name.',
    landing_hero_text: 'Premium essentials for a refined everyday routine\nPremium wellness essentials for modern life.',
    landing_marquee_text: 'Fast Delivery / Trusted Care / Secure Checkout / Premium Products',
    landing_hero_title: 'Premium essentials for a refined everyday routine',
    landing_hero_subtitle: 'Premium wellness essentials for modern life.',
    landing_service_fast_delivery: 'Fast Delivery',
    landing_service_trusted_care: 'Trusted Care',
    landing_service_secure_checkout: 'Secure Checkout',
    landing_service_premium_products: 'Premium Products',
    social_facebook: '',
    social_youtube: '',
    social_snapchat: '',
    social_tiktok: '',
    social_pinterest: '',
    social_canva: '',
    social_whatsapp: '',
    social_instagram: ''
  };
}

function formatCompanyAddress(company) {
  return [
    company.address_line_1,
    company.address_line_2,
    [company.area_locality, company.city, company.state_province, company.postal_code].filter(Boolean).join(', '),
    company.country
  ].filter(Boolean).join('\n');
}

function safeNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function toDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString().slice(0, 10);
}

function getAccountsDateRange(req) {
  const fromDate = toDateOnly(req.query.from_date || req.query.from || '');
  const toDate = toDateOnly(req.query.to_date || req.query.to || '');
  return { fromDate, toDate };
}

function generatePurchaseNumber() {
  const now = new Date();
  const monthCode = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `PUR-${monthCode}`;

  const stalePurchaseRows = db.prepare(`
    SELECT id, purchase_number
    FROM purchases
    WHERE purchase_number LIKE 'PUR-%'
      AND purchase_number NOT GLOB 'PUR-??-????'
  `).all();

  if (stalePurchaseRows.length) {
    for (const row of stalePurchaseRows) {
      db.prepare('DELETE FROM purchases WHERE id = ?').run(row.id);
    }
  }

  const latestRow = db.prepare(`
    SELECT purchase_number
    FROM purchases
    WHERE purchase_number LIKE ?
    ORDER BY purchase_number DESC
    LIMIT 1
  `).get(`${prefix}-%`);

  let nextSerial = 1;
  if (latestRow && latestRow.purchase_number) {
    const match = String(latestRow.purchase_number).match(new RegExp(`^${prefix}-(\\d{4})$`));
    if (match) {
      nextSerial = Number(match[1]) + 1;
    }
  }

  return `${prefix}-${String(nextSerial).padStart(4, '0')}`;
}

function generateOrderNumber() {
  const now = new Date();
  const monthCode = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `ORD-${monthCode}`;

  const staleOrderRows = db.prepare(`
    SELECT id, order_number
    FROM orders
    WHERE order_number LIKE 'ORD-%'
      AND order_number NOT GLOB 'ORD-??-??'
  `).all();

  if (staleOrderRows.length) {
    for (const row of staleOrderRows) {
      db.prepare('DELETE FROM orders WHERE id = ?').run(row.id);
    }
  }

  const latestRow = db.prepare(`
    SELECT order_number
    FROM orders
    WHERE order_number LIKE ?
    ORDER BY order_number DESC
    LIMIT 1
  `).get(`${prefix}-%`);

  let nextSerial = 1;
  if (latestRow && latestRow.order_number) {
    const match = String(latestRow.order_number).match(new RegExp(`^${prefix}-(\\d{2})$`));
    if (match) {
      nextSerial = Number(match[1]) + 1;
    }
  }

  return `${prefix}-${String(nextSerial).padStart(2, '0')}`;
}

function generateSaleInvoiceNumber() {
  const now = new Date();
  const monthCode = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `SAL-${monthCode}`;

  const staleInvoiceRows = db.prepare(`
    SELECT id, invoice_number
    FROM sale_invoices
    WHERE invoice_number LIKE 'SAL-%'
      AND invoice_number NOT GLOB 'SAL-??-???'
  `).all();

  if (staleInvoiceRows.length) {
    for (const row of staleInvoiceRows) {
      db.prepare('DELETE FROM sale_invoices WHERE id = ?').run(row.id);
    }
  }

  const latestRow = db.prepare(`
    SELECT invoice_number
    FROM sale_invoices
    WHERE invoice_number LIKE ?
    ORDER BY invoice_number DESC
    LIMIT 1
  `).get(`${prefix}-%`);

  let nextSerial = 1;
  if (latestRow && latestRow.invoice_number) {
    const match = String(latestRow.invoice_number).match(new RegExp(`^${prefix}-(\\d{3})$`));
    if (match) {
      nextSerial = Number(match[1]) + 1;
    }
  }

  return `${prefix}-${String(nextSerial).padStart(3, '0')}`;
}

function insertSupplierLedgerEntry({ supplierId, referenceType, referenceId = null, entryDate, description, debit = 0, credit = 0 }) {
  const supplierIdNumber = Number(supplierId || 0);
  if (!supplierIdNumber) {
    throw new Error('A valid supplier is required to post a supplier ledger entry.');
  }

  const currentBalance = db.prepare(`
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS running_balance
    FROM supplier_ledger
    WHERE supplier_id = ?
  `).get(supplierIdNumber).running_balance;

  const entryDebit = Number(debit || 0);
  const entryCredit = Number(credit || 0);
  const nextBalance = Number(currentBalance || 0) + entryDebit - entryCredit;

  const result = db.prepare(`
    INSERT INTO supplier_ledger (supplier_id, reference_type, reference_id, entry_date, description, debit, credit, balance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    supplierIdNumber,
    String(referenceType || 'Entry'),
    referenceId ?? null,
    toDateOnly(entryDate || new Date().toISOString()),
    String(description || 'Supplier transaction').trim() || 'Supplier transaction',
    entryDebit.toFixed(2),
    entryCredit.toFixed(2),
    nextBalance.toFixed(2)
  );

  return db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(result.lastInsertRowid);
}

function insertPaymentLedgerEntry({ orderId = null, invoiceId = null, customerId = null, supplierId = null, paymentReference = '', paymentMethod = 'Cash', amount = 0, entryType = 'Payment', entryDate, description = '', status = 'Captured' }) {
  const normalizedAmount = Number(amount || 0);
  const targetOrderId = Number(orderId || 0);
  const targetInvoiceId = Number(invoiceId || 0);
  const targetCustomerId = Number(customerId || 0);
  const targetSupplierId = Number(supplierId || 0);

  let currentBalance = 0;
  if (targetCustomerId) {
    currentBalance = Number(db.prepare('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payment_ledger WHERE customer_id = ?').get(targetCustomerId).total_paid || 0);
  } else if (targetSupplierId) {
    currentBalance = Number(db.prepare('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payment_ledger WHERE supplier_id = ?').get(targetSupplierId).total_paid || 0);
  } else if (targetOrderId) {
    currentBalance = Number(db.prepare('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payment_ledger WHERE order_id = ?').get(targetOrderId).total_paid || 0);
  } else if (targetInvoiceId) {
    currentBalance = Number(db.prepare('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payment_ledger WHERE invoice_id = ?').get(targetInvoiceId).total_paid || 0);
  }

  const nextBalance = Number(currentBalance || 0) + normalizedAmount;
  const result = db.prepare(`
    INSERT INTO payment_ledger (order_id, invoice_id, customer_id, supplier_id, payment_reference, payment_method, entry_type, amount, balance, entry_date, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderId ? Number(orderId) : null,
    invoiceId ? Number(invoiceId) : null,
    targetCustomerId || null,
    targetSupplierId || null,
    String(paymentReference || `PAY-${Date.now()}`).trim() || `PAY-${Date.now()}`,
    String(paymentMethod || 'Cash').trim() || 'Cash',
    String(entryType || 'Payment').trim() || 'Payment',
    normalizedAmount.toFixed(2),
    nextBalance.toFixed(2),
    toDateOnly(entryDate || new Date().toISOString()),
    String(description || 'Payment recorded').trim() || 'Payment recorded',
    String(status || 'Captured').trim() || 'Captured'
  );

  return db.prepare('SELECT * FROM payment_ledger WHERE id = ?').get(result.lastInsertRowid);
}

function getSupplierLedgerRows({ fromDate = '', toDate = '', supplierId = 0 } = {}) {
  const conditions = ['1 = 1'];
  const params = [];

  if (supplierId) {
    conditions.push('sl.supplier_id = ?');
    params.push(supplierId);
  }
  if (fromDate) {
    conditions.push('date(sl.entry_date) >= date(?)');
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push('date(sl.entry_date) <= date(?)');
    params.push(toDate);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const rows = db.prepare(`
    SELECT sl.*, s.name AS supplier_name, s.company_name
    FROM supplier_ledger sl
    LEFT JOIN suppliers s ON s.id = sl.supplier_id
    ${where}
    ORDER BY date(sl.entry_date) ASC, sl.id ASC
  `).all(...params);

  return rows.map((row) => {
    const debit = safeNumber(row.debit);
    const credit = safeNumber(row.credit);
    const typeLabel = String(row.reference_type || 'Entry');
    let entryType = 'Entry';
    if (typeLabel === 'Purchase') entryType = 'Purchase Invoice';
    else if (typeLabel === 'PurchaseReturn') entryType = 'Return';
    else if (typeLabel === 'VendorPayment') entryType = 'Payment';
    else if (typeLabel === 'Payment') entryType = 'Payment';

    return {
      id: row.id,
      date: row.entry_date,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name || 'Supplier',
      reference_no: (() => {
        if (row.reference_type === 'Purchase') {
          return db.prepare('SELECT purchase_number FROM purchases WHERE id = ?').get(row.reference_id)?.purchase_number || `PUR-${row.reference_id || row.id}`;
        }
        if (row.reference_type === 'PurchaseReturn') {
          return db.prepare('SELECT return_number FROM purchase_returns WHERE id = ?').get(row.reference_id)?.return_number || `PR-${row.reference_id || row.id}`;
        }
        return row.description || `VND-${row.id}`;
      })(),
      type: entryType,
      description: row.description || 'Supplier transaction',
      debit,
      credit,
      running_balance: 0,
    };
  });
}

function getClientLedgerRows({ fromDate = '', toDate = '', customerId = 0 } = {}) {
  const conditions = ['1 = 1'];
  const params = [];

  if (customerId) {
    conditions.push('customer_id = ?');
    params.push(customerId);
  }

  if (fromDate) {
    conditions.push('date(entry_date) >= date(?)');
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push('date(entry_date) <= date(?)');
    params.push(toDate);
  }

  const saleInvoiceRows = db.prepare(`
    SELECT si.id, si.invoice_date AS entry_date, si.customer_id, COALESCE(c.name, o.customer_name, 'Walk-in Customer') AS customer_name,
      si.invoice_number AS reference_no, 'Sale Invoice' AS reference_type, 'Sale Invoice' AS type, si.total AS amount, 0 AS credit,
      CONCAT('Invoice issued against ', COALESCE(o.order_number, 'order')) AS description
    FROM sale_invoices si
    LEFT JOIN orders o ON o.id = si.order_id
    LEFT JOIN customers c ON c.id = si.customer_id
    WHERE 1 = 1
  `).all();

  const paymentRows = db.prepare(`
    SELECT pl.id, pl.entry_date AS entry_date, COALESCE(pl.customer_id, o.customer_id, i.customer_id) AS customer_id,
      COALESCE(c.name, o.customer_name, 'Walk-in Customer') AS customer_name,
      COALESCE(pl.payment_reference, CONCAT('PAY-', pl.id)) AS reference_no,
      'Payment' AS reference_type, 'Payment' AS type, 0 AS amount, pl.amount AS credit,
      COALESCE(pl.description, 'Client payment') AS description
    FROM payment_ledger pl
    LEFT JOIN orders o ON o.id = pl.order_id
    LEFT JOIN sale_invoices i ON i.id = pl.invoice_id
    LEFT JOIN customers c ON c.id = COALESCE(pl.customer_id, o.customer_id, i.customer_id)
    WHERE pl.amount > 0
  `).all();

  const returnRows = db.prepare(`
    SELECT sr.id, sr.return_date AS entry_date, sr.customer_id, c.name AS customer_name,
      sr.return_number AS reference_no, 'Sale Return' AS reference_type, 'Return' AS type, 0 AS amount, sr.return_amount AS credit,
      COALESCE(sr.return_reason, 'Customer return') AS description
    FROM sale_returns sr
    LEFT JOIN customers c ON c.id = sr.customer_id
    WHERE sr.return_amount > 0
  `).all();

  const allRows = [...saleInvoiceRows.map((row) => ({ ...row, debit: safeNumber(row.amount), credit: 0 })), ...paymentRows.map((row) => ({ ...row, debit: 0, credit: safeNumber(row.credit) })), ...returnRows.map((row) => ({ ...row, debit: 0, credit: safeNumber(row.credit) }))];

  let filtered = allRows.filter((row) => {
    if (customerId && Number(row.customer_id || 0) !== customerId) return false;
    if (fromDate && row.entry_date && row.entry_date < fromDate) return false;
    if (toDate && row.entry_date && row.entry_date > toDate) return false;
    return true;
  });

  filtered = filtered.sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)) || Number(a.id) - Number(b.id));

  let runningBalance = 0;
  return filtered.map((row) => {
    const debit = safeNumber(row.debit || row.amount || 0);
    const credit = safeNumber(row.credit || 0);
    runningBalance += debit - credit;
    return {
      id: row.id,
      date: row.entry_date,
      customer_id: row.customer_id,
      customer_name: row.customer_name || 'Customer',
      reference_no: row.reference_no || `TXN-${row.id}`,
      type: row.type || row.reference_type || 'Entry',
      description: row.description || 'Transaction',
      debit,
      credit,
      running_balance: runningBalance,
    };
  });
}

function getExpenseCategoryOptions() {
  return ['Domain Fee', 'Tax', 'Internet Expenses', 'Hosting', 'Marketing', 'Office Supplies', 'Miscellaneous'];
}

function buildProfitabilityRows({ fromDate = '', toDate = '' } = {}) {
  const params = [];
  const filters = [];

  if (fromDate) {
    filters.push('date(si.invoice_date) >= date(?)');
    params.push(fromDate);
  }
  if (toDate) {
    filters.push('date(si.invoice_date) <= date(?)');
    params.push(toDate);
  }

  filters.push("(o.status = 'Confirmed' OR o.status = 'Dispatched' OR si.delivery_status = 'Dispatched')");

  const where = `WHERE ${filters.join(' AND ')}`;
  const rows = db.prepare(`
    SELECT sii.id, sii.product_id, p.name AS product_name, p.pack_size, p.brand,
      SUM(sii.quantity) AS sold_qty,
      SUM(sii.line_total) AS total_net_revenue,
      SUM(sii.quantity * sii.unit_price) AS gross_revenue_before_discount,
      MAX(si.invoice_date) AS last_invoice_date,
      MAX(si.discount) AS invoice_discount
    FROM sale_invoice_items sii
    LEFT JOIN sale_invoices si ON si.id = sii.invoice_id
    LEFT JOIN orders o ON o.id = si.order_id
    LEFT JOIN products p ON p.id = sii.product_id
    ${where}
    GROUP BY sii.product_id, p.name, p.pack_size, p.brand
    ORDER BY p.name ASC
  `).all(...params);

  return rows.map((row) => {
    const soldQty = safeNumber(row.sold_qty);
    const saleRate = soldQty > 0 ? safeNumber(row.gross_revenue_before_discount) / soldQty : 0;
    const netRevenue = safeNumber(row.total_net_revenue);
    const avgSaleRate = soldQty > 0 ? netRevenue / soldQty : 0;
    const grossRevenueBeforeDiscount = safeNumber(row.gross_revenue_before_discount);
    const discountTotal = Math.max(0, grossRevenueBeforeDiscount - netRevenue);
    const discountPct = grossRevenueBeforeDiscount > 0 ? (discountTotal / grossRevenueBeforeDiscount) * 100 : 0;
    const lastPurchase = db.prepare(`
      SELECT pi.unit_cost
      FROM purchase_items pi
      WHERE pi.product_id = ?
      ORDER BY pi.id DESC
      LIMIT 1
    `).get(row.product_id);
    const unitCost = safeNumber(lastPurchase?.unit_cost || 0);
    const cogs = soldQty * unitCost;
    const grossMargin = netRevenue - cogs;

    return {
      product_name: row.product_name || 'Unknown Product',
      pack_size: row.pack_size || '—',
      brand: row.brand || '—',
      sold_qty: soldQty,
      sale_rate: saleRate,
      avg_sale_rate: avgSaleRate,
      discount_pct: discountPct,
      discount_total: discountTotal,
      cogs,
      gross_margin: grossMargin,
      total_net_revenue: netRevenue,
      unit_cost: unitCost,
    };
  });
}

function generateInvoiceForOrder(orderId, { customerId = null, createdBy = 'admin' } = {}) {
  const existingInvoice = db.prepare('SELECT * FROM sale_invoices WHERE order_id = ?').get(orderId);
  if (existingInvoice) {
    return existingInvoice;
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    throw new Error('Order not found for invoice generation.');
  }

  reconcileOrderTotalsFromSaleRates(orderId);

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  const subtotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
  const invoiceNumber = generateSaleInvoiceNumber();
  const invoiceResult = db.prepare(`
    INSERT INTO sale_invoices (invoice_number, order_id, customer_id, invoice_date, subtotal, discount, tax, total, payment_status, delivery_status, created_by)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'Unpaid', ?, ?)
  `).run(invoiceNumber, orderId, customerId || order.customer_id || null, new Date().toISOString(), subtotal.toFixed(2), order.order_total.toFixed(2), order.delivery_status || 'Pending', createdBy || 'admin');

  for (const item of items) {
    db.prepare(`
      INSERT INTO sale_invoice_items (invoice_id, product_id, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?)
    `).run(invoiceResult.lastInsertRowid, item.product_id, item.quantity, item.unit_price.toFixed(2), item.line_total.toFixed(2));
  }

  return db.prepare('SELECT * FROM sale_invoices WHERE id = ?').get(invoiceResult.lastInsertRowid);
}

function normalizeBatchExpiryDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year).slice(-2)}`;
  }

  const ddmmyyMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!ddmmyyMatch) {
    throw new Error('Expiry date must be in DD-MM-YY format.');
  }

  let day = Number(ddmmyyMatch[1]);
  let month = Number(ddmmyyMatch[2]);
  let year = Number(ddmmyyMatch[3]);
  if (year < 100) {
    year += 2000;
  }
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    throw new Error('Expiry date must be a valid calendar date.');
  }

  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year).slice(-2)}`;
}

function parseBatchExpiryDateToIso(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!match) {
    throw new Error('Expiry date must be in DD-MM-YY format.');
  }

  let day = Number(match[1]);
  let month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) {
    year += 2000;
  }
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    throw new Error('Expiry date must be a valid calendar date.');
  }

  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatExpiryDateForDisplay(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year).slice(-2)}`;
  }

  return normalizeBatchExpiryDate(raw);
}

function getProductBatches(productId) {
  return db.prepare(`
    SELECT *
    FROM product_batches
    WHERE product_id = ? AND available_quantity > 0
    ORDER BY expiry_date IS NULL, expiry_date ASC, created_at ASC
  `).all(productId);
}

function resolvePurchaseBatch({ productId, batchId, batchNumber, expiryDate, purchaseCost, supplierName, quantity }) {
  const safeProductId = Number(productId || 0);
  const safeQty = Number(quantity || 0);
  const safeCost = Number(purchaseCost || 0);
  const safeSupplier = String(supplierName || '').trim();

  if (!safeProductId || safeQty <= 0) {
    return null;
  }

  const resolvedBatchId = Number(batchId || 0);
  if (resolvedBatchId) {
    const existingBatch = db.prepare('SELECT * FROM product_batches WHERE id = ?').get(resolvedBatchId);
    if (existingBatch) {
      const newQty = Number(existingBatch.available_quantity || 0) + safeQty;
      db.prepare(`
        UPDATE product_batches
        SET product_id = COALESCE(NULLIF(?, 0), product_id), available_quantity = ?, purchase_cost = CASE WHEN ? > 0 THEN ? ELSE purchase_cost END, expiry_date = COALESCE(NULLIF(?, ''), expiry_date), supplier_name = COALESCE(NULLIF(?, ''), supplier_name), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(safeProductId, newQty.toFixed(2), safeCost, safeCost.toFixed(2), String(expiryDate || '').trim(), safeSupplier || '', existingBatch.id);
      return db.prepare('SELECT * FROM product_batches WHERE id = ?').get(existingBatch.id);
    }
  }

  const normalizedBatchNumber = String(batchNumber || '').trim();
  let normalizedExpiry = '';
  try {
    normalizedExpiry = normalizeBatchExpiryDate(expiryDate || '');
  } catch (error) {
    normalizedExpiry = String(expiryDate || '').trim();
  }
  const candidateBatchNumber = normalizedBatchNumber || `${String(Date.now()).slice(-6)}`;

  let batch = normalizedBatchNumber
    ? db.prepare(`
        SELECT *
        FROM product_batches
        WHERE batch_number = ? AND COALESCE(expiry_date, '') = COALESCE(?, '')
        ORDER BY created_at DESC
        LIMIT 1
      `).get(candidateBatchNumber, normalizedExpiry)
    : null;

  if (!batch) {
    const result = db.prepare(`
      INSERT INTO product_batches (product_id, batch_number, expiry_date, initial_quantity, available_quantity, purchase_cost, supplier_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(safeProductId, candidateBatchNumber, normalizedExpiry || null, safeQty, safeQty, safeCost.toFixed(2), safeSupplier || 'Supplier');
    batch = db.prepare('SELECT * FROM product_batches WHERE id = ?').get(result.lastInsertRowid);
  } else {
    const newQty = Number(batch.available_quantity || 0) + safeQty;
    const nextCost = Number(batch.purchase_cost || 0) > 0 ? Number(batch.purchase_cost || 0) : safeCost;
    db.prepare(`
      UPDATE product_batches
      SET product_id = COALESCE(product_id, ?), available_quantity = ?, purchase_cost = ?, expiry_date = COALESCE(NULLIF(?, ''), expiry_date), supplier_name = COALESCE(NULLIF(?, ''), supplier_name), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(safeProductId, newQty, nextCost.toFixed(2), normalizedExpiry, safeSupplier || '', batch.id);
    batch = db.prepare('SELECT * FROM product_batches WHERE id = ?').get(batch.id);
  }

  return batch;
}

function getSuggestedBatchAllocation(productId, requiredQty) {
  const batches = getProductBatches(productId);
  const suggestions = [];
  let remaining = Number(requiredQty || 0);

  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = Number(batch.available_quantity || 0);
    if (available <= 0) continue;
    const selected = Math.min(available, remaining);
    suggestions.push({ batch_id: Number(batch.id), quantity: selected, expiry_date: batch.expiry_date, batch_number: batch.batch_number });
    remaining -= selected;
  }

  if (remaining > 0) {
    throw new Error(`Insufficient stock for product ${productId}. Available stock for FEFO batches is below the requested quantity.`);
  }

  return suggestions;
}

function normalizeDispatchBatchInput(rawBatches, orderItems) {
  const allocations = Array.isArray(rawBatches) ? rawBatches : [];
  const selectedByItem = new Map();

  for (const entry of allocations) {
    const productId = Number(entry.product_id ?? entry.productId ?? 0);
    const batchId = Number(entry.batch_id ?? entry.batchId ?? 0);
    const quantity = Number(entry.quantity ?? entry.qty ?? 0);
    if (!productId || !batchId || !Number.isFinite(quantity) || quantity <= 0) continue;

    const key = `${productId}`;
    const current = selectedByItem.get(key) || [];
    current.push({ product_id: productId, batch_id: batchId, quantity });
    selectedByItem.set(key, current);
  }

  const normalized = [];
  for (const item of orderItems) {
    const productId = Number(item.product_id || item.productId || 0);
    const required = Number(item.quantity || item.qty || 0);
    const chosen = selectedByItem.get(`${productId}`) || [];
    const totalChosen = chosen.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

    if (totalChosen > 0 && totalChosen !== required) {
      normalized.push({ product_id: productId, allocations: chosen, quantity: required });
      continue;
    }

    if (totalChosen === 0) {
      const suggested = getSuggestedBatchAllocation(productId, required);
      normalized.push({ product_id: productId, allocations: suggested, quantity: required });
      continue;
    }

    normalized.push({ product_id: productId, allocations: chosen, quantity: required });
  }

  return normalized;
}

function applyBatchAllocationToOrder({ orderId, invoiceId, batchAllocations, createdBy }) {
  const allocations = Array.isArray(batchAllocations) ? batchAllocations : [];
  const rows = [];

  for (const allocation of allocations) {
    const productId = Number(allocation.product_id || 0);
    const quantity = Number(allocation.quantity || 0);
    if (!productId || !quantity) continue;

    let remaining = quantity;
    for (const batchEntry of Array.isArray(allocation.allocations) ? allocation.allocations : []) {
      const batchId = Number(batchEntry.batch_id || 0);
      const batchQty = Number(batchEntry.quantity || 0);
      if (!batchId || !batchQty) continue;
      const take = Math.min(batchQty, remaining);
      if (take <= 0) continue;

      const batch = db.prepare('SELECT * FROM product_batches WHERE id = ?').get(batchId);
      if (!batch || Number(batch.product_id) !== productId) {
        throw new Error(`Batch ${batchId} is not valid for product ${productId}.`);
      }
      if (Number(batch.available_quantity || 0) < take) {
        throw new Error(`Batch ${batch.batch_number} does not have enough available stock. Available: ${batch.available_quantity}.`);
      }

      db.prepare(`
        UPDATE product_batches
        SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(take, batchId);

      db.prepare(`
        INSERT INTO order_item_batches (order_id, invoice_id, product_id, batch_id, quantity)
        VALUES (?, ?, ?, ?, ?)
      `).run(orderId, invoiceId, productId, batchId, take);

      db.prepare(`
        INSERT INTO inventory_transactions (product_id, batch_id, transaction_type, reference_type, reference_id, quantity_out, unit_cost, created_by, notes)
        VALUES (?, ?, 'Dispatch', 'Order', ?, ?, ?, ?, ?)
      `).run(productId, batchId, orderId, take, Number(batch.purchase_cost || 0), createdBy || 'admin', `Dispatch allocation for order ${orderId}`);

      rows.push({ product_id: productId, batch_id: batchId, quantity: take, batch_number: batch.batch_number, expiry_date: batch.expiry_date });
      remaining -= take;
    }

    if (remaining > 0) {
      throw new Error(`Not enough batch stock allocated for product ${productId}. Remaining need: ${remaining}.`);
    }
  }

  return rows;
}

function getCustomerByContact(email, phone) {
  if (email) {
    const byEmail = db.prepare('SELECT * FROM customers WHERE LOWER(email) = LOWER(?)').get(String(email).trim());
    if (byEmail) return byEmail;
  }
  if (phone) {
    const byPhone = db.prepare('SELECT * FROM customers WHERE phone = ?').get(String(phone).trim());
    if (byPhone) return byPhone;
  }
  return null;
}

function upsertCustomer(payload = {}) {
  const name = String(payload.name || payload.customerName || '').trim();
  const email = String(payload.email || '').trim();
  const phone = String(payload.phone || '').trim();
  const city = String(payload.city || '').trim();
  const address = String(payload.address || payload.deliveryAddress || '').trim();

  if (!name) {
    throw new Error('Customer name is required.');
  }

  const existing = getCustomerByContact(email || null, phone || null);
  if (existing) {
    db.prepare(`
      UPDATE customers
      SET name = ?, email = COALESCE(NULLIF(?, ''), email), phone = COALESCE(NULLIF(?, ''), phone), city = COALESCE(NULLIF(?, ''), city), address = COALESCE(NULLIF(?, ''), address), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, email, phone, city, address, existing.id);
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.id);
  }

  const customerCode = `CUST-${Date.now()}`;
  const result = db.prepare(`
    INSERT INTO customers (name, email, phone, city, address, customer_code)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, email || null, phone || null, city || null, address || null, customerCode);
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
}

function resolveOrderLineUnitPrice(item, product) {
  const provided = Number(item.unit_price ?? item.unitPrice ?? 0);
  const fallback = Number(product?.sale_rate ?? 0);

  if (Number.isFinite(provided) && provided > 0) {
    return provided;
  }

  return fallback;
}

function buildOrderRecordFromItemList(items) {
  let total = 0;
  const preparedItems = [];

  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(item.product_id);
    if (!product) {
      throw new Error(`Product ${item.product_id} is unavailable.`);
    }

    const quantity = Number(item.quantity || 0);
    const unitPrice = resolveOrderLineUnitPrice(item, product);
    const lineTotal = quantity * unitPrice;

    if (quantity <= 0) {
      throw new Error(`Quantity for ${product.name} must be greater than zero.`);
    }

    total += lineTotal;
    preparedItems.push({ productId: product.id, qty: quantity, unitPrice, lineTotal, product });
  }

  return { total, preparedItems };
}

function reconcileOrderTotalsFromSaleRates(orderId) {
  const orderItems = db.prepare(`
    SELECT oi.*, p.sale_rate
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `).all(orderId);

  if (!orderItems.length) {
    db.prepare('UPDATE orders SET order_total = 0 WHERE id = ?').run(orderId);
    return 0;
  }

  let total = 0;

  for (const item of orderItems) {
    const quantity = Number(item.quantity || 0);
    const currentUnitPrice = Number(item.unit_price || 0);
    const fallbackPrice = Number(item.sale_rate || 0);
    const unitPrice = currentUnitPrice > 0 ? currentUnitPrice : fallbackPrice;
    const lineTotal = quantity * unitPrice;

    total += lineTotal;

    db.prepare(`
      UPDATE order_items
      SET unit_price = ?, line_total = ?
      WHERE id = ?
    `).run(unitPrice.toFixed(2), lineTotal.toFixed(2), item.id);
  }

  db.prepare('UPDATE orders SET order_total = ? WHERE id = ?').run(total.toFixed(2), orderId);
  return total;
}

function serializeProduct(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category_name || 'Uncategorized',
    brand: row.brand,
    description: row.description,
    pack_size: row.pack_size,
    unit: row.unit,
    purchase_rate: Number(row.purchase_rate || 0),
    sale_rate: Number(row.sale_rate || 0),
    tax_rate: Number(row.tax_rate || 0),
    image_url: row.image_url,
    active: Boolean(row.active),
    opening_stock: Number(row.opening_stock || 0),
    reorder_level: Number(row.reorder_level || 0),
    current_stock: Number(row.current_stock || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function determinePaymentStatus(total, paidAmount) {
  const totalAmount = Number(total || 0);
  const paid = Number(paidAmount || 0);
  if (paid <= 0) return 'Unpaid';
  if (paid >= totalAmount) return 'Paid';
  return 'Partial';
}

const PAYMENT_GATEWAYS = {
  card: { label: 'Card', type: 'card', online: true },
  paypal: { label: 'PayPal', type: 'paypal', online: true },
  bank_transfer: { label: 'Bank Transfer', type: 'bank_transfer', online: false },
  cash_on_delivery: { label: 'Cash on Delivery', type: 'cash_on_delivery', online: false },
};

function createPublicPaymentSession({ orderId, orderNumber, email, amount, paymentMethod }) {
  const methodKey = String(paymentMethod || 'card').trim().toLowerCase();
  const gateway = PAYMENT_GATEWAYS[methodKey] || PAYMENT_GATEWAYS.card;
  const baseAmount = Number(amount || 0);
  const sessionId = `gw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    success: true,
    order_id: Number(orderId || 0),
    order_number: orderNumber || '',
    customer_email: email || '',
    amount: Number(baseAmount || 0),
    gateway: gateway.label,
    gateway_type: gateway.type,
    method: methodKey,
    online_payment: Boolean(gateway.online),
    session_id: sessionId,
    status: 'ready',
    checkout_url: '/track-order',
    secure_note: gateway.online
      ? 'Secure gateway session created successfully.'
      : 'Manual payment method selected; no online gateway capture is required.'
  };
}

function escapePdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ');
}

function buildInvoicePdfBuffer(invoice, order, items) {
  const company = getCompanySettings();
  const headerLines = [];
  if (company.show_logo && company.logo_data_url) {
    headerLines.push(company.company_name || 'Company');
  } else {
    headerLines.push(company.company_name || 'Company');
  }
  const addressText = company.show_address ? formatCompanyAddress(company) : '';
  const contactBits = [];
  if (company.show_phone && company.primary_phone) contactBits.push(company.primary_phone);
  if (company.show_email && company.email) contactBits.push(company.email);
  if (company.show_website && company.website) contactBits.push(company.website);
  if (company.show_tax_number && (company.tax_number || company.tax_registration_number)) contactBits.push(`Tax: ${company.tax_number || company.tax_registration_number}`);

  const lines = [
    company.company_name || 'Company',
    ...(addressText ? [addressText] : []),
    ...(contactBits.length ? [contactBits.join(' | ')] : []),
    '',
    'Invoice: ' + (invoice.invoice_number || 'N/A'),
    'Order: ' + (order.order_number || ''),
    'Customer: ' + (order.customer_name || 'Walk-in Customer'),
    'Phone: ' + (order.phone || 'N/A'),
    'Address: ' + (order.delivery_address || 'N/A'),
    'Date: ' + (invoice.invoice_date || new Date().toISOString()),
    '',
    'Item                     Qty      Price      Total',
    '--------------------------------------------------'
  ];

  for (const item of items || []) {
    lines.push(`${(item.product_name || item.name || 'Product').slice(0, 22).padEnd(22)} ${String(item.quantity || 0).padStart(4, ' ')} ${String(Number(item.unit_price || 0).toFixed(2)).padStart(9, ' ')} ${String(Number(item.line_total || 0).toFixed(2)).padStart(10, ' ')}`);
  }

  lines.push('--------------------------------------------------');
  lines.push(`Subtotal: ${company.currency_symbol || '£'}${Number(invoice.subtotal || 0).toFixed(2)}`);
  lines.push(`Tax: ${company.currency_symbol || '£'}${Number(invoice.tax || 0).toFixed(2)}`);
  lines.push(`Total: ${company.currency_symbol || '£'}${Number(invoice.total || 0).toFixed(2)}`);
  lines.push(`Paid: ${company.currency_symbol || '£'}${Number(invoice.paid_amount || 0).toFixed(2)}`);
  lines.push(`Status: ${invoice.payment_status || 'Unpaid'}`);
  if (company.show_authorized_signature && (company.authorized_signature_name || company.authorized_signature_designation)) {
    lines.push('');
    lines.push(`Authorized by: ${company.authorized_signature_name || 'Authorized Signatory'}`);
    lines.push(company.authorized_signature_designation || '');
  }
  const termsText = company.terms_and_conditions || company.invoice_terms || 'Terms and Conditions';
  const notesText = company.general_notes || company.default_notes || '';
  if (termsText) lines.push(`Terms: ${termsText}`);
  if (notesText) lines.push(`Notes: ${notesText}`);

  let content = '';
  let y = 760;
  for (const line of lines) {
    content += `BT /F1 12 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET\n`;
    y -= 18;
  }

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (String(email || '').trim().toLowerCase() === String(ADMIN_USER).trim().toLowerCase() && String(password || '') === String(ADMIN_PASSWORD)) {
    req.session.isAdmin = true;
    req.session.username = ADMIN_USER;
    return req.session.save((error) => {
      if (error) {
        return res.status(500).json({ error: 'Unable to start the admin session.' });
      }
      return res.json({ success: true, message: 'Login successful.' });
    });
  }
  return res.status(401).json({ error: 'Invalid admin credentials.' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Logged out.' });
  });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.isAdmin), user: req.session?.username || null });
});

app.get('/api/public/company-settings', (req, res) => {
  res.json({ company: getCompanySettings() });
});

app.get('/api/company-settings', requireAdminAuth, (req, res) => {
  const company = getCompanySettings();
  res.json({ company });
});

app.put('/api/company-settings', requireAdminAuth, (req, res) => {
  try {
    const payload = req.body || {};
    const existing = getCompanySettings();
    const row = {
      ...existing,
      ...payload,
      updated_at: new Date().toISOString()
    };

    const columns = [
      'company_name','legal_business_name','business_type','company_registration_number','tax_number','industry_category',
      'primary_phone','secondary_phone','email','website','whatsapp_number',
      'address_line_1','address_line_2','area_locality','city','state_province','postal_code','country',
      'logo_data_url','alternate_logo_data_url','document_header','document_footer','footer_tagline','terms_and_conditions','return_policy','payment_terms','general_notes',
      'authorized_signature_name','authorized_signature_designation','signature_image_data_url','customer_support_contact',
      'show_logo','show_address','show_phone','show_email','show_website','show_tax_number','show_authorized_signature',
      'currency','currency_symbol','date_format','time_format','time_zone','decimal_places','number_formatting',
      'tax_registration_number','default_tax_configuration','tax_display_preference','tax_inclusive_preference',
      'invoice_prefix','invoice_number_format','starting_number','number_of_digits','free_delivery_threshold','invoice_terms','default_notes',
      'landing_hero_text','landing_marquee_text','landing_hero_title','landing_hero_subtitle','landing_service_fast_delivery','landing_service_trusted_care','landing_service_secure_checkout','landing_service_premium_products',
      'social_facebook','social_youtube','social_snapchat','social_tiktok','social_pinterest','social_canva','social_whatsapp','social_instagram',
      'updated_at'
    ];

    const values = columns.map((key) => row[key] ?? null);
    if (existing && existing.id) {
      const sql = `UPDATE company_settings SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`;
      db.prepare(sql).run(...values, existing.id);
    } else {
      const insertCols = columns.join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      const result = db.prepare(`INSERT INTO company_settings (${insertCols}) VALUES (${placeholders})`).run(...values);
      row.id = result.lastInsertRowid;
    }

    res.json({ success: true, company: getCompanySettings() });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to save company settings.' });
  }
});

app.get('/api/categories', (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  res.json({ categories: rows });
});

app.get('/api/settings/metadata', requireAdminAuth, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  const brands = db.prepare('SELECT * FROM brands ORDER BY name ASC').all();
  const packSizes = db.prepare('SELECT * FROM pack_sizes ORDER BY size ASC').all();
  res.json({ categories, brands, pack_sizes: packSizes });
});

function addSettingItem(tableName, fieldName, value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error('Value is required.');
  }

  const insertSql = `INSERT INTO ${tableName} (${fieldName}) VALUES (?)`;
  const result = db.prepare(insertSql).run(normalized);
  return { id: result.lastInsertRowid, [fieldName]: normalized };
}

function updateSettingItem(tableName, fieldName, id, value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error('Value is required.');
  }

  db.prepare(`UPDATE ${tableName} SET ${fieldName} = ? WHERE id = ?`).run(normalized, id);
  return { id, [fieldName]: normalized };
}

function deleteSettingItem(tableName, id) {
  db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);
}

app.get('/api/settings/categories', requireAdminAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  res.json({ categories: rows });
});

app.post('/api/settings/categories', requireAdminAuth, (req, res) => {
  try {
    const item = addSettingItem('categories', 'name', req.body?.name);
    res.status(201).json({ success: true, item });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not add category.' });
  }
});

app.put('/api/settings/categories/:id', requireAdminAuth, (req, res) => {
  try {
    const item = updateSettingItem('categories', 'name', Number(req.params.id), req.body?.name);
    res.json({ success: true, item });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not update category.' });
  }
});

app.delete('/api/settings/categories/:id', requireAdminAuth, (req, res) => {
  deleteSettingItem('categories', Number(req.params.id));
  res.json({ success: true });
});

app.get('/api/settings/brands', requireAdminAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM brands ORDER BY name ASC').all();
  res.json({ brands: rows });
});

app.post('/api/settings/brands', requireAdminAuth, (req, res) => {
  try {
    const item = addSettingItem('brands', 'name', req.body?.name);
    res.status(201).json({ success: true, item });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not add brand.' });
  }
});

app.put('/api/settings/brands/:id', requireAdminAuth, (req, res) => {
  try {
    const item = updateSettingItem('brands', 'name', Number(req.params.id), req.body?.name);
    res.json({ success: true, item });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not update brand.' });
  }
});

app.delete('/api/settings/brands/:id', requireAdminAuth, (req, res) => {
  deleteSettingItem('brands', Number(req.params.id));
  res.json({ success: true });
});

app.get('/api/settings/pack-sizes', requireAdminAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM pack_sizes ORDER BY size ASC').all();
  res.json({ pack_sizes: rows });
});

app.post('/api/settings/pack-sizes', requireAdminAuth, (req, res) => {
  try {
    const item = addSettingItem('pack_sizes', 'size', req.body?.size);
    res.status(201).json({ success: true, item });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not add pack size.' });
  }
});

app.put('/api/settings/pack-sizes/:id', requireAdminAuth, (req, res) => {
  try {
    const item = updateSettingItem('pack_sizes', 'size', Number(req.params.id), req.body?.size);
    res.json({ success: true, item });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not update pack size.' });
  }
});

app.delete('/api/settings/pack-sizes/:id', requireAdminAuth, (req, res) => {
  deleteSettingItem('pack_sizes', Number(req.params.id));
  res.json({ success: true });
});

app.get('/api/products', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name,
      COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
      COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0) AS current_stock
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.deleted_at IS NULL
    ORDER BY p.created_at DESC
  `).all();

  res.json({ products: rows.map(serializeProduct) });
});

app.get('/api/products/:id', (req, res) => {
  const row = db.prepare(`
    SELECT p.*, c.name AS category_name,
      COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
      COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0) AS current_stock
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ? AND p.deleted_at IS NULL
  `).get(req.params.id);

  if (!row) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json({ product: serializeProduct(row) });
});

app.post('/api/orders', (req, res) => {
  const payload = req.body || {};
  const customerName = String(payload.customerName || payload.customer_name || '').trim();
  const email = String(payload.email || '').trim();
  const phone = String(payload.phone || '').trim();
  const deliveryAddress = String(payload.deliveryAddress || payload.delivery_address || '').trim();
  const city = String(payload.city || '').trim();
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!customerName) {
    return res.status(400).json({ error: 'Customer name is required.' });
  }
  if (!items.length) {
    return res.status(400).json({ error: 'At least one order item is required.' });
  }

  try {
    const normalizedItems = items.map((item) => ({
      product_id: Number(item.product_id ?? item.productId ?? 0),
      quantity: Number(item.quantity ?? item.qty ?? 0),
      unit_price: Number(item.unit_price ?? item.unitPrice ?? 0),
    }));

    const prepared = buildOrderRecordFromItemList(normalizedItems);
    const customer = getCustomerByContact(email || '', phone || '') || upsertCustomer({
      name: customerName,
      email,
      phone,
      city,
      address: deliveryAddress,
    });

    const orderNumber = generateOrderNumber();
    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO orders (order_number, customer_id, customer_name, email, phone, city, delivery_address, order_total, status, payment_status, delivery_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Unpaid', 'Pending')
      `).run(
        orderNumber,
        customer.id,
        customer.name,
        customer.email || email || '',
        customer.phone || phone || '',
        city || customer.city || '',
        deliveryAddress || customer.address || '',
        prepared.total.toFixed(2)
      );

      const orderId = Number(result.lastInsertRowid);
      for (const item of prepared.preparedItems) {
        db.prepare(`
          INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?)
        `).run(orderId, item.productId, item.qty, item.unitPrice.toFixed(2), item.lineTotal.toFixed(2));
      }

      const invoice = generateInvoiceForOrder(orderId, { customerId: customer.id, createdBy: 'customer' });
      return { orderId, orderNumber, total: prepared.total, invoiceNumber: invoice.invoice_number };
    })();

    res.status(201).json({
      success: true,
      order: {
        orderId: tx.orderId,
        orderNumber: tx.orderNumber,
        invoiceNumber: tx.invoiceNumber,
        total: Number(tx.total || 0),
        customer: customer,
      },
      message: 'Order placed successfully.'
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to submit order.' });
  }
});

app.post('/api/products', requireAdminAuth, (req, res) => {
  const payload = req.body || {};
  const required = ['sku', 'name', 'purchase_rate', 'sale_rate'];
  const missing = required.filter((field) => !payload[field] && payload[field] !== 0);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const sku = String(payload.sku).trim();
  const name = String(payload.name).trim();
  if (!sku || !name) {
    return res.status(400).json({ error: 'SKU and product name are required.' });
  }

  const categoryName = payload.category || 'Uncategorized';
  let categoryId = null;
  const existingCategory = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
  if (existingCategory) {
    categoryId = existingCategory.id;
  } else {
    const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(categoryName);
    categoryId = result.lastInsertRowid;
  }

  const purchaseRate = Number(payload.purchase_rate);
  const saleRate = Number(payload.sale_rate);
  const taxRate = Number(payload.tax_rate || 0);
  const result = db.prepare(`
    INSERT INTO products (
      sku, name, category_id, brand, description, pack_size, unit,
      purchase_rate, sale_rate, tax_rate, image_url, active, opening_stock, reorder_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sku,
    name,
    categoryId,
    payload.brand || '',
    payload.description || '',
    payload.pack_size || '',
    payload.unit || 'Unit',
    purchaseRate,
    saleRate,
    taxRate,
    payload.image_url || '',
    payload.active === false ? 0 : 1,
    Number(payload.opening_stock || 0),
    Number(payload.reorder_level || 0)
  );

  const productId = result.lastInsertRowid;
  const openingStock = Number(payload.opening_stock || 0);
  if (openingStock > 0) {
    db.prepare(`
      INSERT INTO inventory_transactions (product_id, transaction_type, reference_type, reference_id, quantity_in, unit_cost, notes)
      VALUES (?, 'Opening Stock', 'Product', ?, ?, ?, 'Initial stock')
    `).run(productId, productId, openingStock, purchaseRate || 0);
  }

  if (payload.image_url) {
    db.prepare('INSERT INTO product_images (product_id, image_url, is_main) VALUES (?, ?, 1)').run(productId, payload.image_url);
  }

  const row = db.prepare(`
    SELECT p.*, c.name AS category_name,
      COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
      COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0) AS current_stock
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(productId);

  res.status(201).json({ product: serializeProduct(row) });
});

app.put('/api/products/:id', requireAdminAuth, (req, res) => {
  const productId = Number(req.params.id);
  const payload = req.body || {};
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const previousOpeningStock = Number(product.opening_stock || 0);
  const nextOpeningStock = Number(payload.opening_stock ?? previousOpeningStock);
  const openingStockDelta = nextOpeningStock - previousOpeningStock;

  const categoryName = payload.category || 'Uncategorized';
  let categoryId = null;
  const existingCategory = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
  if (existingCategory) {
    categoryId = existingCategory.id;
  } else {
    const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(categoryName);
    categoryId = result.lastInsertRowid;
  }

  db.prepare(`
    UPDATE products
    SET sku = ?, name = ?, category_id = ?, brand = ?, description = ?,
        pack_size = ?, unit = ?, purchase_rate = ?, sale_rate = ?, tax_rate = ?,
        image_url = ?, active = ?, opening_stock = ?, reorder_level = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    String(payload.sku || '').trim(),
    String(payload.name || '').trim(),
    categoryId,
    payload.brand || '',
    payload.description || '',
    payload.pack_size || '',
    payload.unit || 'Unit',
    Number(payload.purchase_rate || 0),
    Number(payload.sale_rate || 0),
    Number(payload.tax_rate || 0),
    payload.image_url || '',
    payload.active === false ? 0 : 1,
    nextOpeningStock,
    Number(payload.reorder_level || 0),
    productId
  );

  if (openingStockDelta !== 0) {
    const quantityIn = openingStockDelta > 0 ? openingStockDelta : 0;
    const quantityOut = openingStockDelta < 0 ? Math.abs(openingStockDelta) : 0;
    db.prepare(`
      INSERT INTO inventory_transactions (product_id, transaction_type, reference_type, reference_id, quantity_in, quantity_out, unit_cost, notes)
      VALUES (?, 'Opening Stock Adjustment', 'Product', ?, ?, ?, ?, 'Opening stock updated from admin form')
    `).run(productId, productId, quantityIn, quantityOut, Number(payload.purchase_rate || 0), 'Opening stock updated from admin form');
  }

  const row = db.prepare(`
    SELECT p.*, c.name AS category_name,
      COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
      COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0) AS current_stock
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(productId);

  res.json({ product: serializeProduct(row) });
});

app.patch('/api/products/:id/status', requireAdminAuth, (req, res) => {
  const productId = Number(req.params.id);
  const active = req.body?.active === true || req.body?.active === 1 ? 1 : 0;
  db.prepare('UPDATE products SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(active, productId);
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  res.json({ success: true, product: row });
});

app.delete('/api/products/:id', requireAdminAuth, (req, res) => {
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  db.prepare('UPDATE products SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(productId);
  res.json({ success: true, message: 'Product deactivated successfully.' });
});

app.get('/api/inventory', requireAdminAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 25)));
  const search = String(req.query.search || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim();
  const status = String(req.query.status || '').trim();
  const brand = String(req.query.brand || '').trim();

  const baseWhere = [];
  const params = [];

  baseWhere.push('p.deleted_at IS NULL');
  if (search) {
    baseWhere.push('(LOWER(COALESCE(p.name, "")) LIKE ? OR LOWER(COALESCE(p.sku, "")) LIKE ? OR LOWER(COALESCE(p.brand, "")) LIKE ? OR LOWER(COALESCE(c.name, "")) LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  if (category) {
    baseWhere.push('LOWER(COALESCE(c.name, "")) = ?');
    params.push(category.toLowerCase());
  }
  if (brand) {
    baseWhere.push('LOWER(COALESCE(p.brand, "")) = ?');
    params.push(brand.toLowerCase());
  }

  const where = baseWhere.length ? `WHERE ${baseWhere.join(' AND ')}` : '';
  const countRow = db.prepare(`
    SELECT COUNT(*) AS total FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ${where}
  `).get(...params);

  const stockQuery = `
    SELECT p.id, p.name, p.sku, p.pack_size, p.purchase_rate, p.sale_rate, p.tax_rate, p.brand,
      COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
      COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0) AS current_stock,
      p.reorder_level, c.name AS category_name, p.unit, p.description, p.active,
      CASE
        WHEN (COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
          COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0)) <= 0 THEN 'Out of Stock'
        WHEN (COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
          COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0)) <= p.reorder_level THEN 'Low Stock'
        ELSE 'In Stock'
      END AS stock_status
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ${where}
  `;

  const filteredRows = db.prepare(stockQuery).all(...params);
  const finalRows = status ? filteredRows.filter((row) => row.stock_status === status) : filteredRows;

  const total = finalRows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const rows = finalRows.slice(offset, offset + limit);

  const inventory = rows.map((row) => ({
    ...row,
    stock_value: Number(row.current_stock || 0) * Number(row.purchase_rate || 0),
    available_stock: Number(row.current_stock || 0),
    reserved_stock: 0,
    status: row.stock_status || 'In Stock',
  }));

  res.json({ inventory, page: safePage, limit, total, totalPages, filters: { search, category, brand, status } });
});

app.get('/api/inventory/summary', requireAdminAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.sku, p.reorder_level, p.purchase_rate,
      COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
      COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0) AS current_stock
    FROM products p
    WHERE p.deleted_at IS NULL
  `).all();

  const totalItems = rows.length;
  const totalStockQuantity = rows.reduce((sum, row) => sum + Number(row.current_stock || 0), 0);
  const totalInventoryValue = rows.reduce((sum, row) => sum + (Number(row.current_stock || 0) * Number(row.purchase_rate || 0)), 0);
  const lowStockItems = rows.filter((row) => Number(row.current_stock || 0) <= Number(row.reorder_level || 0)).length;
  const outOfStockItems = rows.filter((row) => Number(row.current_stock || 0) <= 0).length;

  res.json({
    total_items: totalItems,
    total_stock_quantity: totalStockQuantity,
    total_inventory_value: totalInventoryValue,
    low_stock_items: lowStockItems,
    out_of_stock_items: outOfStockItems,
  });
});

app.get('/api/inventory/adjustments', requireAdminAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 25)));
  const startDate = String(req.query.start_date || '').trim();
  const endDate = String(req.query.end_date || '').trim();
  const type = String(req.query.type || '').trim();
  const productId = Number(req.query.product_id || 0);
  const search = String(req.query.search || '').trim();

  const params = [];
  const conditions = ["(it.reference_type = 'Adjustment' OR it.transaction_type IN ('Stock In', 'Stock Out', 'Stock Increase', 'Stock Decrease', 'Stock Correction', 'Physical Stock Count'))"];

  if (startDate) {
    conditions.push('date(it.created_at) >= date(?)');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('date(it.created_at) <= date(?)');
    params.push(endDate);
  }
  if (type) {
    conditions.push('it.transaction_type = ?');
    params.push(type);
  }
  if (productId) {
    conditions.push('it.product_id = ?');
    params.push(productId);
  }
  if (search) {
    conditions.push('(LOWER(COALESCE(p.name, "")) LIKE ? OR LOWER(COALESCE(p.sku, "")) LIKE ?)');
    const q = `%${search.toLowerCase()}%`;
    params.push(q, q);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM inventory_transactions it
    LEFT JOIN products p ON p.id = it.product_id
    ${where}
  `).get(...params).total;

  const rows = db.prepare(`
    SELECT it.id, it.product_id, it.transaction_type, it.quantity_in, it.quantity_out, it.unit_cost,
      it.created_at, it.updated_at, it.notes, it.created_by, it.previous_quantity, it.new_quantity,
      p.name AS product_name, p.sku,
      (
        COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id AND id < it.id), 0) -
        COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id AND id < it.id), 0)
      ) AS previous_stock,
      (
        COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id AND id <= it.id), 0) -
        COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id AND id <= it.id), 0)
      ) AS resulting_stock
    FROM inventory_transactions it
    LEFT JOIN products p ON p.id = it.product_id
    ${where}
    ORDER BY it.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit);

  const adjustments = rows.map((row) => ({
    id: row.id,
    adjustment_number: `ADJ-${String(row.id).padStart(5, '0')}`,
    product_id: row.product_id,
    product_name: row.product_name,
    sku: row.sku,
    transaction_type: row.transaction_type,
    adjustment_type: row.transaction_type,
    quantity: Number(row.quantity_in || row.quantity_out || 0),
    unit_cost: Number(row.unit_cost || 0),
    previous_stock: Number(row.previous_stock || row.previous_quantity || 0),
    resulting_stock: Number(row.resulting_stock || row.new_quantity || 0),
    notes: row.notes || '—',
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by || 'Admin',
    status: 'Applied',
  }));

  res.json({ adjustments, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

app.get('/api/inventory/adjustments/:id', requireAdminAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`
    SELECT it.*, p.name AS product_name, p.sku, p.brand, p.purchase_rate,
      (
        COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id AND id < it.id), 0) -
        COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id AND id < it.id), 0)
      ) AS previous_stock,
      (
        COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id AND id <= it.id), 0) -
        COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id AND id <= it.id), 0)
      ) AS resulting_stock
    FROM inventory_transactions it
    LEFT JOIN products p ON p.id = it.product_id
    WHERE it.id = ?
  `).get(id);

  if (!row) {
    return res.status(404).json({ error: 'Adjustment not found.' });
  }

  const currentStock = Number((row.quantity_in || 0) - (row.quantity_out || 0));
  const previousStock = Number(row.previous_stock || row.previous_quantity || 0);
  const resultingStock = Number(row.resulting_stock || row.new_quantity || previousStock + currentStock || 0);

  res.json({
    adjustment: {
      id: row.id,
      adjustment_number: `ADJ-${String(row.id).padStart(5, '0')}`,
      product_name: row.product_name,
      sku: row.sku,
      brand: row.brand,
      type: row.transaction_type,
      quantity: Number(row.quantity_in || row.quantity_out || 0),
      previous_stock: previousStock,
      resulting_stock: resultingStock,
      unit_cost: Number(row.unit_cost || 0),
      notes: row.notes || '—',
      created_by: row.created_by || 'Admin',
      updated_by: row.updated_by || row.created_by || 'Admin',
      created_at: row.created_at,
      updated_at: row.updated_at || row.created_at,
      transaction_id: row.id,
      reference_type: row.reference_type || 'Adjustment',
      reference_id: row.reference_id || null,
      product_id: row.product_id,
      unit_price: Number(row.unit_cost || row.purchase_rate || 0),
    }
  });
});

app.get('/api/item-batch-ledger', requireAdminAuth, (req, res) => {
  const productId = Number(req.query.product_id || 0);
  const search = String(req.query.search || '').trim();
  const params = [];
  const conditions = [];

  if (productId) {
    conditions.push('pb.product_id = ?');
    params.push(productId);
  }

  if (search) {
    conditions.push('(LOWER(COALESCE(pb.batch_number, "")) LIKE ? OR LOWER(COALESCE(p.name, "")) LIKE ?)');
    const q = `%${search.toLowerCase()}%`;
    params.push(q, q);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT pb.id, pb.product_id, p.name AS product_name, pb.batch_number, pb.expiry_date,
      pb.initial_quantity, pb.available_quantity, pb.purchase_cost,
      COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE batch_id = pb.id), 0) AS total_in,
      COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE batch_id = pb.id), 0) AS total_out
    FROM product_batches pb
    LEFT JOIN products p ON p.id = pb.product_id
    ${where}
    ORDER BY pb.expiry_date IS NULL, pb.expiry_date ASC, pb.created_at DESC
  `).all(...params);

  res.json({
    ledger: rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      product_name: row.product_name,
      batch_number: row.batch_number,
      expiry_date: row.expiry_date,
      initial_quantity: Number(row.initial_quantity || 0),
      available_quantity: Number(row.available_quantity || 0),
      total_in: Number(row.total_in || 0),
      total_out: Number(row.total_out || 0),
      purchase_cost: Number(row.purchase_cost || 0),
    }))
  });
});

app.get('/api/inventory/opening-stock/batches', requireAdminAuth, (req, res) => {
  const productId = Number(req.query.product_id || 0);
  if (!productId) {
    return res.json({ batches: [] });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').get(productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const rows = db.prepare(`
    SELECT *
    FROM product_batches
    WHERE product_id = ?
    ORDER BY expiry_date IS NULL, expiry_date ASC, created_at DESC
  `).all(productId);

  res.json({
    batches: rows.map((row) => ({
      ...row,
      expiry_date: row.expiry_date ? formatExpiryDateForDisplay(row.expiry_date) : '',
      available_quantity: Number(row.available_quantity || 0),
      initial_quantity: Number(row.initial_quantity || 0),
      purchase_cost: Number(row.purchase_cost || 0),
    }))
  });
});

app.post('/api/inventory/opening-stock', requireAdminAuth, (req, res) => {
  const payload = req.body || {};
  const productId = Number(payload.product_id || 0);
  const batchId = Number(payload.batch_id || 0);
  const quantity = Number(payload.quantity || 0);
  const unitCost = Number(payload.unit_cost || 0);
  const notes = String(payload.notes || '').trim();

  if (!productId || !batchId) {
    return res.status(400).json({ error: 'Please select a product and a valid saved batch for the opening stock entry.' });
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'A valid quantity is required for opening stock.' });
  }

  if (!Number.isFinite(unitCost) || unitCost < 0) {
    return res.status(400).json({ error: 'A valid unit cost is required for opening stock.' });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').get(productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  if (Number(product.opening_stock_finalized || 0) === 1 || product.opening_stock_locked_at) {
    return res.status(409).json({ error: 'Opening stock for this product is already finalized and locked. Please use the Purchase module for any additional stock.' });
  }

  const batch = db.prepare('SELECT * FROM product_batches WHERE id = ? AND product_id = ?').get(batchId, productId);
  if (!batch) {
    return res.status(404).json({ error: 'Selected batch does not belong to this product. Please choose a saved batch or use the Purchase module.' });
  }

  try {
    const result = db.transaction(() => {
      const openingEntryResult = db.prepare(`
        INSERT INTO opening_stock_entries (product_id, batch_id, quantity, unit_cost, status, finalized_at, locked_at, created_by, notes)
        VALUES (?, ?, ?, ?, 'Finalized', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
      `).run(productId, batchId, quantity, unitCost.toFixed(2), req.session?.username || 'admin', notes || `Opening stock for ${product.name}`);

      const nextOpeningStock = Number(product.opening_stock || 0) + quantity;
      db.prepare(`
        UPDATE products
        SET opening_stock = ?, opening_stock_finalized = 1, opening_stock_locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextOpeningStock, productId);

      db.prepare(`
        UPDATE product_batches
        SET initial_quantity = COALESCE(initial_quantity, 0) + ?,
            available_quantity = COALESCE(available_quantity, 0) + ?,
            purchase_cost = CASE WHEN purchase_cost IS NULL OR purchase_cost = 0 THEN ? ELSE purchase_cost END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(quantity, quantity, unitCost.toFixed(2), batchId);

      db.prepare(`
        INSERT INTO inventory_transactions (product_id, batch_id, transaction_type, reference_type, reference_id, quantity_in, quantity_out, unit_cost, notes, created_by)
        VALUES (?, ?, 'Opening Stock', 'OpeningStock', ?, ?, 0, ?, ?, ?)
      `).run(productId, batchId, openingEntryResult.lastInsertRowid, quantity, unitCost.toFixed(2), notes || `Opening stock for ${product.name}`, req.session?.username || 'admin');

      db.prepare(`
        INSERT INTO stock_movement_ledger (product_id, batch_id, transaction_type, reference_type, reference_id, quantity, unit_cost, amount, notes, created_by)
        VALUES (?, ?, 'OPENING_STOCK', 'OpeningStock', ?, ?, ?, ?, ?, ?)
      `).run(productId, batchId, openingEntryResult.lastInsertRowid, quantity, unitCost.toFixed(2), (quantity * unitCost).toFixed(2), notes || `Opening stock for ${product.name}`, req.session?.username || 'admin');

      db.prepare(`
        INSERT INTO item_batch_ledger (product_id, batch_id, transaction_type, quantity, unit_cost, notes, created_by)
        VALUES (?, ?, 'OPENING_STOCK', ?, ?, ?, ?)
      `).run(productId, batchId, quantity, unitCost.toFixed(2), notes || `Opening stock for ${product.name}`, req.session?.username || 'admin');

      return {
        entry_id: openingEntryResult.lastInsertRowid,
        product_id: productId,
        batch_id: batchId,
        quantity,
        unit_cost: unitCost,
        opening_stock: nextOpeningStock,
      };
    })();

    res.status(201).json({ success: true, message: 'Opening stock finalized successfully.', opening_stock: result });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to finalize opening stock entry.' });
  }
});

app.get('/api/inventory/opening-stock/entries', requireAdminAuth, (req, res) => {
  const search = String(req.query.search || '').trim();
  const productId = Number(req.query.product_id || 0);

  const conditions = ['ose.status = ?'];
  const params = ['Finalized'];

  if (productId) {
    conditions.push('ose.product_id = ?');
    params.push(productId);
  }

  if (search) {
    conditions.push('(LOWER(COALESCE(p.name, "")) LIKE ? OR LOWER(COALESCE(p.sku, "")) LIKE ? OR LOWER(COALESCE(pb.batch_number, "")) LIKE ?)');
    const q = `%${search.toLowerCase()}%`;
    params.push(q, q, q);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT ose.id, ose.product_id, ose.batch_id, ose.quantity, ose.unit_cost, ose.finalized_at, ose.locked_at, ose.created_by, ose.notes,
           p.name AS product_name,
           p.sku,
           pb.batch_number,
           pb.expiry_date,
           pb.available_quantity,
           pb.purchase_cost
    FROM opening_stock_entries ose
    LEFT JOIN products p ON p.id = ose.product_id
    LEFT JOIN product_batches pb ON pb.id = ose.batch_id
    ${whereClause}
    ORDER BY ose.finalized_at DESC, ose.id DESC
  `).all(...params);

  res.json({
    entries: rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      batch_id: row.batch_id,
      product_name: row.product_name || '—',
      sku: row.sku || '—',
      batch_number: row.batch_number || '—',
      expiry_date: row.expiry_date || '—',
      quantity: Number(row.quantity || 0),
      unit_cost: Number(row.unit_cost || 0),
      finalized_at: row.finalized_at || null,
      locked_at: row.locked_at || null,
      created_by: row.created_by || 'Admin',
      notes: row.notes || '—',
      available_quantity: Number(row.available_quantity || 0),
      purchase_cost: Number(row.purchase_cost || 0),
    }))
  });
});

app.get('/api/inventory/ledger', requireAdminAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 25)));
  const startDate = String(req.query.start_date || '').trim();
  const endDate = String(req.query.end_date || '').trim();
  const transactionType = String(req.query.transaction_type || '').trim();
  const productId = Number(req.query.product_id || 0);
  const search = String(req.query.search || '').trim();

  const params = [];
  const conditions = ['p.deleted_at IS NULL'];

  if (startDate) {
    conditions.push('date(it.created_at) >= date(?)');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('date(it.created_at) <= date(?)');
    params.push(endDate);
  }
  if (transactionType) {
    conditions.push('it.transaction_type = ?');
    params.push(transactionType);
  }
  if (productId) {
    conditions.push('it.product_id = ?');
    params.push(productId);
  }
  if (search) {
    conditions.push('(LOWER(COALESCE(p.name, "")) LIKE ? OR LOWER(COALESCE(p.sku, "")) LIKE ?)');
    const q = `%${search.toLowerCase()}%`;
    params.push(q, q);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM inventory_transactions it
    LEFT JOIN products p ON p.id = it.product_id
    ${where}
  `).get(...params).total;

  const rows = db.prepare(`
    SELECT it.id, it.created_at AS transaction_date, it.transaction_type, it.reference_type, it.reference_id,
      p.id AS product_id, p.name AS product_name, p.sku, it.quantity_in, it.quantity_out, it.unit_cost,
      it.notes, it.created_by,
      (
        COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id AND id <= it.id), 0) -
        COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id AND id <= it.id), 0)
      ) AS balance_after_transaction
    FROM inventory_transactions it
    LEFT JOIN products p ON p.id = it.product_id
    ${where}
    ORDER BY it.created_at DESC, it.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit);

  const ledger = rows.map((row) => ({
    id: row.id,
    transaction_date: row.transaction_date,
    transaction_type: row.transaction_type,
    reference_type: row.reference_type || 'Manual',
    transaction_number: `${row.reference_type || row.transaction_type}-${row.reference_id || row.id}`,
    product_id: row.product_id,
    product_name: row.product_name,
    sku: row.sku,
    quantity_in: Number(row.quantity_in || 0),
    quantity_out: Number(row.quantity_out || 0),
    balance_after_transaction: Number(row.balance_after_transaction || 0),
    unit_cost: Number(row.unit_cost || 0),
    transaction_value: Number(row.unit_cost || 0) * (Number(row.quantity_in || 0) + Number(row.quantity_out || 0)),
    notes: row.notes || '—',
    created_by: row.created_by || 'Admin',
  }));

  res.json({ ledger, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

app.get('/api/inventory/low-stock', requireAdminAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 25)));
  const search = String(req.query.search || '').trim();
  const category = String(req.query.category || '').trim();
  const status = String(req.query.status || '').trim();

  const params = [];
  const conditions = ['p.deleted_at IS NULL'];

  if (search) {
    conditions.push('(LOWER(COALESCE(p.name, "")) LIKE ? OR LOWER(COALESCE(p.sku, "")) LIKE ? OR LOWER(COALESCE(p.brand, "")) LIKE ?)');
    const q = `%${search.toLowerCase()}%`;
    params.push(q, q, q);
  }
  if (category) {
    conditions.push('LOWER(COALESCE(c.name, "")) = ?');
    params.push(category.toLowerCase());
  }

  const baseQuery = `
    SELECT p.id, p.name, p.sku, p.brand, p.reorder_level, c.name AS category_name,
      COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
      COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0) AS current_stock,
      (
        SELECT MAX(date(si.invoice_date))
        FROM sale_invoice_items sii
        INNER JOIN sale_invoices si ON si.id = sii.invoice_id
        WHERE sii.product_id = p.id
      ) AS last_sale_date
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${conditions.join(' AND ')}
  `;

  const allRows = db.prepare(`${baseQuery} AND (
      (COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
       COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0)) <= p.reorder_level
      OR
      (COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
       COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0)) <= 0
    )
    ORDER BY current_stock ASC
  `).all(...params);

  const filteredRows = status ? allRows.filter((row) => {
    const current = Number(row.current_stock || 0);
    const reorder = Number(row.reorder_level || 0);
    if (status === 'Low Stock') return current <= reorder && current > 0;
    if (status === 'Out of Stock') return current <= 0;
    if (status === 'In Stock') return current > reorder;
    return true;
  }) : allRows;

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const rows = filteredRows.slice(offset, offset + limit);

  res.json({ low_stock: rows, total, page: safePage, limit, totalPages });
});

app.get('/api/inventory/dead-stock', requireAdminAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 25)));
  const search = String(req.query.search || '').trim();
  const startDate = String(req.query.start_date || '').trim();
  const endDate = String(req.query.end_date || '').trim();
  const days = Math.max(1, Number(req.query.days || 30));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const fallbackStart = startDate || cutoffDate.toISOString().slice(0, 10);
  const fallbackEnd = endDate || new Date().toISOString().slice(0, 10);

  const params = [];
  const conditions = ['p.deleted_at IS NULL'];

  if (search) {
    conditions.push('(LOWER(COALESCE(p.name, "")) LIKE ? OR LOWER(COALESCE(p.sku, "")) LIKE ? OR LOWER(COALESCE(p.brand, "")) LIKE ?)');
    const q = `%${search.toLowerCase()}%`;
    params.push(q, q, q);
  }

  const hasCustomRange = Boolean(startDate && endDate);
  if (hasCustomRange) {
    conditions.push('((SELECT MAX(date(si.invoice_date)) FROM sale_invoice_items sii INNER JOIN sale_invoices si ON si.id = sii.invoice_id WHERE sii.product_id = p.id) IS NULL OR (SELECT MAX(date(si.invoice_date)) FROM sale_invoice_items sii INNER JOIN sale_invoices si ON si.id = sii.invoice_id WHERE sii.product_id = p.id) BETWEEN date(?) AND date(?))');
    params.push(startDate, endDate);
  } else {
    conditions.push('((SELECT MAX(date(si.invoice_date)) FROM sale_invoice_items sii INNER JOIN sale_invoices si ON si.id = sii.invoice_id WHERE sii.product_id = p.id) IS NULL OR (SELECT MAX(date(si.invoice_date)) FROM sale_invoice_items sii INNER JOIN sale_invoices si ON si.id = sii.invoice_id WHERE sii.product_id = p.id) <= date(?))');
    params.push(fallbackStart);
  }

  const rows = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.sku,
      p.brand,
      p.reorder_level,
      COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
      COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0) AS current_stock,
      (
        SELECT MAX(date(si.invoice_date))
        FROM sale_invoice_items sii
        INNER JOIN sale_invoices si ON si.id = sii.invoice_id
        WHERE sii.product_id = p.id
      ) AS last_sale_date
    FROM products p
    WHERE ${conditions.join(' AND ')}
    ORDER BY last_sale_date ASC, p.name ASC
  `).all(...params);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const pagedRows = rows.slice(offset, offset + limit);

  res.json({ dead_stock: pagedRows, total, page: safePage, limit, totalPages, filters: { search, startDate, endDate, days } });
});

app.get('/api/inventory/transactions', requireAdminAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT it.*, p.name AS product_name, p.sku
    FROM inventory_transactions it
    LEFT JOIN products p ON p.id = it.product_id
    WHERE p.deleted_at IS NULL
    ORDER BY it.created_at DESC
    LIMIT 100
  `).all();

  res.json({ transactions: rows });
});

app.post('/api/inventory/adjust', requireAdminAuth, (req, res) => {
  const payload = req.body || {};
  const productId = Number(payload.product_id);
  const movement = String(payload.movement || payload.adjustment_type || 'Stock Adjustment').trim();
  const quantity = Number(payload.quantity || 0);
  const unitCost = Number(payload.unit_cost || 0);
  const reason = String(payload.reason || payload.notes || 'Manual stock adjustment').trim();

  if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'A valid product and a positive quantity are required.' });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').get(productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const currentStock = getProductStock(productId);
  const normalizedMovement = movement === 'Stock Out' || movement === 'Stock Decrease' || movement === 'Stock Correction - Decrease' ? 'Stock Out' : 'Stock In';
  const quantityIn = normalizedMovement === 'Stock In' ? quantity : 0;
  const quantityOut = normalizedMovement === 'Stock Out' ? quantity : 0;

  if (normalizedMovement === 'Stock Out' && quantity > currentStock) {
    return res.status(400).json({ error: `Cannot stock out ${quantity} units. Available stock: ${currentStock}.` });
  }

  const result = db.prepare(`
    INSERT INTO inventory_transactions (product_id, transaction_type, reference_type, reference_id, quantity_in, quantity_out, unit_cost, notes)
    VALUES (?, ?, 'Adjustment', NULL, ?, ?, ?, ?)
  `).run(productId, movement || normalizedMovement, quantityIn, quantityOut, unitCost || product.purchase_rate || 0, reason || `${movement || normalizedMovement} adjustment`);

  res.status(201).json({ success: true, transactionId: result.lastInsertRowid, productId, movement: movement || normalizedMovement, quantity, reason });
});

app.get('/api/orders', requireAdminAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, i.invoice_number, i.payment_status AS invoice_payment_status,
           i.delivery_status AS invoice_delivery_status,
           i.total AS invoice_total
    FROM orders o
    LEFT JOIN sale_invoices i ON i.order_id = o.id
    ORDER BY o.created_at DESC
  `).all();

  res.json({ orders: rows });
});

app.get('/api/orders/confirmed', requireAdminAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, i.invoice_number, i.payment_status AS invoice_payment_status, i.total AS invoice_total
    FROM orders o
    LEFT JOIN sale_invoices i ON i.order_id = o.id
    WHERE o.status = 'Confirmed'
    ORDER BY o.confirmed_at DESC, o.created_at DESC
  `).all();

  res.json({ orders: rows });
});

app.post('/api/orders/:id/confirm', requireAdminAuth, (req, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  if (String(order.status).toLowerCase() === 'confirmed') {
    return res.status(400).json({ error: 'This order is already confirmed.' });
  }

  const customer = getCustomerByContact(order.email || '', order.phone || '') || upsertCustomer({
    name: order.customer_name || 'Walk-in Customer',
    email: order.email || '',
    phone: order.phone || '',
    city: order.city || '',
    address: order.delivery_address || ''
  });

  reconcileOrderTotalsFromSaleRates(orderId);

  db.prepare(`
    UPDATE orders
    SET customer_id = ?,
        customer_name = ?,
        email = ?,
        phone = ?,
        city = ?,
        delivery_address = ?,
        status = 'Confirmed',
        confirmed_at = CURRENT_TIMESTAMP,
        confirmed_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(customer.id, customer.name, customer.email || order.email || '', customer.phone || order.phone || '', customer.city || order.city || '', customer.address || order.delivery_address || '', req.session?.username || 'admin', orderId);

  const invoice = generateInvoiceForOrder(orderId, { customerId: customer.id, createdBy: req.session?.username || 'admin' });
  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  res.json({ success: true, order: updatedOrder, invoice });
});

app.get('/api/customers', requireAdminAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, 
           COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id), 0) AS total_orders,
           COALESCE((SELECT COUNT(*) FROM sale_invoices i WHERE i.customer_id = c.id), 0) AS total_invoices,
           COALESCE((SELECT SUM(i.total) FROM sale_invoices i WHERE i.customer_id = c.id), 0) AS total_sales,
           COALESCE((SELECT SUM(sr.return_amount) FROM sale_returns sr WHERE sr.customer_id = c.id), 0) AS total_returns
    FROM customers c
    ORDER BY c.created_at DESC
  `).all();
  res.json({ customers: rows });
});

app.post('/api/customers', requireAdminAuth, (req, res) => {
  try {
    const customer = upsertCustomer(req.body || {});
    res.status(201).json({ success: true, customer });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not save customer.' });
  }
});

app.get('/api/orders/:id/items', requireAdminAuth, (req, res) => {
  const orderId = Number(req.params.id);
  const rows = db.prepare(`
    SELECT oi.*, p.name AS product_name, p.sku
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
    ORDER BY oi.id ASC
  `).all(orderId);

  res.json({ items: rows });
});

app.get('/api/orders/:id/invoice', requireAdminAuth, (req, res) => {
  const orderId = Number(req.params.id);
  const invoice = db.prepare(`
    SELECT i.*, o.order_number, o.customer_name, o.delivery_address, o.phone, o.email
    FROM sale_invoices i
    LEFT JOIN orders o ON o.id = i.order_id
    WHERE i.order_id = ?
  `).get(orderId);

  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  const items = db.prepare(`
    SELECT sii.*, p.name AS product_name, p.sku
    FROM sale_invoice_items sii
    LEFT JOIN products p ON p.id = sii.product_id
    WHERE sii.invoice_id = ?
  `).all(invoice.id);

  const ledger = db.prepare(`
    SELECT * FROM payment_ledger
    WHERE order_id = ?
    ORDER BY entry_date DESC, id DESC
  `).all(orderId);

  res.json({ invoice, items, ledger });
});

app.get('/api/orders/:id/payments', requireAdminAuth, (req, res) => {
  const orderId = Number(req.params.id);
  const rows = db.prepare(`
    SELECT * FROM payment_ledger
    WHERE order_id = ?
    ORDER BY entry_date DESC, id DESC
  `).all(orderId);
  res.json({ payments: rows });
});

app.get('/api/orders/:id/invoice/pdf', requireAdminAuth, (req, res) => {
  const orderId = Number(req.params.id);
  const invoice = db.prepare(`
    SELECT i.*, o.order_number, o.customer_name, o.delivery_address, o.phone, o.email
    FROM sale_invoices i
    LEFT JOIN orders o ON o.id = i.order_id
    WHERE i.order_id = ?
  `).get(orderId);

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const items = db.prepare(`
    SELECT sii.*, p.name AS product_name, p.sku
    FROM sale_invoice_items sii
    LEFT JOIN products p ON p.id = sii.product_id
    WHERE sii.invoice_id = ?
  `).all(invoice.id);

  const pdfBuffer = buildInvoicePdfBuffer(invoice, db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId), items);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number || 'invoice'}.pdf"`);
  res.send(pdfBuffer);
});

app.post('/api/orders/:id/payment', requireAdminAuth, (req, res) => {
  const orderId = Number(req.params.id);
  const payload = req.body || {};
  const amount = Number(payload.amount || 0);
  const paymentMethod = String(payload.payment_method || 'Cash').trim() || 'Cash';
  const paymentReference = String(payload.reference || '').trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'A valid payment amount is required.' });
  }

  const invoice = db.prepare('SELECT * FROM sale_invoices WHERE order_id = ?').get(orderId);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found for this order.' });
  }

  const currentPaid = Number(invoice.paid_amount || 0);
  const nextPaid = currentPaid + amount;
  const paymentStatus = determinePaymentStatus(invoice.total || 0, nextPaid);

  db.prepare(`
    UPDATE sale_invoices
    SET payment_status = ?,
        payment_method = ?,
        paid_amount = ?,
        payment_reference = ?,
        captured_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(paymentStatus, paymentMethod, nextPaid.toFixed(2), paymentReference || null, invoice.id);

  insertPaymentLedgerEntry({
    orderId,
    invoiceId: invoice.id,
    customerId: Number(invoice.customer_id || 0),
    paymentReference: paymentReference || `PAY-${Date.now()}`,
    paymentMethod,
    amount,
    entryType: 'Payment',
    entryDate: new Date().toISOString(),
    description: `Payment captured via ${paymentMethod}`,
    status: 'Captured'
  });

  db.prepare('UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(paymentStatus, orderId);

  const updatedInvoice = db.prepare('SELECT * FROM sale_invoices WHERE id = ?').get(invoice.id);
  res.json({ success: true, invoice: updatedInvoice, payment_status: paymentStatus });
});

app.get('/api/invoice/public', (req, res) => {
  const orderNumber = String(req.query.order_number || '').trim();
  const email = String(req.query.email || '').trim();

  if (!orderNumber || !email) {
    return res.status(400).json({ error: 'Order number and email are required.' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE order_number = ? AND email = ?').get(orderNumber, email);
  if (!order) {
    return res.status(404).json({ error: 'Invoice not found for this customer.' });
  }

  const invoice = db.prepare('SELECT * FROM sale_invoices WHERE order_id = ?').get(order.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found for this order.' });
  }

  const items = db.prepare(`
    SELECT sii.*, p.name AS product_name, p.sku
    FROM sale_invoice_items sii
    LEFT JOIN products p ON p.id = sii.product_id
    WHERE sii.invoice_id = ?
  `).all(invoice.id);

  const ledger = db.prepare(`
    SELECT * FROM payment_ledger
    WHERE order_id = ?
    ORDER BY entry_date DESC, id DESC
  `).all(order.id);

  res.json({ invoice, order, items, ledger });
});

app.get('/api/public/order-status', (req, res) => {
  const orderNumber = String(req.query.order_number || '').trim();
  const email = String(req.query.email || '').trim();

  if (!orderNumber || !email) {
    return res.status(400).json({ error: 'Order number and email are required.' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE order_number = ? AND email = ?').get(orderNumber, email);
  if (!order) {
    return res.status(404).json({ error: 'Order not found for this customer.' });
  }

  const invoice = db.prepare('SELECT * FROM sale_invoices WHERE order_id = ?').get(order.id) || generateInvoiceForOrder(order.id, { customerId: order.customer_id || null, createdBy: 'customer' });
  const items = db.prepare(`
    SELECT oi.*, p.name AS product_name, p.sku
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
    ORDER BY oi.id ASC
  `).all(order.id);

  const ledger = db.prepare(`
    SELECT * FROM payment_ledger
    WHERE order_id = ?
    ORDER BY entry_date DESC, id DESC
  `).all(order.id);

  res.json({
    order,
    invoice,
    items,
    ledger,
    status: {
      order_status: order.status || 'Pending',
      payment_status: invoice.payment_status || order.payment_status || 'Unpaid',
      delivery_status: invoice.delivery_status || order.delivery_status || 'Pending',
    }
  });
});

app.get('/api/public/track-order', applyTrackRateLimit, (req, res) => {
  const invoiceNumber = normalizeInvoiceNumber(req.query.invoiceNumber || req.query.invoice_number || '');
  const customerName = normalizeCustomerName(req.query.customerName || req.query.customer_name || '');

  if (!invoiceNumber || !customerName) {
    return res.status(400).json({
      error: 'We couldn\'t verify this order. Please check your invoice number and customer name and try again.'
    });
  }

  const normalizedName = customerName.toLowerCase();
  const order = db.prepare(`
    SELECT o.*, i.invoice_number, i.subtotal, i.discount, i.tax, i.total, i.paid_amount, i.payment_status AS invoice_payment_status,
           i.delivery_status AS invoice_delivery_status, i.expected_arrival_date, i.dispatch_number, i.dispatch_date,
           c.name AS customer_name_master
    FROM sale_invoices i
    LEFT JOIN orders o ON o.id = i.order_id
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE LOWER(TRIM(i.invoice_number)) = LOWER(TRIM(?))
      AND (
        LOWER(TRIM(COALESCE(c.name, o.customer_name, ''))) = LOWER(TRIM(?))
        OR LOWER(TRIM(COALESCE(o.customer_name, c.name, ''))) = LOWER(TRIM(?))
      )
    LIMIT 1
  `).get(invoiceNumber, normalizedName, normalizedName);

  if (!order) {
    return res.status(404).json({
      error: 'We couldn\'t verify this order. Please check your invoice number and customer name and try again.'
    });
  }

  const invoice = db.prepare('SELECT * FROM sale_invoices WHERE order_id = ?').get(order.id) || generateInvoiceForOrder(order.id, { customerId: order.customer_id || null, createdBy: 'customer' });
  const items = db.prepare(`
    SELECT oi.*, p.name AS product_name, p.brand AS product_brand, p.description AS product_description, p.image_url
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
    ORDER BY oi.id ASC
  `).all(order.id);

  const ledger = db.prepare(`
    SELECT * FROM payment_ledger
    WHERE order_id = ?
    ORDER BY entry_date DESC, id DESC
  `).all(order.id);

  const status = {
    order_status: order.status || 'Pending',
    payment_status: invoice.payment_status || order.payment_status || 'Unpaid',
    delivery_status: invoice.delivery_status || order.delivery_status || 'Pending',
  };

  res.json({
    success: true,
    order,
    invoice,
    items,
    ledger,
    status,
    customer_name: order.customer_name || order.customer_name_master || 'Customer'
  });
});

app.post('/api/public/payment-session', (req, res) => {
  const payload = req.body || {};
  const orderId = Number(payload.order_id || 0);
  const orderNumber = String(payload.order_number || '').trim();
  const email = String(payload.email || '').trim();
  const amount = Number(payload.amount || 0);
  const paymentMethod = String(payload.payment_method || payload.method || 'card').trim();

  if (!orderNumber && !orderId) {
    return res.status(400).json({ error: 'Order reference is required to create a payment session.' });
  }

  if (!email) {
    return res.status(400).json({ error: 'Customer email is required.' });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'A valid cart total is required.' });
  }

  try {
    const session = createPublicPaymentSession({
      orderId,
      orderNumber,
      email,
      amount,
      paymentMethod,
    });
    res.json({ success: true, payment: session });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not create payment session.' });
  }
});

app.post('/api/public/orders/:id/payments', (req, res) => {
  const orderId = Number(req.params.id);
  const payload = req.body || {};
  const orderNumber = String(payload.order_number || '').trim();
  const email = String(payload.email || '').trim();
  const amount = Number(payload.amount || 0);
  const paymentMethod = String(payload.payment_method || payload.method || 'Card').trim() || 'Card';
  const paymentReference = String(payload.reference || payload.payment_reference || '').trim();

  if (!orderId || !orderNumber || !email) {
    return res.status(400).json({ error: 'Order number, email, and order id are required.' });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'A valid payment amount is required.' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  if (String(order.order_number || '').trim() !== orderNumber) {
    return res.status(403).json({ error: 'Order number does not match this order.' });
  }

  if (String(order.email || '').trim().toLowerCase() !== email.toLowerCase()) {
    return res.status(403).json({ error: 'This payment request is not authorized for the provided customer email.' });
  }

  let invoice = db.prepare('SELECT * FROM sale_invoices WHERE order_id = ?').get(orderId);
  if (!invoice) {
    try {
      invoice = generateInvoiceForOrder(orderId, { customerId: order.customer_id || null, createdBy: 'customer' });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Unable to generate an invoice for this order.' });
    }
  }

  const currentPaid = Number(invoice.paid_amount || 0);
  const nextPaid = currentPaid + amount;
  const paymentStatus = determinePaymentStatus(invoice.total || 0, nextPaid);

  db.prepare(`
    UPDATE sale_invoices
    SET payment_status = ?,
        payment_method = ?,
        paid_amount = ?,
        payment_reference = ?,
        captured_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(paymentStatus, paymentMethod, nextPaid.toFixed(2), paymentReference || `PAY-${Date.now()}`, invoice.id);

  insertPaymentLedgerEntry({
    orderId,
    invoiceId: invoice.id,
    customerId: Number(order.customer_id || invoice.customer_id || 0),
    paymentReference: paymentReference || `PAY-${Date.now()}`,
    paymentMethod,
    amount,
    entryType: 'Payment',
    entryDate: new Date().toISOString(),
    description: `Customer payment captured via ${paymentMethod}`,
    status: 'Captured'
  });

  db.prepare('UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(paymentStatus, orderId);

  const updatedInvoice = db.prepare('SELECT * FROM sale_invoices WHERE id = ?').get(invoice.id);
  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

  res.json({
    success: true,
    message: 'Payment captured successfully.',
    payment_status: paymentStatus,
    order: updatedOrder,
    invoice: updatedInvoice
  });
});

app.get('/api/invoices', requireAdminAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, o.order_number, o.customer_name, o.phone, o.city, c.name AS customer_name_master
    FROM sale_invoices i
    LEFT JOIN orders o ON o.id = i.order_id
    LEFT JOIN customers c ON c.id = i.customer_id
    ORDER BY i.invoice_date DESC
  `).all();
  res.json({ invoices: rows });
});

app.get('/api/invoices/:id/items', requireAdminAuth, (req, res) => {
  const invoiceId = Number(req.params.id);
  const rows = db.prepare(`
    SELECT sii.*, p.name AS product_name, p.sku
    FROM sale_invoice_items sii
    LEFT JOIN products p ON p.id = sii.product_id
    WHERE sii.invoice_id = ?
    ORDER BY sii.id ASC
  `).all(invoiceId);

  res.json({ items: rows });
});

app.post('/api/invoices/manual', requireAdminAuth, (req, res) => {
  try {
    const payload = req.body || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!payload.customer_name && !payload.customer_id) {
      return res.status(400).json({ error: 'Customer is required to create a manual invoice.' });
    }
    if (!items.length) {
      return res.status(400).json({ error: 'At least one invoice line is required.' });
    }

    const customer = payload.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(payload.customer_id)) : upsertCustomer({
      name: payload.customer_name,
      email: payload.email || '',
      phone: payload.phone || '',
      city: payload.city || '',
      address: payload.address || ''
    });

    const orderNumber = generateOrderNumber();
    const invoiceNumber = generateSaleInvoiceNumber();
    const invoiceDate = payload.invoice_date || new Date().toISOString();

    const prepared = buildOrderRecordFromItemList(items);
    const subtotal = prepared.total;
    const discount = Number(payload.discount || 0);
    const tax = Number(payload.tax || 0);
    const total = subtotal - discount + tax;

    const tx = db.transaction(() => {
      const orderResult = db.prepare(`
        INSERT INTO orders (order_number, customer_id, customer_name, email, phone, city, delivery_address, order_total, status, payment_status, delivery_status, confirmed_at, confirmed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?, 'Pending', CURRENT_TIMESTAMP, ?)
      `).run(orderNumber, customer.id, customer.name, customer.email || payload.email || '', customer.phone || payload.phone || '', customer.city || payload.city || '', customer.address || payload.address || '', total.toFixed(2), payload.payment_status || 'Unpaid', req.session?.username || 'admin');

      const orderId = orderResult.lastInsertRowid;
      for (const item of prepared.preparedItems) {
        db.prepare(`
          INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?)
        `).run(orderId, item.productId, item.qty, item.unitPrice.toFixed(2), item.lineTotal.toFixed(2));
      }

      const invoiceResult = db.prepare(`
        INSERT INTO sale_invoices (invoice_number, order_id, customer_id, invoice_date, subtotal, discount, tax, total, payment_status, payment_method, delivery_status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
      `).run(invoiceNumber, orderId, customer.id, invoiceDate, subtotal.toFixed(2), discount.toFixed(2), tax.toFixed(2), total.toFixed(2), payload.payment_status || 'Unpaid', payload.payment_method || 'Cash', req.session?.username || 'admin');

      for (const item of prepared.preparedItems) {
        db.prepare(`
          INSERT INTO sale_invoice_items (invoice_id, product_id, quantity, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?)
        `).run(invoiceResult.lastInsertRowid, item.productId, item.qty, item.unitPrice.toFixed(2), item.lineTotal.toFixed(2));
      }

      for (const item of prepared.preparedItems) {
        db.prepare(`
          INSERT INTO inventory_transactions (product_id, transaction_type, reference_type, reference_id, quantity_in, quantity_out, unit_cost, notes)
          VALUES (?, 'Sale', 'Invoice', ?, 0, ?, ?, ?)
        `).run(item.productId, invoiceResult.lastInsertRowid, item.qty, item.unitPrice.toFixed(2), `Manual invoice ${invoiceNumber}`);
      }

      return { orderId, orderNumber, invoiceNumber, invoiceId: invoiceResult.lastInsertRowid };
    })();

    res.status(201).json({ success: true, message: 'Manual sale invoice created.', data: tx });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to create manual invoice.' });
  }
});

app.get('/api/products/:id/batches', requireAdminAuth, (req, res) => {
  const productId = Number(req.params.id);
  const rows = getProductBatches(productId);
  res.json({ batches: rows.map((row) => ({
    id: row.id,
    batch_number: row.batch_number,
    expiry_date: row.expiry_date,
    available_quantity: Number(row.available_quantity || 0),
    purchase_cost: Number(row.purchase_cost || 0),
    supplier_name: row.supplier_name || 'Supplier',
    created_at: row.created_at,
  })) });
});

app.post('/api/orders/:id/dispatch', requireAdminAuth, (req, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const invoice = db.prepare('SELECT * FROM sale_invoices WHERE order_id = ?').get(orderId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found for this order.' });

  const payload = req.body || {};
  const dispatchNumber = String(payload.dispatch_number || '').trim();
  const dispatchDate = String(payload.dispatch_date || new Date().toISOString().slice(0, 10)).trim();
  const expectedArrivalDate = String(payload.expected_arrival_date || '').trim();
  const batchAllocations = Array.isArray(payload.batch_allocations) ? payload.batch_allocations : [];

  if (!dispatchNumber || !dispatchDate || !expectedArrivalDate) {
    return res.status(400).json({ error: 'Dispatch number, date, and expected arrival date are required.' });
  }

  if (String(order.status).toLowerCase() === 'dispatched' || String(invoice.delivery_status).toLowerCase() === 'dispatched') {
    return res.status(400).json({ error: 'This order has already been dispatched.' });
  }

  const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  if (!orderItems.length) {
    return res.status(400).json({ error: 'This order has no items to dispatch.' });
  }

  const normalized = normalizeDispatchBatchInput(batchAllocations, orderItems);
  const usedBatches = applyBatchAllocationToOrder({
    orderId,
    invoiceId: invoice.id,
    batchAllocations: normalized,
    createdBy: req.session?.username || 'admin',
  });

  db.prepare(`
    UPDATE orders
    SET status = 'Dispatched', delivery_status = 'Dispatched', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(orderId);

  db.prepare(`
    UPDATE sale_invoices
    SET delivery_status = 'Dispatched',
        dispatch_number = ?,
        dispatch_date = ?,
        expected_arrival_date = ?,
        dispatched_by = ?,
        dispatched_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `).run(dispatchNumber, dispatchDate, expectedArrivalDate, req.session?.username || 'admin', orderId);

  const updatedInvoice = db.prepare('SELECT * FROM sale_invoices WHERE order_id = ?').get(orderId);
  res.json({ success: true, orderId, invoice: updatedInvoice, allocations: usedBatches });
});

app.post('/api/invoices/:id/dispatch', requireAdminAuth, (req, res) => {
  const invoiceId = Number(req.params.id);
  const payload = req.body || {};
  const dispatchNumber = String(payload.dispatch_number || '').trim();
  const dispatchDate = String(payload.dispatch_date || new Date().toISOString().slice(0, 10)).trim();
  const expectedArrivalDate = String(payload.expected_arrival_date || '').trim();
  const batchAllocations = Array.isArray(payload.batch_allocations) ? payload.batch_allocations : [];

  if (!dispatchNumber || !dispatchDate || !expectedArrivalDate) {
    return res.status(400).json({ error: 'Dispatch number, date, and expected arrival date are required.' });
  }

  const invoice = db.prepare('SELECT * FROM sale_invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (String(invoice.delivery_status).toLowerCase() === 'dispatched') {
    return res.status(400).json({ error: 'This invoice is already dispatched.' });
  }

  const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(invoice.order_id);
  if (!orderItems.length) {
    return res.status(400).json({ error: 'This invoice has no items to dispatch.' });
  }

  const normalized = normalizeDispatchBatchInput(batchAllocations, orderItems);
  const usedBatches = applyBatchAllocationToOrder({
    orderId: invoice.order_id,
    invoiceId: invoice.id,
    batchAllocations: normalized,
    createdBy: req.session?.username || 'admin',
  });

  db.prepare(`
    UPDATE sale_invoices
    SET delivery_status = 'Dispatched',
        dispatch_number = ?,
        dispatch_date = ?,
        expected_arrival_date = ?,
        dispatched_by = ?,
        dispatched_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(dispatchNumber, dispatchDate, expectedArrivalDate, req.session?.username || 'admin', invoiceId);

  db.prepare(`
    UPDATE orders
    SET status = 'Dispatched', delivery_status = 'Dispatched', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(invoice.order_id);

  const updatedInvoice = db.prepare('SELECT * FROM sale_invoices WHERE id = ?').get(invoiceId);
  res.json({ success: true, invoice: updatedInvoice, allocations: usedBatches });
});

app.get('/api/sale-returns', requireAdminAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 25)));
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const startDate = String(req.query.start_date || '').trim();
  const endDate = String(req.query.end_date || '').trim();

  const params = [];
  const conditions = ['1 = 1'];

  if (search) {
    conditions.push('(LOWER(COALESCE(c.name, "")) LIKE ? OR LOWER(COALESCE(p.name, "")) LIKE ? OR LOWER(COALESCE(i.invoice_number, "")) LIKE ? OR LOWER(COALESCE(o.order_number, "")) LIKE ?)');
    const q = `%${search.toLowerCase()}%`;
    params.push(q, q, q, q);
  }
  if (status) {
    conditions.push('sr.status = ?');
    params.push(status);
  }
  if (startDate) {
    conditions.push('date(sr.return_date) >= date(?)');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('date(sr.return_date) <= date(?)');
    params.push(endDate);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM sale_returns sr
    LEFT JOIN sale_invoices i ON i.id = sr.invoice_id
    LEFT JOIN orders o ON o.id = sr.order_id
    LEFT JOIN customers c ON c.id = sr.customer_id
    LEFT JOIN products p ON p.id = sr.product_id
    ${where}
  `).get(...params).total;

  const rows = db.prepare(`
    SELECT sr.*, i.invoice_number, o.order_number, c.name AS customer_name, p.name AS product_name
    FROM sale_returns sr
    LEFT JOIN sale_invoices i ON i.id = sr.invoice_id
    LEFT JOIN orders o ON o.id = sr.order_id
    LEFT JOIN customers c ON c.id = sr.customer_id
    LEFT JOIN products p ON p.id = sr.product_id
    ${where}
    ORDER BY sr.return_date DESC, sr.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit);

  res.json({ sale_returns: rows, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), filters: { search, status, startDate, endDate } });
});

app.get('/api/payment-ledger', requireAdminAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 25)));
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const startDate = String(req.query.start_date || '').trim();
  const endDate = String(req.query.end_date || '').trim();
  const orderId = Number(req.query.order_id || 0);
  const invoiceId = Number(req.query.invoice_id || 0);

  const params = [];
  const conditions = ['1 = 1'];

  if (search) {
    conditions.push('(LOWER(COALESCE(o.order_number, "")) LIKE ? OR LOWER(COALESCE(i.invoice_number, "")) LIKE ? OR LOWER(COALESCE(c.name, "")) LIKE ? OR LOWER(COALESCE(pl.payment_reference, "")) LIKE ?)');
    const q = `%${search.toLowerCase()}%`;
    params.push(q, q, q, q);
  }
  if (status) {
    conditions.push('pl.status = ?');
    params.push(status);
  }
  if (startDate) {
    conditions.push('date(pl.entry_date) >= date(?)');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('date(pl.entry_date) <= date(?)');
    params.push(endDate);
  }
  if (orderId) {
    conditions.push('pl.order_id = ?');
    params.push(orderId);
  }
  if (invoiceId) {
    conditions.push('pl.invoice_id = ?');
    params.push(invoiceId);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM payment_ledger pl
    LEFT JOIN orders o ON o.id = pl.order_id
    LEFT JOIN sale_invoices i ON i.id = pl.invoice_id
    LEFT JOIN customers c ON c.id = o.customer_id OR c.id = i.customer_id
    ${where}
  `).get(...params).total;

  const rows = db.prepare(`
    SELECT pl.*, o.order_number, i.invoice_number, c.name AS customer_name, c.phone AS customer_phone
    FROM payment_ledger pl
    LEFT JOIN orders o ON o.id = pl.order_id
    LEFT JOIN sale_invoices i ON i.id = pl.invoice_id
    LEFT JOIN customers c ON c.id = o.customer_id OR c.id = i.customer_id
    ${where}
    ORDER BY pl.entry_date DESC, pl.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit);

  res.json({ payments: rows, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), filters: { search, status, startDate, endDate, orderId, invoiceId } });
});

app.post('/api/sale-returns', requireAdminAuth, (req, res) => {
  const payload = req.body || {};
  const invoiceId = Number(payload.invoice_id || 0);
  const productId = Number(payload.product_id || 0);
  const quantity = Number(payload.quantity || 0);
  const returnReason = String(payload.return_reason || '').trim();
  const returnDate = payload.return_date || new Date().toISOString().slice(0, 10);

  if (!invoiceId) {
    return res.status(400).json({ error: 'Sale invoice number is mandatory.' });
  }
  if (!productId || quantity <= 0) {
    return res.status(400).json({ error: 'A valid product and quantity are required.' });
  }

  const invoice = db.prepare(`
    SELECT i.*, o.customer_name, o.email, o.phone, o.city, o.delivery_address, c.id AS customer_db_id, c.name AS customer_name_master
    FROM sale_invoices i
    LEFT JOIN orders o ON o.id = i.order_id
    LEFT JOIN customers c ON c.id = i.customer_id
    WHERE i.id = ?
  `).get(invoiceId);

  if (!invoice) {
    return res.status(404).json({ error: 'Sale invoice not found.' });
  }

  const soldItem = db.prepare(`
    SELECT * FROM sale_invoice_items WHERE invoice_id = ? AND product_id = ?
  `).get(invoiceId, productId);

  if (!soldItem) {
    return res.status(400).json({ error: 'This product was not sold on the selected invoice.' });
  }

  const eligibleQty = Number(soldItem.quantity || 0);
  if (quantity > eligibleQty) {
    return res.status(400).json({ error: `Return quantity cannot exceed the sold quantity (${eligibleQty}).` });
  }

  const unitPrice = Number(soldItem.unit_price || 0);
  const total = (quantity * unitPrice).toFixed(2);
  const returnNumber = `SR-${Date.now()}`;

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO sale_returns (return_number, invoice_id, order_id, customer_id, product_id, quantity, unit_price, return_reason, return_date, return_amount, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?)
    `).run(returnNumber, invoiceId, invoice.order_id, invoice.customer_id || invoice.customer_db_id, productId, quantity, unitPrice.toFixed(2), returnReason || 'Customer return', returnDate, total, req.session?.username || 'admin');

    db.prepare(`
      INSERT INTO inventory_transactions (product_id, transaction_type, reference_type, reference_id, quantity_in, quantity_out, unit_cost, notes)
      VALUES (?, 'Sale Return', 'SaleReturn', ?, ?, 0, ?, ?)
    `).run(productId, result.lastInsertRowid, quantity, unitPrice.toFixed(2), `Sale return ${returnNumber}`);

    const customerId = Number(invoice.customer_id || invoice.customer_db_id || 0);
    if (customerId) {
      insertPaymentLedgerEntry({
        orderId: invoice.order_id,
        invoiceId,
        customerId,
        paymentReference: `SR-${Date.now()}`,
        paymentMethod: 'Credit Note',
        amount: -Number(total),
        entryType: 'Refund',
        entryDate: returnDate,
        description: `Customer return ${returnNumber}`,
        status: 'Captured'
      });
    }

    return { returnNumber, total, invoiceId };
  })();

  res.status(201).json({ success: true, return_item: tx });
});

app.get('/api/reports/orders-sales', requireAdminAuth, (req, res) => {
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM orders) AS total_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'Confirmed') AS confirmed_orders,
      (SELECT COALESCE(SUM(total), 0) FROM sale_invoices) AS total_sales,
      (SELECT COALESCE(SUM(return_amount), 0) FROM sale_returns) AS total_sale_returns,
      (SELECT COUNT(*) FROM sale_invoices WHERE delivery_status = 'Dispatched') AS dispatched_orders,
      (SELECT COUNT(*) FROM sale_invoices WHERE delivery_status <> 'Dispatched') AS pending_not_dispatched
  `).get();

  res.json({
    total_orders: Number(totals.total_orders || 0),
    confirmed_orders: Number(totals.confirmed_orders || 0),
    total_sales: Number(totals.total_sales || 0),
    total_sale_returns: Number(totals.total_sale_returns || 0),
    dispatched_orders: Number(totals.dispatched_orders || 0),
    pending_not_dispatched: Number(totals.pending_not_dispatched || 0),
  });
});

app.get('/api/suppliers', requireAdminAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY created_at DESC').all();
  res.json({ suppliers: rows });
});

app.post('/api/suppliers', requireAdminAuth, (req, res) => {
  const payload = req.body || {};
  if (!payload.name) return res.status(400).json({ error: 'Supplier name is required.' });

  const supplierId = payload.supplier_id || `SUP-${Date.now()}`;
  const result = db.prepare(`
    INSERT INTO suppliers (supplier_id, name, company_name, phone, email, address, opening_balance, credit_limit, active, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    supplierId,
    payload.name,
    payload.company_name || '',
    payload.phone || '',
    payload.email || '',
    payload.address || '',
    Number(payload.opening_balance || 0),
    Number(payload.credit_limit || 0),
    payload.active === false ? 0 : 1,
    payload.notes || ''
  );

  const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ supplier: row });
});

app.get('/api/accounts/vendor-ledger', requireAdminAuth, (req, res) => {
  const { fromDate, toDate } = getAccountsDateRange(req);
  const supplierId = Number(req.query.supplier_id || 0);
  const rows = getSupplierLedgerRows({ fromDate, toDate, supplierId });

  let runningBalance = 0;
  const ledger = rows.map((row) => {
    const delta = safeNumber(row.debit) - safeNumber(row.credit);
    runningBalance += delta;
    return { ...row, running_balance: runningBalance };
  });

  const totalBilled = ledger.reduce((sum, row) => sum + safeNumber(row.debit), 0);
  const totalPaid = ledger.reduce((sum, row) => sum + safeNumber(row.credit), 0);
  const totalOutstanding = totalBilled - totalPaid;

  res.json({
    rows: ledger,
    summary: {
      total_billed: totalBilled,
      total_paid: totalPaid,
      total_outstanding: totalOutstanding,
      from_date: fromDate,
      to_date: toDate,
      supplier_id: supplierId,
    }
  });
});

app.post('/api/accounts/vendor-payments', requireAdminAuth, (req, res) => {
  const payload = req.body || {};
  const supplierId = Number(payload.supplier_id || 0);
  const amount = safeNumber(payload.amount || 0);
  const paymentDate = toDateOnly(payload.payment_date || new Date().toISOString());
  const paymentMethod = String(payload.payment_method || 'Bank Transfer').trim() || 'Bank Transfer';
  const referenceNo = String(payload.reference_no || payload.reference || `VEN-${Date.now()}`).trim();
  const description = String(payload.description || `Vendor payment via ${paymentMethod}`).trim() || `Vendor payment via ${paymentMethod}`;

  if (!supplierId || amount <= 0) {
    return res.status(400).json({ error: 'Valid supplier and payment amount are required.' });
  }

  const supplier = db.prepare('SELECT id, name FROM suppliers WHERE id = ?').get(supplierId);
  if (!supplier) {
    return res.status(404).json({ error: 'Supplier not found.' });
  }

  const row = insertSupplierLedgerEntry({
    supplierId,
    referenceType: 'VendorPayment',
    referenceId: null,
    entryDate: paymentDate,
    description,
    debit: 0,
    credit: amount,
  });

  insertPaymentLedgerEntry({
    supplierId,
    paymentReference: referenceNo,
    paymentMethod,
    amount,
    entryType: 'Payment',
    entryDate: paymentDate,
    description,
    status: 'Captured'
  });

  res.status(201).json({ success: true, payment: row });
});

app.get('/api/accounts/payment-history', requireAdminAuth, (req, res) => {
  const fromDate = toDateOnly(req.query.from_date || '');
  const toDate = toDateOnly(req.query.to_date || '');
  const partyType = String(req.query.party_type || '').trim();
  const paymentMethod = String(req.query.payment_method || '').trim();

  const params = [];
  const conditions = ['1 = 1'];

  if (fromDate) {
    conditions.push('date(pl.entry_date) >= date(?)');
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push('date(pl.entry_date) <= date(?)');
    params.push(toDate);
  }
  if (partyType) {
    if (partyType === 'Vendor') {
      conditions.push('pl.supplier_id IS NOT NULL');
    } else if (partyType === 'Client') {
      conditions.push('pl.customer_id IS NOT NULL');
    }
  }
  if (paymentMethod) {
    conditions.push('LOWER(COALESCE(pl.payment_method, "")) = LOWER(?)');
    params.push(paymentMethod);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const rows = db.prepare(`
    SELECT pl.*, 
      CASE 
        WHEN pl.customer_id IS NOT NULL THEN 'Client'
        WHEN pl.supplier_id IS NOT NULL THEN 'Vendor'
        ELSE 'Other'
      END AS party_type,
      COALESCE(c.name, s.name, 'N/A') AS party_name,
      CASE
        WHEN pl.entry_type = 'Receipt' THEN 'Payment Received'
        WHEN pl.entry_type = 'Payment' THEN 'Payment Made'
        WHEN pl.entry_type = 'Refund' THEN 'Refund'
        ELSE pl.entry_type
      END AS payment_type
    FROM payment_ledger pl
    LEFT JOIN customers c ON c.id = pl.customer_id
    LEFT JOIN suppliers s ON s.id = pl.supplier_id
    ${where}
    ORDER BY date(pl.entry_date) DESC, pl.id DESC
  `).all(...params);

  res.json({
    rows: rows.map((row) => ({
      id: row.id,
      entry_date: row.entry_date,
      date: row.entry_date,
      party_type: row.party_type,
      party_name: row.party_name || 'N/A',
      payment_type: row.payment_type || row.entry_type || 'Payment',
      payment_method: row.payment_method || 'Cash',
      payment_reference: row.payment_reference || '—',
      description: row.description || 'Payment entry',
      amount: Number(row.amount || 0),
      absolute_amount: Math.abs(Number(row.amount || 0)),
      status: row.status || 'Captured'
    })),
    total: rows.length,
    filters: { from_date: fromDate, to_date: toDate, party_type: partyType, payment_method: paymentMethod }
  });
});

app.get('/api/accounts/client-ledger', requireAdminAuth, (req, res) => {
  const { fromDate, toDate } = getAccountsDateRange(req);
  const customerId = Number(req.query.customer_id || 0);
  const rows = getClientLedgerRows({ fromDate, toDate, customerId });

  const totalBilled = rows.reduce((sum, row) => sum + safeNumber(row.debit), 0);
  const totalReceived = rows.reduce((sum, row) => sum + safeNumber(row.credit), 0);
  const totalOutstanding = totalBilled - totalReceived;

  res.json({
    rows,
    summary: {
      total_billed: totalBilled,
      total_paid_received: totalReceived,
      total_outstanding: totalOutstanding,
      from_date: fromDate,
      to_date: toDate,
      customer_id: customerId,
    }
  });
});

app.post('/api/accounts/client-receipts', requireAdminAuth, (req, res) => {
  const payload = req.body || {};
  const customerId = Number(payload.customer_id || 0);
  const amount = safeNumber(payload.amount || 0);
  const entryDate = toDateOnly(payload.entry_date || new Date().toISOString());
  const paymentMethod = String(payload.payment_method || 'Cash').trim() || 'Cash';
  const referenceNo = String(payload.reference_no || payload.reference || `RCPT-${Date.now()}`).trim();
  const description = String(payload.description || `Client receipt via ${paymentMethod}`).trim() || `Client receipt via ${paymentMethod}`;

  if (!customerId || amount <= 0) {
    return res.status(400).json({ error: 'Valid customer and receipt amount are required.' });
  }

  const customer = db.prepare('SELECT id, name FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found.' });
  }

  const row = insertPaymentLedgerEntry({
    orderId: null,
    invoiceId: null,
    customerId,
    paymentReference: referenceNo,
    paymentMethod,
    amount,
    entryType: 'Receipt',
    entryDate,
    description,
    status: 'Captured'
  });

  res.status(201).json({ success: true, receipt: row });
});

app.get('/api/accounts/expenses', requireAdminAuth, (req, res) => {
  const { fromDate, toDate } = getAccountsDateRange(req);
  const category = String(req.query.category || '').trim();

  const conditions = ['1 = 1'];
  const params = [];

  if (fromDate) {
    conditions.push('date(expense_date) >= date(?)');
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push('date(expense_date) <= date(?)');
    params.push(toDate);
  }
  if (category) {
    conditions.push('LOWER(category) = LOWER(?)');
    params.push(category);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const rows = db.prepare(`
    SELECT *
    FROM expenses
    ${where}
    ORDER BY expense_date DESC, id DESC
  `).all(...params);

  const totalExpenses = rows.reduce((sum, row) => sum + safeNumber(row.amount), 0);
  const totalByMonth = {};
  for (const row of rows) {
    const monthKey = String(row.expense_date || '').slice(0, 7);
    if (!monthKey) continue;
    totalByMonth[monthKey] = (totalByMonth[monthKey] || 0) + safeNumber(row.amount);
  }

  res.json({
    expenses: rows,
    total_expenses: totalExpenses,
    total_by_month: totalByMonth,
    filters: {
      from_date: fromDate,
      to_date: toDate,
      category,
    }
  });
});

app.post('/api/accounts/expenses', requireAdminAuth, (req, res) => {
  const payload = req.body || {};
  const expenseDate = toDateOnly(payload.expense_date || new Date().toISOString());
  const category = String(payload.category || 'Miscellaneous').trim() || 'Miscellaneous';
  const description = String(payload.description || '').trim();
  const amount = safeNumber(payload.amount || 0);
  const paymentMethod = String(payload.payment_method || 'Cash').trim() || 'Cash';
  const referenceNo = String(payload.reference_no || '').trim();

  if (!description || amount <= 0) {
    return res.status(400).json({ error: 'Expense description and amount are required.' });
  }

  const result = db.prepare(`
    INSERT INTO expenses (expense_date, category, description, amount, payment_method, reference_no, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(expenseDate, category, description, amount.toFixed(2), paymentMethod, referenceNo || null, req.session?.username || 'admin');

  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, expense: row });
});

app.get('/api/accounts/profitability', requireAdminAuth, (req, res) => {
  const { fromDate, toDate } = getAccountsDateRange(req);
  const rows = buildProfitabilityRows({ fromDate, toDate });
  const totalGrossSales = rows.reduce((sum, row) => sum + safeNumber(row.total_net_revenue), 0);
  const totalDiscounts = rows.reduce((sum, row) => sum + safeNumber(row.discount_total), 0);
  const totalCogs = rows.reduce((sum, row) => sum + safeNumber(row.cogs), 0);
  const totalGrossMargin = totalGrossSales - totalCogs;

  const expenseRows = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total_expenses
    FROM expenses
    WHERE (? = '' OR date(expense_date) >= date(?))
      AND (? = '' OR date(expense_date) <= date(?))
  `).all(fromDate || '', fromDate || '', toDate || '', toDate || '');

  const totalOperatingExpenses = safeNumber(expenseRows[0]?.total_expenses || 0);
  const netProfit = totalGrossMargin - totalOperatingExpenses;

  res.json({
    rows,
    summary: {
      total_gross_sales: totalGrossSales,
      total_discounts: totalDiscounts,
      total_cogs: totalCogs,
      total_gross_margin: totalGrossMargin,
      total_operating_expenses: totalOperatingExpenses,
      net_profit: netProfit,
      from_date: fromDate,
      to_date: toDate,
    }
  });
});

app.get('/api/purchases', requireAdminAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, s.name AS supplier_name
    FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.purchase_date DESC
  `).all();

  const purchaseIds = rows.map((row) => row.id);
  const lineMap = purchaseIds.length ? db.prepare(`
    SELECT pi.purchase_id, pi.product_id, p.name AS product_name, pi.quantity, pi.unit_cost, pi.line_total
    FROM purchase_items pi
    LEFT JOIN products p ON p.id = pi.product_id
    WHERE pi.purchase_id IN (${purchaseIds.map(() => '?').join(',')})
  `).all(...purchaseIds) : [];

  const itemMap = {};
  for (const item of lineMap) {
    if (!itemMap[item.purchase_id]) itemMap[item.purchase_id] = [];
    itemMap[item.purchase_id].push(item);
  }

  res.json({ purchases: rows.map((row) => ({ ...row, items: itemMap[row.id] || [] })) });
});

app.get('/api/product-batches', requireAdminAuth, (req, res) => {
  const productId = Number(req.query.product_id || 0);
  const rows = productId
    ? db.prepare(`
        SELECT *
        FROM product_batches
        WHERE product_id = ?
        ORDER BY expiry_date IS NULL, expiry_date ASC, created_at DESC
      `).all(productId)
    : db.prepare(`
        SELECT *
        FROM product_batches
        ORDER BY product_id, expiry_date IS NULL, expiry_date ASC, created_at DESC
      `).all();

  res.json({ batches: rows.map((row) => ({
    ...row,
    expiry_date: formatExpiryDateForDisplay(row.expiry_date),
    available_quantity: Number(row.available_quantity || 0),
    initial_quantity: Number(row.initial_quantity || 0),
    purchase_cost: Number(row.purchase_cost || 0),
  })) });
});

app.post('/api/product-batches', requireAdminAuth, (req, res) => {
  try {
    const payload = req.body || {};
    const batchNumber = String(payload.batch_number || '').trim();
    let expiryDate = '';

    try {
      expiryDate = parseBatchExpiryDateToIso(payload.expiry_date || '');
    } catch (error) {
      return res.status(400).json({ message: error.message || 'Expiry date must be in DD-MM-YY format.' });
    }

    const initialQuantity = Number(payload.initial_quantity || payload.available_quantity || 0);
    const purchaseCost = Number(payload.purchase_cost || 0);
    const supplierName = String(payload.supplier_name || '').trim() || 'Supplier';

    if (!batchNumber || !expiryDate) {
      return res.status(400).json({ message: 'Batch number and expiry date are required.' });
    }

    const existing = db.prepare(`
      SELECT *
      FROM product_batches
      WHERE batch_number = ? AND COALESCE(expiry_date, '') = COALESCE(?, '')
    `).get(batchNumber, expiryDate);

    if (existing) {
      return res.status(409).json({ message: 'Duplicate batch number', batch: { ...existing, expiry_date: formatExpiryDateForDisplay(existing.expiry_date) } });
    }

    const result = db.prepare(`
      INSERT INTO product_batches (product_id, batch_number, expiry_date, initial_quantity, available_quantity, purchase_cost, supplier_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(null, batchNumber, expiryDate, initialQuantity || 0, initialQuantity || 0, purchaseCost.toFixed(2), supplierName);

    const batch = db.prepare('SELECT * FROM product_batches WHERE id = ?').get(result.lastInsertRowid);
    const responseBatch = { ...batch, expiry_date: formatExpiryDateForDisplay(batch.expiry_date) };
    res.status(201).json({ message: 'Batch created successfully!', batch: responseBatch });
  } catch (error) {
    console.error('Batch create failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to save batch.' });
  }
});

app.post('/api/purchases', requireAdminAuth, (req, res) => {
  const payload = req.body || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const supplierId = Number(payload.supplier_id);
  if (!supplierId || !items.length) {
    return res.status(400).json({ error: 'Supplier and purchase items are required.' });
  }

  const transaction = db.transaction(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;

    for (const item of items) {
      const qty = Number(item.quantity || 0);
      const unitCost = Number(item.purchase_rate || 0);
      const lineDiscount = Number(item.discount || 0);
      const lineTax = Number(item.tax || 0);
      const lineTotal = qty * unitCost + lineTax - lineDiscount;
      subtotal += qty * unitCost;
      discount += lineDiscount;
      tax += lineTax;
      if (qty <= 0 || unitCost < 0) {
        throw new Error('Invalid purchase item quantity or rate.');
      }
    }

    const total = subtotal - discount + tax;
    const supplierInvoiceNo = String(payload.purchase_number || payload.supplier_invoice_number || '').trim();
    const purchaseNumber = generatePurchaseNumber();
    const purchaseDate = payload.purchase_date || new Date().toISOString().slice(0, 10);
    const normalizedNotes = (() => {
      const notes = [payload.notes || '', supplierInvoiceNo ? `Supplier invoice no: ${supplierInvoiceNo}` : ''].filter(Boolean).join(' | ');
      return notes || '';
    })();
    const purchaseResult = db.prepare(`
      INSERT INTO purchases (purchase_number, supplier_id, purchase_date, subtotal, discount, tax, total, paid_amount, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Received', ?)
    `).run(purchaseNumber, supplierId, purchaseDate, subtotal.toFixed(2), discount.toFixed(2), tax.toFixed(2), total.toFixed(2), normalizedNotes);

    const purchaseId = purchaseResult.lastInsertRowid;
    for (const item of items) {
      const qty = Number(item.quantity || 0);
      const unitCost = Number(item.purchase_rate || 0);
      const lineDiscount = Number(item.discount || 0);
      const lineTax = Number(item.tax || 0);
      const lineTotal = qty * unitCost + lineTax - lineDiscount;
      const productId = Number(item.product_id);
      const batchId = Number(item.batch_id || 0);
      const batchNumber = String(item.batch_number || '').trim();
      const expiryDate = String(item.expiry_date || '').trim();
      const supplierName = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(supplierId)?.name || 'Supplier';
      const resolvedBatch = resolvePurchaseBatch({
        productId,
        batchId,
        batchNumber,
        expiryDate,
        purchaseCost: unitCost,
        supplierName,
        quantity: qty,
      });

      db.prepare(`
        INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, discount, tax, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(purchaseId, productId, qty, unitCost.toFixed(2), lineDiscount.toFixed(2), lineTax.toFixed(2), lineTotal.toFixed(2));

      db.prepare(`
        INSERT INTO inventory_transactions (product_id, batch_id, transaction_type, reference_type, reference_id, quantity_in, unit_cost, notes)
        VALUES (?, ?, 'Purchase', 'Purchase', ?, ?, ?, ?)
      `).run(productId, resolvedBatch ? resolvedBatch.id : null, purchaseId, qty, unitCost.toFixed(2), `Purchase ${purchaseNumber}`);
    }

    insertSupplierLedgerEntry({
      supplierId,
      referenceType: 'Purchase',
      referenceId: purchaseId,
      entryDate: new Date().toISOString(),
      description: `Purchase ${purchaseNumber}`,
      debit: total,
      credit: 0,
    });

    return { purchaseId, purchaseNumber, total: total.toFixed(2) };
  })();

  res.status(201).json({ message: 'Purchase created', purchase: transaction });
});

app.get('/api/purchase-returns', requireAdminAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT pr.*, p.purchase_number, s.name AS supplier_name
    FROM purchase_returns pr
    LEFT JOIN purchases p ON p.id = pr.purchase_id
    LEFT JOIN suppliers s ON s.id = pr.supplier_id
    ORDER BY pr.return_date DESC
  `).all();

  res.json({ purchase_returns: rows });
});

app.post('/api/purchase-returns', requireAdminAuth, (req, res) => {
  const payload = req.body || {};
  const purchaseId = Number(payload.purchase_id || 0);
  const productId = Number(payload.product_id || 0);
  const quantity = Number(payload.quantity || 0);
  const unitCost = Number(payload.unit_cost || 0);
  const returnDate = payload.return_date || new Date().toISOString().slice(0, 10);

  if (!purchaseId) {
    return res.status(400).json({ error: 'Purchase invoice number is mandatory for a purchase return.' });
  }
  if (!productId || quantity <= 0 || unitCost < 0) {
    return res.status(400).json({ error: 'Please provide a valid product, quantity, and unit cost.' });
  }

  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  if (!purchase) {
    return res.status(404).json({ error: 'Purchase invoice not found.' });
  }

  const total = (quantity * unitCost).toFixed(2);
  const returnNumber = `PR-${Date.now()}`;

  const result = db.transaction(() => {
    const returnResult = db.prepare(`
      INSERT INTO purchase_returns (return_number, purchase_id, supplier_id, return_date, reason, total, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `).run(returnNumber, purchaseId, purchase.supplier_id, returnDate, payload.reason || 'Returned item', total);

    db.prepare(`
      INSERT INTO purchase_return_items (purchase_return_id, product_id, quantity, unit_cost, total)
      VALUES (?, ?, ?, ?, ?)
    `).run(returnResult.lastInsertRowid, productId, quantity, unitCost.toFixed(2), total);

    db.prepare(`
      INSERT INTO inventory_transactions (product_id, transaction_type, reference_type, reference_id, quantity_in, quantity_out, unit_cost, notes)
      VALUES (?, 'Purchase Return', 'PurchaseReturn', ?, 0, ?, ?, ?)
    `).run(productId, returnResult.lastInsertRowid, quantity, unitCost.toFixed(2), `Purchase return ${returnNumber}`);

    insertSupplierLedgerEntry({
      supplierId: purchase.supplier_id,
      referenceType: 'PurchaseReturn',
      referenceId: returnResult.lastInsertRowid,
      entryDate: returnDate,
      description: `Purchase return ${returnNumber}`,
      debit: 0,
      credit: Number(total),
    });

    return { returnResult, total };
  })();

  res.status(201).json({ message: 'Purchase return created', return_number: returnNumber, total: Number(total) });
});

app.get('/api/dashboard/kpis', requireAdminAuth, (req, res) => {
  const monthlySales = db.prepare(`
    SELECT COALESCE(SUM(order_total), 0) AS total
    FROM orders
    WHERE created_at >= datetime('now', 'start of month')
  `).get();

  const pendingOrders = db.prepare(`SELECT COUNT(*) AS count FROM orders WHERE status IN ('Pending', 'Confirmed', 'Processing')`).get();
  const lowStock = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT p.id,
        (COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) -
         COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0)) AS stock,
        p.reorder_level AS reorder_level
      FROM products p
    )
    WHERE stock <= reorder_level OR stock <= 0
  `).get();

  const inventoryValue = db.prepare(`
    SELECT COALESCE(SUM(
      ((COALESCE((SELECT SUM(quantity_in) FROM inventory_transactions WHERE product_id = p.id), 0) - COALESCE((SELECT SUM(quantity_out) FROM inventory_transactions WHERE product_id = p.id), 0)) * p.purchase_rate)
    ), 0) AS total
    FROM products p
  `).get();

  res.json({
    monthlySales: Number(monthlySales.total || 0),
    pendingOrders: Number(pendingOrders.count || 0),
    lowStock: Number(lowStock.count || 0),
    inventoryValue: Number(inventoryValue.total || 0),
  });
});

app.get('/api/reports/net-sales', requireAdminAuth, (req, res) => {
  const fromDate = String(req.query.from_date || req.query.from || '').trim();
  const toDate = String(req.query.to_date || req.query.to || '').trim();
  const paymentMethod = String(req.query.payment_method || '').trim();
  const orderStatus = String(req.query.order_status || '').trim();
  const saleStatus = String(req.query.sale_status || '').trim();
  const returnStatus = String(req.query.return_status || '').trim();
  const customer = String(req.query.customer || '').trim();
  const invoiceNumber = String(req.query.invoice_number || '').trim();
  const orderNumber = String(req.query.order_number || '').trim();
  const search = String(req.query.search || '').trim();
  const returnStatusFilter = returnStatus || 'Approved';

  const params = [];
  const conditions = ['1 = 1'];

  if (fromDate) {
    conditions.push('date(i.invoice_date) >= date(?)');
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push('date(i.invoice_date) <= date(?)');
    params.push(toDate);
  }
  if (paymentMethod) {
    conditions.push('LOWER(COALESCE(i.payment_method, "")) = LOWER(?)');
    params.push(paymentMethod);
  }
  if (orderStatus) {
    conditions.push('LOWER(COALESCE(o.status, "")) = LOWER(?)');
    params.push(orderStatus);
  }
  if (saleStatus) {
    conditions.push('LOWER(COALESCE(i.payment_status, "")) = LOWER(?)');
    params.push(saleStatus);
  }
  if (customer) {
    const q = `%${customer.toLowerCase()}%`;
    conditions.push('(LOWER(COALESCE(c.name, o.customer_name, "")) LIKE ? OR LOWER(COALESCE(o.email, "")) LIKE ? OR LOWER(COALESCE(o.phone, "")) LIKE ?)');
    params.push(q, q, q);
  }
  if (invoiceNumber) {
    conditions.push('LOWER(COALESCE(i.invoice_number, "")) LIKE ?');
    params.push(`%${invoiceNumber.toLowerCase()}%`);
  }
  if (orderNumber) {
    conditions.push('LOWER(COALESCE(o.order_number, "")) LIKE ?');
    params.push(`%${orderNumber.toLowerCase()}%`);
  }
  if (search) {
    const q = `%${search.toLowerCase()}%`;
    conditions.push('(LOWER(COALESCE(i.invoice_number, "")) LIKE ? OR LOWER(COALESCE(o.order_number, "")) LIKE ? OR LOWER(COALESCE(c.name, o.customer_name, "")) LIKE ? OR LOWER(COALESCE(o.email, "")) LIKE ?)');
    params.push(q, q, q, q);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const rows = db.prepare(`
    SELECT
      i.id,
      i.invoice_number,
      i.order_id,
      o.order_number,
      COALESCE(c.name, o.customer_name, 'Walk-in Customer') AS customer_name,
      i.invoice_date,
      COALESCE(i.total, 0) AS gross_sale,
      COALESCE(i.payment_method, 'Cash') AS payment_method,
      COALESCE(i.payment_status, 'Unpaid') AS payment_status,
      COALESCE(o.status, 'Pending') AS order_status,
      COALESCE(sr.total_return_amount, 0) AS return_amount
    FROM sale_invoices i
    LEFT JOIN orders o ON o.id = i.order_id
    LEFT JOIN customers c ON c.id = i.customer_id
    LEFT JOIN (
      SELECT invoice_id, SUM(CASE WHEN status = ? THEN COALESCE(return_amount, 0) ELSE 0 END) AS total_return_amount
      FROM sale_returns
      WHERE status = ?
      GROUP BY invoice_id
    ) sr ON sr.invoice_id = i.id
    ${whereClause}
    ORDER BY i.invoice_date DESC, i.id DESC
  `).all(returnStatusFilter, returnStatusFilter, ...params);

  const grossSales = rows.reduce((sum, row) => sum + Number(row.gross_sale || 0), 0);
  const saleReturns = rows.reduce((sum, row) => sum + Number(row.return_amount || 0), 0);
  const netSales = Math.max(0, grossSales - saleReturns);
  const transactionCount = rows.length;
  const returnRate = grossSales > 0 ? (saleReturns / grossSales) * 100 : 0;

  const trend = db.prepare(`
    SELECT
      date(i.invoice_date) AS period,
      SUM(COALESCE(i.total, 0)) AS gross_sales,
      COALESCE(SUM(sr.total_return_amount), 0) AS sale_returns
    FROM sale_invoices i
    LEFT JOIN (
      SELECT invoice_id, SUM(CASE WHEN status = ? THEN COALESCE(return_amount, 0) ELSE 0 END) AS total_return_amount
      FROM sale_returns
      WHERE status = ?
      GROUP BY invoice_id
    ) sr ON sr.invoice_id = i.id
    ${whereClause}
    GROUP BY date(i.invoice_date)
    ORDER BY date(i.invoice_date) DESC
    LIMIT 30
  `).all(returnStatusFilter, returnStatusFilter, ...params)
    .map((entry) => ({
      period: entry.period,
      gross_sales: Number(entry.gross_sales || 0),
      sale_returns: Number(entry.sale_returns || 0),
      net_sales: Math.max(0, Number(entry.gross_sales || 0) - Number(entry.sale_returns || 0))
    }))
    .reverse();

  const normalizedRows = rows.map((row) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    order_number: row.order_number,
    customer_name: row.customer_name || 'Walk-in Customer',
    invoice_date: row.invoice_date,
    gross_sale: Number(row.gross_sale || 0),
    return_amount: Number(row.return_amount || 0),
    net_sale: Math.max(0, Number(row.gross_sale || 0) - Number(row.return_amount || 0)),
    payment_method: row.payment_method || 'Cash',
    payment_status: row.payment_status || 'Unpaid',
    order_status: row.order_status || 'Pending',
    return_status: returnStatusFilter
  }));

  res.json({
    summary: {
      gross_sales: Number(grossSales.toFixed(2)),
      sale_returns: Number(saleReturns.toFixed(2)),
      net_sales: Number(netSales.toFixed(2)),
      return_rate: Number(returnRate.toFixed(2)),
      transaction_count: transactionCount,
    },
    totals: {
      gross_sales: Number(grossSales.toFixed(2)),
      sale_returns: Number(saleReturns.toFixed(2)),
      net_sales: Number(netSales.toFixed(2)),
    },
    rows: normalizedRows,
    trend,
    filters: {
      from_date: fromDate,
      to_date: toDate,
      payment_method: paymentMethod,
      order_status: orderStatus,
      sale_status: saleStatus,
      return_status: returnStatusFilter,
      customer,
      invoice_number: invoiceNumber,
      order_number: orderNumber,
      search,
    },
    generated_at: new Date().toISOString()
  });
});

app.get('/api/reports/net-purchases', requireAdminAuth, (req, res) => {
  const purchases = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS gross_purchases,
      COUNT(*) AS number_of_purchases
    FROM purchases
  `).get();

  res.json({
    gross_purchases: Number(purchases.gross_purchases || 0),
    number_of_purchases: Number(purchases.number_of_purchases || 0),
    net_purchases: Number(purchases.gross_purchases || 0),
  });
});

function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

app.get('/admin/login.html', (req, res) => {
  setNoCacheHeaders(res);
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin');
  }
  return res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.get('/admin', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/products', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'products.html'));
});
app.get('/admin/products.html', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'products.html'));
});

app.get('/admin/inventory', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'inventory.html'));
});
app.get('/admin/inventory.html', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'inventory.html'));
});

app.get('/admin/purchases', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'purchases.html'));
});
app.get('/admin/purchases.html', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'purchases.html'));
});

app.get('/admin/reports', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'reports.html'));
});
app.get('/admin/reports.html', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'reports.html'));
});

app.get('/admin/orders', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'orders.html'));
});
app.get('/admin/orders.html', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'orders.html'));
});

app.get('/admin/settings', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'settings.html'));
});
app.get('/admin/settings.html', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'settings.html'));
});

app.get('/admin/company-settings', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'company-settings.html'));
});
app.get('/admin/company-settings.html', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'company-settings.html'));
});

app.get('/admin/accounts', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'accounts.html'));
});
app.get('/admin/accounts.html', requireAdminPage, (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'admin', 'accounts.html'));
});

app.get('/', (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'landing', 'index.html'));
});

app.get('/landing', (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'landing', 'index.html'));
});

app.get('/landing/', (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'landing', 'index.html'));
});

app.get('/landing.html', (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, 'landing', 'index.html'));
});

app.get('/invoice', (req, res) => {
  res.sendFile(path.join(__dirname, 'invoice.html'));
});

app.get('/track-order', (req, res) => {
  res.sendFile(path.join(__dirname, 'track-order.html'));
});

app.get('/track', (req, res) => {
  res.redirect('/track-order');
});

app.listen(PORT, () => {
  console.log(`Business Name system running on http://localhost:${PORT}`);
});
