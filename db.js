const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'shop.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pack_sizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    size TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER,
    brand TEXT,
    description TEXT,
    pack_size TEXT,
    unit TEXT,
    purchase_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    sale_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    image_url TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    opening_stock INTEGER NOT NULL DEFAULT 0,
    opening_stock_finalized INTEGER NOT NULL DEFAULT 0,
    opening_stock_locked_at TEXT,
    reorder_level INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS stock_movement_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    transaction_type TEXT NOT NULL DEFAULT 'OPENING_STOCK',
    reference_type TEXT,
    reference_id INTEGER,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
  );

  CREATE TABLE IF NOT EXISTS item_batch_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    transaction_type TEXT NOT NULL DEFAULT 'OPENING_STOCK',
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
  );

  CREATE TABLE IF NOT EXISTS opening_stock_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Finalized',
    finalized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    notes TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
  );

  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    is_main INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    company_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    credit_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    city TEXT,
    address TEXT,
    customer_code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER,
    customer_name TEXT,
    email TEXT,
    phone TEXT,
    city TEXT,
    delivery_address TEXT,
    order_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pending',
    payment_status TEXT NOT NULL DEFAULT 'Unpaid',
    delivery_status TEXT NOT NULL DEFAULT 'Pending',
    confirmed_at TEXT,
    confirmed_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    transaction_type TEXT NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    quantity_in INTEGER NOT NULL DEFAULT 0,
    quantity_out INTEGER NOT NULL DEFAULT 0,
    unit_cost DECIMAL(12,2) DEFAULT 0,
    previous_quantity INTEGER DEFAULT 0,
    new_quantity INTEGER DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    notes TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
  );

  CREATE TABLE IF NOT EXISTS product_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    batch_number TEXT NOT NULL,
    expiry_date TEXT,
    initial_quantity INTEGER NOT NULL DEFAULT 0,
    available_quantity INTEGER NOT NULL DEFAULT 0,
    purchase_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    supplier_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS order_item_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    invoice_id INTEGER,
    order_item_id INTEGER,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    quantity INTEGER NOT NULL DEFAULT 0,
    allocated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (invoice_id) REFERENCES sale_invoices(id),
    FOREIGN KEY (order_item_id) REFERENCES order_items(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_number TEXT NOT NULL UNIQUE,
    supplier_id INTEGER NOT NULL,
    purchase_date TEXT NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Draft',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(12,2) NOT NULL,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    line_total DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS purchase_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT NOT NULL UNIQUE,
    purchase_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    return_date TEXT NOT NULL,
    reason TEXT,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS purchase_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_return_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(12,2) NOT NULL,
    total DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS sale_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    order_id INTEGER NOT NULL,
    customer_id INTEGER,
    invoice_date TEXT NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'Unpaid',
    payment_method TEXT,
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_reference TEXT,
    captured_at TEXT,
    delivery_status TEXT NOT NULL DEFAULT 'Pending',
    dispatch_number TEXT,
    dispatch_date TEXT,
    expected_arrival_date TEXT,
    dispatch_note TEXT,
    dispatched_by TEXT,
    dispatched_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS sale_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES sale_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS sale_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT NOT NULL UNIQUE,
    invoice_id INTEGER NOT NULL,
    order_id INTEGER,
    customer_id INTEGER,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    return_reason TEXT,
    return_date TEXT NOT NULL,
    return_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pending',
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES sale_invoices(id),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS payment_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    invoice_id INTEGER,
    customer_id INTEGER,
    supplier_id INTEGER,
    account_id INTEGER,
    payment_reference TEXT,
    payment_method TEXT,
    entry_type TEXT NOT NULL DEFAULT 'Payment',
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    entry_date TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Captured',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (invoice_id) REFERENCES sale_invoices(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'gateway_clearing', 'other')),
    opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    current_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fund_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_account_id INTEGER NOT NULL,
    to_account_id INTEGER NOT NULL,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    transfer_date TEXT NOT NULL,
    reference_note TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_account_id) REFERENCES accounts(id),
    FOREIGN KEY (to_account_id) REFERENCES accounts(id),
    CHECK (from_account_id <> to_account_id)
  );

  CREATE TABLE IF NOT EXISTS supplier_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id INTEGER,
    entry_date TEXT NOT NULL,
    description TEXT,
    debit DECIMAL(12,2) NOT NULL DEFAULT 0,
    credit DECIMAL(12,2) NOT NULL DEFAULT 0,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_date TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Miscellaneous',
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    reference_no TEXT,
    created_by TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL DEFAULT 'Business Name',
    legal_business_name TEXT,
    business_type TEXT,
    company_registration_number TEXT,
    tax_number TEXT,
    industry_category TEXT,
    primary_phone TEXT,
    secondary_phone TEXT,
    email TEXT,
    website TEXT,
    whatsapp_number TEXT,
    address_line_1 TEXT,
    address_line_2 TEXT,
    area_locality TEXT,
    city TEXT,
    state_province TEXT,
    postal_code TEXT,
    country TEXT,
    logo_data_url TEXT,
    alternate_logo_data_url TEXT,
    document_header TEXT,
    document_footer TEXT,
    footer_tagline TEXT,
    terms_and_conditions TEXT,
    return_policy TEXT,
    payment_terms TEXT,
    general_notes TEXT,
    authorized_signature_name TEXT,
    authorized_signature_designation TEXT,
    signature_image_data_url TEXT,
    customer_support_contact TEXT,
    show_logo INTEGER NOT NULL DEFAULT 1,
    show_address INTEGER NOT NULL DEFAULT 1,
    show_phone INTEGER NOT NULL DEFAULT 1,
    show_email INTEGER NOT NULL DEFAULT 1,
    show_website INTEGER NOT NULL DEFAULT 1,
    show_tax_number INTEGER NOT NULL DEFAULT 1,
    show_authorized_signature INTEGER NOT NULL DEFAULT 1,
    currency TEXT NOT NULL DEFAULT 'GBP',
    currency_symbol TEXT NOT NULL DEFAULT '£',
    date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    time_format TEXT NOT NULL DEFAULT '24H',
    time_zone TEXT NOT NULL DEFAULT 'UTC',
    decimal_places INTEGER NOT NULL DEFAULT 2,
    number_formatting TEXT NOT NULL DEFAULT '1,234.56',
    tax_registration_number TEXT,
    default_tax_configuration TEXT,
    tax_display_preference TEXT NOT NULL DEFAULT 'Exclusive',
    tax_inclusive_preference INTEGER NOT NULL DEFAULT 0,
    invoice_prefix TEXT NOT NULL DEFAULT 'INV',
    invoice_number_format TEXT NOT NULL DEFAULT 'INV-YYYYMM-######',
    starting_number INTEGER NOT NULL DEFAULT 1,
    number_of_digits INTEGER NOT NULL DEFAULT 6,
    invoice_terms TEXT,
    default_notes TEXT,
    landing_hero_text TEXT NOT NULL DEFAULT 'Premium essentials for a refined everyday routine\nPremium wellness essentials for modern life.',
    landing_marquee_text TEXT NOT NULL DEFAULT 'Fast Delivery / Trusted Care / Secure Checkout / Premium Products',
    landing_hero_title TEXT NOT NULL DEFAULT 'Premium essentials for a refined everyday routine',
    landing_hero_subtitle TEXT NOT NULL DEFAULT 'Premium wellness essentials for modern life.',
    landing_service_fast_delivery TEXT NOT NULL DEFAULT 'Fast Delivery',
    landing_service_trusted_care TEXT NOT NULL DEFAULT 'Trusted Care',
    landing_service_secure_checkout TEXT NOT NULL DEFAULT 'Secure Checkout',
    landing_service_premium_products TEXT NOT NULL DEFAULT 'Premium Products',
    social_facebook TEXT,
    social_youtube TEXT,
    social_snapchat TEXT,
    social_tiktok TEXT,
    social_pinterest TEXT,
    social_canva TEXT,
    social_whatsapp TEXT,
    social_instagram TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_transactions(product_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id)
  );
