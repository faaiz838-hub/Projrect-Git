const Database = require('better-sqlite3');
const db = new Database('./data/shop.db');
const tables = [
  'sale_returns',
  'sale_invoice_items',
  'sale_invoices',
  'order_item_batches',
  'order_items',
  'orders',
  'purchase_return_items',
  'purchase_returns',
  'purchase_items',
  'purchases',
  'payment_ledger',
  'supplier_ledger',
  'expenses',
  'inventory_transactions',
  'stock_movement_ledger',
  'item_batch_ledger',
  'opening_stock_entries',
  'product_batches'
];
for (const table of tables) {
  db.prepare(`DELETE FROM ${table}`).run();
  db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(table);
  const count = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  console.log(`${table}: ${count}`);
}
db.close();