`);

const seedRole = db.prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)');
['Owner', 'Manager', 'Cashier', 'WarehouseStaff', 'Accountant'].forEach((roleName) => seedRole.run(roleName));
const initialOwnerEmail = String(process.env.INITIAL_OWNER_EMAIL || '').trim().toLowerCase();
const initialOwnerPassword = String(process.env.INITIAL_OWNER_PASSWORD || '');
if (initialOwnerEmail && initialOwnerPassword && !db.prepare('SELECT id FROM users LIMIT 1').get()) {
  const ownerRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('Owner');
  db.prepare('INSERT INTO users (email, password_hash, display_name, role_id) VALUES (?, ?, ?, ?)').run(
    initialOwnerEmail, bcrypt.hashSync(initialOwnerPassword, 12), 'Initial Owner', ownerRole.id
  );
}

for (const [columnName, columnSql] of [
  ['landing_hero_text', 'TEXT DEFAULT "Premium essentials for a refined everyday routine\nPremium wellness essentials for modern life."'],
  ['landing_marquee_text', 'TEXT DEFAULT "Fast Delivery / Trusted Care / Secure Checkout / Premium Products"'],
  ['landing_hero_title', 'TEXT DEFAULT "Premium essentials for a refined everyday routine"'],
  ['landing_hero_subtitle', 'TEXT DEFAULT "Premium wellness essentials for modern life."'],
  ['landing_service_fast_delivery', 'TEXT DEFAULT "Fast Delivery"'],
  ['landing_service_trusted_care', 'TEXT DEFAULT "Trusted Care"'],
  ['landing_service_secure_checkout', 'TEXT DEFAULT "Secure Checkout"'],
  ['landing_service_premium_products', 'TEXT DEFAULT "Premium Products"'],
  ['social_facebook', 'TEXT'],
  ['social_youtube', 'TEXT'],
  ['social_snapchat', 'TEXT'],
  ['social_tiktok', 'TEXT'],
  ['social_pinterest', 'TEXT'],
  ['social_canva', 'TEXT'],
  ['social_whatsapp', 'TEXT'],
  ['social_instagram', 'TEXT']
]) {
  try {
    db.prepare(`ALTER TABLE company_settings ADD COLUMN ${columnName} ${columnSql}`).run();
  } catch (error) {
    // Column already exists in newer databases.
  }
}

const defaultCategories = ['Skincare', 'Health & Wellbeing', 'Eye Care'];
const defaultBrands = ['CeraVe', 'Eucerin', 'Evacal', 'HuxD3', 'Laxido', 'Gaviscon', 'Centrum', 'Vitabiotics', 'Optrex', 'Pregnacare'];
const defaultPackSizes = ['52ml', '236ml', '30g', '30ml', '50ml', '75ml', '400ml', '56 tablets', '20 capsules', '20 sachets', '500ml', '30 tablets', '84 tablets', '10ml', '30 gummies'];
const defaultProducts = [
  { sku: 'CERA-PM', name: 'CeraVe PM Facial Moisturizing Lotion', category: 'Skincare', brand: 'CeraVe', description: 'Lightweight evening hydration for healthy, balanced skin', pack_size: '52ml', unit: 'Bottle', purchase_rate: 8.60, sale_rate: 13.80, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/cerave_pm_facial_moisturizing_lotion_800x800.jpg?v=1733931715', active: 1, opening_stock: 35, reorder_level: 10 },
  { sku: 'CERA-BCC', name: 'CeraVe Blemish Control Cleanser', category: 'Skincare', brand: 'CeraVe', description: 'Cleansing support for blemish-prone skin', pack_size: '236ml', unit: 'Bottle', purchase_rate: 6.30, sale_rate: 10.40, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/Cerave_Blemish_Control_Cleanser_800x800.jpg?v=1732207061', active: 1, opening_stock: 24, reorder_level: 8 },
  { sku: 'CERA-BCG', name: 'CeraVe Blemish Control Gel', category: 'Skincare', brand: 'CeraVe', description: 'Targeted skincare for visible blemishes', pack_size: '30g', unit: 'Tube', purchase_rate: 6.75, sale_rate: 10.99, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/Cerave_Blemish_Control_Gel_800x800.webp?v=1733923899', active: 1, opening_stock: 20, reorder_level: 8 },
  { sku: 'CERA-HL', name: 'CeraVe Hydrating Hyaluronic Acid Serum', category: 'Skincare', brand: 'CeraVe', description: 'Deep hydration for a plump, healthy-looking complexion', pack_size: '30ml', unit: 'Bottle', purchase_rate: 10.40, sale_rate: 17.99, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/cerave_hyaluronic_acid_serum_800x800.jpg?v=1733939145', active: 1, opening_stock: 18, reorder_level: 8 },
  { sku: 'CERA-FOAM', name: 'CeraVe Foaming Facial Cleanser 236ML', category: 'Skincare', brand: 'CeraVe', description: 'Refreshing daily cleanser for oily and combination skin', pack_size: '236ml', unit: 'Bottle', purchase_rate: 6.25, sale_rate: 10.99, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/foaming-cleanser-236ml_800x800.webp?v=1738934763', active: 1, opening_stock: 28, reorder_level: 9 },
  { sku: 'EUC-UREA-FACE', name: 'Eucerin Urea Repair Face Cream 50ml', category: 'Skincare', brand: 'Eucerin', description: 'Rich care for dry, rough skin', pack_size: '50ml', unit: 'Tube', purchase_rate: 8.10, sale_rate: 13.90, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/eucerin_urea_repair_face_cream_800x800.webp?v=1732551361', active: 1, opening_stock: 12, reorder_level: 6 },
  { sku: 'EUC-HAND', name: 'Eucerin UreaRepair 5% Urea Hand Cream', category: 'Skincare', brand: 'Eucerin', description: 'Hand care for dry, hardworking hands', pack_size: '75ml', unit: 'Tube', purchase_rate: 4.70, sale_rate: 7.84, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/Eucerin_Urea_Repair_Plus_5_Urea_Hand_Cream_800x800.webp?v=1746035656', active: 1, opening_stock: 30, reorder_level: 9 },
  { sku: 'EUC-BATH', name: 'Eucerin Atopicontrol Bath And Shower Oil', category: 'Skincare', brand: 'Eucerin', description: 'Gentle cleansing support for sensitive skin', pack_size: '400ml', unit: 'Bottle', purchase_rate: 8.60, sale_rate: 13.99, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/Eucerin_Atopicontrol_Bath_And_Shower_Oil_400ml_800x800.jpg?v=1734626658', active: 1, opening_stock: 19, reorder_level: 7 },
  { sku: 'EVACAL-D3', name: 'Evacal D3 Chewable Tablets', category: 'Health & Wellbeing', brand: 'Evacal', description: 'Vitamin D support in a convenient chewable format', pack_size: '56 tablets', unit: 'Pack', purchase_rate: 2.90, sale_rate: 5.85, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/Evacal_D3_1500mg_400iu_Chewable_Tablets_Pack_of_56_Tablets_800x800.webp?v=1748277259', active: 1, opening_stock: 40, reorder_level: 12 },
  { sku: 'HUX-D3', name: 'HuxD3 Capsules 20000IU Colecalciferol', category: 'Health & Wellbeing', brand: 'HuxD3', description: 'Vitamin D3 support with a simple capsule format', pack_size: '20 capsules', unit: 'Pack', purchase_rate: 1.90, sale_rate: 3.60, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/HuxD3_Capsules_20000IU_Colecalciferol_20_caps_800x800.webp?v=1764430889', active: 1, opening_stock: 56, reorder_level: 12 },
  { sku: 'LAXIDO-ORANGE', name: 'Laxido Orange', category: 'Health & Wellbeing', brand: 'Laxido', description: 'Comfortable bowel habit support', pack_size: '20 sachets', unit: 'Pack', purchase_rate: 3.10, sale_rate: 5.95, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/laxido_orange_sugar_free_sachets_20s_800x800.jpg?v=1766253717', active: 1, opening_stock: 26, reorder_level: 8 },
  { sku: 'GAVISCON-ADV', name: 'Gaviscon Advanced Peppermint', category: 'Health & Wellbeing', brand: 'Gaviscon', description: 'Fast relief for heartburn and indigestion', pack_size: '500ml', unit: 'Bottle', purchase_rate: 1.20, sale_rate: 2.15, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/Gaviscon_Advanced_Peppermint_500ml_800x800.jpg?v=1751026083', active: 1, opening_stock: 48, reorder_level: 12 },
  { sku: 'CENTRUM-MEN', name: 'Centrum Men', category: 'Health & Wellbeing', brand: 'Centrum', description: 'Daily multivitamin support for men', pack_size: '30 tablets', unit: 'Pack', purchase_rate: 3.80, sale_rate: 6.10, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/Centrum_Men_30_Tablets_Front_800x800.webp?v=1742197476', active: 1, opening_stock: 32, reorder_level: 10 },
  { sku: 'PERFECTIL-MAX', name: 'Vitabiotics Perfectil Max', category: 'Health & Wellbeing', brand: 'Vitabiotics', description: 'Advanced beauty and wellbeing support', pack_size: '84 tablets', unit: 'Pack', purchase_rate: 11.40, sale_rate: 18.99, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/vitabiotics_perfectil_max_84_tablets_capsules_800x800.png?v=1731779027', active: 1, opening_stock: 16, reorder_level: 7 },
  { sku: 'OPTREX-EYE', name: 'Optrex Infected Eye Drops', category: 'Eye Care', brand: 'Optrex', description: 'Comfort for irritated and sensitive eyes', pack_size: '10ml', unit: 'Bottle', purchase_rate: 4.65, sale_rate: 8.39, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/Optrex-Infected-Eyes-Eye-Drops_800x800.jpg?v=1732967289', active: 1, opening_stock: 22, reorder_level: 8 },
  { sku: 'PREGNACARE-GUM', name: 'Pregnacare Gummies', category: 'Health & Wellbeing', brand: 'Pregnacare', description: 'Easy everyday support for wellness routines', pack_size: '30 gummies', unit: 'Pack', purchase_rate: 4.90, sale_rate: 8.95, tax_rate: 0, image_url: 'https://instantpharmacy.uk/cdn/shop/files/pregnacare_gummies_800x800.webp?v=1732039754', active: 1, opening_stock: 27, reorder_level: 8 }
];

function ensureCategories() {
  for (const category of defaultCategories) {
    db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(category);
  }
}

function ensureReferenceLists() {
  for (const brand of defaultBrands) {
    db.prepare('INSERT OR IGNORE INTO brands (name) VALUES (?)').run(brand);
  }

  for (const size of defaultPackSizes) {
    db.prepare('INSERT OR IGNORE INTO pack_sizes (size) VALUES (?)').run(size);
  }
}

function ensureSeedProducts() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  if (count > 0) return;

  for (const product of defaultProducts) {
    const categoryRow = db.prepare('SELECT id FROM categories WHERE name = ?').get(product.category);
    const insert = db.prepare(`
      INSERT INTO products (sku, name, category_id, brand, description, pack_size, unit, purchase_rate, sale_rate, tax_rate, image_url, active, opening_stock, reorder_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      product.sku,
      product.name,
      categoryRow ? categoryRow.id : null,
      product.brand,
      product.description,
      product.pack_size,
      product.unit,
      product.purchase_rate,
      product.sale_rate,
      product.tax_rate,
      product.image_url,
      product.active,
      product.opening_stock,
      product.reorder_level
    );
  }

  for (const product of defaultProducts) {
    const row = db.prepare('SELECT id FROM products WHERE sku = ?').get(product.sku);
    if (!row) continue;
    db.prepare('INSERT INTO product_images (product_id, image_url, is_main) VALUES (?, ?, 1)').run(row.id, product.image_url);
  }

  const openingStockRows = db.prepare('SELECT id, opening_stock FROM products').all();
  for (const product of openingStockRows) {
    if (product.opening_stock <= 0) continue;
    db.prepare(`
      INSERT INTO inventory_transactions (product_id, transaction_type, reference_type, reference_id, quantity_in, quantity_out, unit_cost, notes)
      VALUES (?, 'Opening Stock', 'Product', ?, ?, 0, ?, 'Initial stock balance')
    `).run(product.id, product.id, product.opening_stock, 0);
  }
}

function ensurePaymentLedgerColumns() {
  const columns = db.prepare('PRAGMA table_info(payment_ledger)').all();
  const existing = new Set(columns.map((column) => column.name));
  const changes = [
    ['customer_id', 'INTEGER'],
    ['supplier_id', 'INTEGER'],
    ['account_id', 'INTEGER'],
  ];

  for (const [columnName, definition] of changes) {
    if (!existing.has(columnName)) {
      db.exec(`ALTER TABLE payment_ledger ADD COLUMN ${columnName} ${definition};`);
    }
  }

  const orderIdColumn = columns.find((column) => column.name === 'order_id');
  if (orderIdColumn && orderIdColumn.notnull === 1) {
    db.exec(`
      CREATE TABLE payment_ledger_migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        invoice_id INTEGER,
        customer_id INTEGER,
        supplier_id INTEGER,
        payment_reference TEXT,
        payment_method TEXT,
        entry_type TEXT NOT NULL DEFAULT 'Payment',
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        balance DECIMAL(12,2) NOT NULL DEFAULT 0,
        entry_date TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'Captured',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO payment_ledger_migration (id, order_id, invoice_id, customer_id, supplier_id, payment_reference, payment_method, entry_type, amount, balance, entry_date, description, status, created_at)
      SELECT id, order_id, invoice_id, NULL, NULL, payment_reference, payment_method, entry_type, amount, balance, entry_date, description, status, created_at
      FROM payment_ledger;

      DROP TABLE payment_ledger;
      ALTER TABLE payment_ledger_migration RENAME TO payment_ledger;
    `);
  }
}

function ensureInvoicePaymentColumns() {
  const columns = db.prepare('PRAGMA table_info(sale_invoices)').all();
  const existing = new Set(columns.map((column) => column.name));
  const changes = [
    ['payment_method', 'TEXT'],
    ['paid_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0'],
    ['payment_reference', 'TEXT'],
    ['captured_at', 'TEXT'],
    ['dispatch_number', 'TEXT'],
    ['dispatch_date', 'TEXT'],
    ['expected_arrival_date', 'TEXT'],
    ['dispatch_note', 'TEXT'],
    ['dispatched_by', 'TEXT'],
    ['dispatched_at', 'TEXT'],
    ['created_by', 'TEXT'],
  ];

  for (const [columnName, definition] of changes) {
    if (!existing.has(columnName)) {
      db.exec(`ALTER TABLE sale_invoices ADD COLUMN ${columnName} ${definition};`);
    }
  }
}

function ensureInventoryAuditColumns() {
  const columns = db.prepare('PRAGMA table_info(inventory_transactions)').all();
  const existing = new Set(columns.map((column) => column.name));
  const changes = [
    ['batch_id', 'INTEGER'],
    ['previous_quantity', 'INTEGER DEFAULT 0'],
    ['new_quantity', 'INTEGER DEFAULT 0'],
    ['created_by', 'TEXT'],
    ['updated_by', 'TEXT'],
    ['updated_at', 'TEXT'],
  ];

  for (const [columnName, definition] of changes) {
    if (!existing.has(columnName)) {
      db.exec(`ALTER TABLE inventory_transactions ADD COLUMN ${columnName} ${definition};`);
    }
  }
}

function ensureBatchTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      batch_number TEXT NOT NULL,
      expiry_date TEXT,
      initial_quantity INTEGER NOT NULL DEFAULT 0,
      available_quantity INTEGER NOT NULL DEFAULT 0,
      purchase_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      supplier_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_item_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      invoice_id INTEGER,
      order_item_id INTEGER,
      product_id INTEGER NOT NULL,
      batch_id INTEGER,
      quantity INTEGER NOT NULL DEFAULT 0,
      allocated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES sale_invoices(id),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (batch_id) REFERENCES product_batches(id)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_product_batches_product ON product_batches(product_id, expiry_date);
    CREATE INDEX IF NOT EXISTS idx_order_item_batches_order ON order_item_batches(order_id, product_id);
  `);

  const productBatchColumns = db.prepare('PRAGMA table_info(product_batches)').all();
  const productIdColumn = productBatchColumns.find((column) => column.name === 'product_id');
  if (productIdColumn && productIdColumn.notnull === 1) {
    db.exec(`
      CREATE TABLE product_batches_migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        batch_number TEXT NOT NULL,
        expiry_date TEXT,
        initial_quantity INTEGER NOT NULL DEFAULT 0,
        available_quantity INTEGER NOT NULL DEFAULT 0,
        purchase_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
        supplier_name TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO product_batches_migration (id, product_id, batch_number, expiry_date, initial_quantity, available_quantity, purchase_cost, supplier_name, created_at, updated_at)
      SELECT id, product_id, batch_number, expiry_date, initial_quantity, available_quantity, purchase_cost, supplier_name, created_at, updated_at
      FROM product_batches;

      DROP TABLE product_batches;
      ALTER TABLE product_batches_migration RENAME TO product_batches;
    `);
  }

  const existingProductBatchColumns = new Set(productBatchColumns.map((column) => column.name));
  const batchFieldChanges = [
    ['product_id', 'INTEGER'],
    ['batch_number', 'TEXT'],
    ['expiry_date', 'TEXT'],
    ['initial_quantity', 'INTEGER DEFAULT 0'],
    ['available_quantity', 'INTEGER DEFAULT 0'],
    ['purchase_cost', 'DECIMAL(12,2) DEFAULT 0'],
    ['supplier_name', 'TEXT'],
  ];
  for (const [columnName, definition] of batchFieldChanges) {
    if (!existingProductBatchColumns.has(columnName)) {
      db.exec(`ALTER TABLE product_batches ADD COLUMN ${columnName} ${definition};`);
    }
  }
}

function ensureProductBatchesFromStock() {
  const products = db.prepare('SELECT id, sku, name FROM products WHERE deleted_at IS NULL').all();
  for (const product of products) {
    const stockRow = db.prepare(`
      SELECT COALESCE(SUM(quantity_in), 0) - COALESCE(SUM(quantity_out), 0) AS current_stock
      FROM inventory_transactions
      WHERE product_id = ?
    `).get(product.id);
    const currentStock = Number(stockRow?.current_stock || 0);
    if (currentStock <= 0) continue;

    const existingBatch = db.prepare('SELECT id FROM product_batches WHERE product_id = ? ORDER BY created_at DESC LIMIT 1').get(product.id);
    if (existingBatch) continue;

    const batchNumber = `${String(product.sku || product.name || 'PROD').replace(/\s+/g, '-').toUpperCase()}-B1`;
    db.prepare(`
      INSERT INTO product_batches (product_id, batch_number, expiry_date, initial_quantity, available_quantity, purchase_cost, supplier_name)
      VALUES (?, ?, DATE('now', '+365 days'), ?, ?, 0, 'Supplier')
    `).run(product.id, batchNumber, currentStock, currentStock);
  }
}

function ensureOpeningStockSchema() {
  const productColumns = db.prepare('PRAGMA table_info(products)').all();
  const productNames = new Set(productColumns.map((column) => column.name));
  const productUpdates = [
    ['opening_stock_finalized', 'INTEGER NOT NULL DEFAULT 0'],
    ['opening_stock_locked_at', 'TEXT'],
  ];

  for (const [columnName, definition] of productUpdates) {
    if (!productNames.has(columnName)) {
      db.exec(`ALTER TABLE products ADD COLUMN ${columnName} ${definition};`);
    }
  }

  const stockLedgerColumns = db.prepare('PRAGMA table_info(stock_movement_ledger)').all();
  if (!stockLedgerColumns.length) {
    db.exec(`
      CREATE TABLE stock_movement_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        batch_id INTEGER,
        transaction_type TEXT NOT NULL DEFAULT 'OPENING_STOCK',
        reference_type TEXT,
        reference_id INTEGER,
        quantity INTEGER NOT NULL DEFAULT 0,
        unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (batch_id) REFERENCES product_batches(id)
      );
    `);
  }

  const itemBatchLedgerColumns = db.prepare('PRAGMA table_info(item_batch_ledger)').all();
  if (!itemBatchLedgerColumns.length) {
    db.exec(`
      CREATE TABLE item_batch_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        batch_id INTEGER,
        transaction_type TEXT NOT NULL DEFAULT 'OPENING_STOCK',
        quantity INTEGER NOT NULL DEFAULT 0,
        unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (batch_id) REFERENCES product_batches(id)
      );
    `);
  }

  const openingEntriesColumns = db.prepare('PRAGMA table_info(opening_stock_entries)').all();
  if (!openingEntriesColumns.length) {
    db.exec(`
      CREATE TABLE opening_stock_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        batch_id INTEGER,
        quantity INTEGER NOT NULL DEFAULT 0,
        unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Finalized',
        finalized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        locked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        notes TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (batch_id) REFERENCES product_batches(id)
      );
    `);
  }
}

function ensureOrderCustomerColumns() {
  const orderColumns = db.prepare('PRAGMA table_info(orders)').all();
  const existingOrders = new Set(orderColumns.map((column) => column.name));
  const orderChanges = [
    ['city', 'TEXT'],
    ['confirmed_at', 'TEXT'],
    ['confirmed_by', 'TEXT'],
  ];
  for (const [columnName, definition] of orderChanges) {
    if (!existingOrders.has(columnName)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${columnName} ${definition};`);
    }
  }

  const customerColumns = db.prepare('PRAGMA table_info(customers)').all();
  const existingCustomers = new Set(customerColumns.map((column) => column.name));
  const customerChanges = [
    ['city', 'TEXT'],
    ['customer_code', 'TEXT'],
  ];
  for (const [columnName, definition] of customerChanges) {
    if (!existingCustomers.has(columnName)) {
      db.exec(`ALTER TABLE customers ADD COLUMN ${columnName} ${definition};`);
    }
  }

  const returnColumns = db.prepare('PRAGMA table_info(sale_returns)').all();
  const existingReturns = new Set(returnColumns.map((column) => column.name));
  const returnChanges = [
    ['unit_price', 'DECIMAL(12,2) NOT NULL DEFAULT 0'],
    ['created_by', 'TEXT'],
  ];
  for (const [columnName, definition] of returnChanges) {
    if (!existingReturns.has(columnName)) {
      db.exec(`ALTER TABLE sale_returns ADD COLUMN ${columnName} ${definition};`);
    }
  }
}

ensureCategories();
ensureReferenceLists();
ensureSeedProducts();
ensurePaymentLedgerColumns();
ensureInvoicePaymentColumns();
ensureOrderCustomerColumns();
ensureInventoryAuditColumns();
ensureBatchTables();
ensureProductBatchesFromStock();
ensureOpeningStockSchema();

function ensureExpensesTable() {
  const columns = db.prepare('PRAGMA table_info(expenses)').all();
  const existing = new Set(columns.map((column) => column.name));
  const changes = [
    ['expense_date', 'TEXT'],
    ['category', 'TEXT'],
    ['description', 'TEXT'],
    ['amount', 'DECIMAL(12,2) DEFAULT 0'],
    ['payment_method', 'TEXT'],
    ['reference_no', 'TEXT'],
    ['created_by', 'TEXT'],
    ['created_at', 'TEXT'],
  ];

  for (const [columnName, definition] of changes) {
    if (!existing.has(columnName)) {
      db.exec(`ALTER TABLE expenses ADD COLUMN ${columnName} ${definition};`);
    }
  }
}

function ensureCompanySettingsColumns() {
  const columns = db.prepare('PRAGMA table_info(company_settings)').all();
  const existing = new Set(columns.map((column) => column.name));
  const changes = [
    ['company_name', 'TEXT DEFAULT "Business Name"'],
    ['legal_business_name', 'TEXT'],
    ['business_type', 'TEXT'],
    ['company_registration_number', 'TEXT'],
    ['tax_number', 'TEXT'],
    ['industry_category', 'TEXT'],
    ['primary_phone', 'TEXT'],
    ['secondary_phone', 'TEXT'],
    ['email', 'TEXT'],
    ['website', 'TEXT'],
    ['whatsapp_number', 'TEXT'],
    ['address_line_1', 'TEXT'],
    ['address_line_2', 'TEXT'],
    ['area_locality', 'TEXT'],
    ['city', 'TEXT'],
    ['state_province', 'TEXT'],
    ['postal_code', 'TEXT'],
    ['country', 'TEXT'],
    ['logo_data_url', 'TEXT'],
    ['alternate_logo_data_url', 'TEXT'],
    ['document_header', 'TEXT'],
    ['document_footer', 'TEXT'],
    ['footer_tagline', 'TEXT'],
    ['terms_and_conditions', 'TEXT'],
    ['return_policy', 'TEXT'],
    ['payment_terms', 'TEXT'],
    ['general_notes', 'TEXT'],
    ['authorized_signature_name', 'TEXT'],
    ['authorized_signature_designation', 'TEXT'],
    ['signature_image_data_url', 'TEXT'],
    ['customer_support_contact', 'TEXT'],
    ['show_logo', 'INTEGER DEFAULT 1'],
    ['show_address', 'INTEGER DEFAULT 1'],
    ['show_phone', 'INTEGER DEFAULT 1'],
    ['show_email', 'INTEGER DEFAULT 1'],
    ['show_website', 'INTEGER DEFAULT 1'],
    ['show_tax_number', 'INTEGER DEFAULT 1'],
    ['show_authorized_signature', 'INTEGER DEFAULT 1'],
    ['currency', 'TEXT DEFAULT "GBP"'],
    ['currency_symbol', 'TEXT DEFAULT "£"'],
    ['date_format', 'TEXT DEFAULT "DD/MM/YYYY"'],
    ['time_format', 'TEXT DEFAULT "24H"'],
    ['time_zone', 'TEXT DEFAULT "UTC"'],
    ['decimal_places', 'INTEGER DEFAULT 2'],
    ['number_formatting', 'TEXT DEFAULT "1,234.56"'],
    ['tax_registration_number', 'TEXT'],
    ['default_tax_configuration', 'TEXT'],
    ['tax_display_preference', 'TEXT DEFAULT "Exclusive"'],
    ['tax_inclusive_preference', 'INTEGER DEFAULT 0'],
    ['invoice_prefix', 'TEXT DEFAULT "INV"'],
    ['invoice_number_format', 'TEXT DEFAULT "INV-YYYYMM-######"'],
    ['starting_number', 'INTEGER DEFAULT 1'],
    ['number_of_digits', 'INTEGER DEFAULT 6'],
    ['free_delivery_threshold', 'DECIMAL(12,2) DEFAULT 35'],
    ['invoice_terms', 'TEXT'],
    ['default_notes', 'TEXT'],
    ['social_facebook', 'TEXT'],
    ['social_youtube', 'TEXT'],
    ['social_snapchat', 'TEXT'],
    ['social_tiktok', 'TEXT'],
    ['social_pinterest', 'TEXT'],
    ['social_canva', 'TEXT'],
    ['social_whatsapp', 'TEXT'],
    ['social_instagram', 'TEXT'],
  ];

  for (const [columnName, definition] of changes) {
    if (!existing.has(columnName)) {
      db.exec(`ALTER TABLE company_settings ADD COLUMN ${columnName} ${definition};`);
    }
  }
}

function ensureCompanySettings() {
  const hasRow = db.prepare('SELECT COUNT(*) AS count FROM company_settings').get().count;
  if (hasRow > 0) return;
  db.prepare(`
    INSERT INTO company_settings (
      company_name, legal_business_name, business_type, company_registration_number, tax_number, industry_category,
      primary_phone, secondary_phone, email, website, whatsapp_number,
      address_line_1, address_line_2, area_locality, city, state_province, postal_code, country,
      logo_data_url, alternate_logo_data_url, document_header, document_footer, footer_tagline, terms_and_conditions, return_policy, payment_terms, general_notes,
      authorized_signature_name, authorized_signature_designation, signature_image_data_url, customer_support_contact,
      show_logo, show_address, show_phone, show_email, show_website, show_tax_number, show_authorized_signature,
      currency, currency_symbol, date_format, time_format, time_zone, decimal_places, number_formatting,
      tax_registration_number, default_tax_configuration, tax_display_preference, tax_inclusive_preference,
      invoice_prefix, invoice_number_format, starting_number, number_of_digits, invoice_terms, default_notes,
      social_facebook, social_youtube, social_snapchat, social_tiktok, social_pinterest, social_canva, social_whatsapp, social_instagram
    ) VALUES (
      'Business Name', 'Business Name Ltd', 'Business', '', '', 'Retail',
      '+44 20 0000 0000', '', 'sales@yourbusiness.com', 'https://yourbusiness.com', '+44 7000 000000',
      '123 Wellness Street', '', 'City Centre', 'London', 'Greater London', 'SW1A 1AA', 'United Kingdom',
      '', '', '', 'Your trusted destination for premium essentials, dependable delivery, and a refined shopping experience.', 'Please pay within 30 days. Goods remain the property of the seller until full payment is received.', 'Returns accepted within 14 days for sealed items in original packaging.', 'Payment due upon receipt. All invoices are due net 30 days.', 'Thank you for your business.',
      'Operations Director', 'Director', '', 'Customer support: +44 20 0000 0000',
      1, 1, 1, 1, 1, 1, 1,
      'GBP', '£', 'DD/MM/YYYY', '24H', 'UTC', 2, '1,234.56',
      '', 'Standard VAT', 'Exclusive', 0,
      'INV', 'INV-YYYYMM-######', 1, 6, 35, 'Net 30 days', 'Thank you for shopping with Business Name.',
      '', '', '', '', '', '', '', ''
    )
  `).run();
}

ensureExpensesTable();
ensureCompanySettingsColumns();
ensureCompanySettings();

db.exec(`
  CREATE TABLE IF NOT EXISTS payment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    order_id INTEGER,
    payload TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, event_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    ip_address TEXT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_knowledge_base (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );
  CREATE TABLE IF NOT EXISTS ai_assistant_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 1,
    marketing_tones TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );
  CREATE TABLE IF NOT EXISTS ai_provider_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider TEXT NOT NULL DEFAULT 'anthropic' CHECK (provider IN ('anthropic', 'openai')),
    api_key_encrypted TEXT,
    api_key_last4 TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );
  CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    low_stock_enabled INTEGER NOT NULL DEFAULT 0,
    low_stock_emails TEXT NOT NULL DEFAULT '',
    low_stock_sms_phone TEXT NOT NULL DEFAULT '',
    complaint_enabled INTEGER NOT NULL DEFAULT 0,
    complaint_emails TEXT NOT NULL DEFAULT '',
    complaint_sms_phone TEXT NOT NULL DEFAULT '',
    contact_request_enabled INTEGER NOT NULL DEFAULT 0,
    contact_request_emails TEXT NOT NULL DEFAULT '',
    contact_request_sms_phone TEXT NOT NULL DEFAULT '',
    dispatch_internal_enabled INTEGER NOT NULL DEFAULT 0,
    dispatch_internal_emails TEXT NOT NULL DEFAULT '',
    dispatch_internal_sms_phone TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );
  CREATE TABLE IF NOT EXISTS agent_contact_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    contact_method TEXT NOT NULL,
    contact_value TEXT NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS customer_complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_number TEXT NOT NULL UNIQUE,
    customer_name TEXT,
    contact_method TEXT,
    contact_value TEXT,
    order_id INTEGER,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );
`);
db.prepare(`INSERT OR IGNORE INTO ai_assistant_settings (id, enabled, marketing_tones) VALUES (1, 1, ?)`).run(JSON.stringify([
  'Welcome. How may we assist you today?',
  'We are pleased to help you find the right product.',
  'Thank you for choosing our store.',
  'Our team is here to provide clear, dependable support.',
  'We appreciate the opportunity to assist you.'
]));
db.prepare(`INSERT OR IGNORE INTO ai_provider_settings (id, provider) VALUES (1, 'anthropic')`).run();
db.prepare(`INSERT OR IGNORE INTO notification_settings (id) VALUES (1)`).run();

function getProductStock(productId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(quantity_in), 0) - COALESCE(SUM(quantity_out), 0) AS total
    FROM inventory_transactions
    WHERE product_id = ?
  `).get(productId);

  return Number(row?.total || 0);
}

function formatDate(date = new Date()) {
  return new Date(date).toISOString();
}

module.exports = {
  db,
  getProductStock,
  formatDate,
};
