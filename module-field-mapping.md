# ERP Module-to-Database Field Mapping

This document maps the admin screens and actions in the app to the database tables and key fields they read or write. It reflects the runtime implementation in [server.js](server.js) and the schema in [db.js](db.js).

## 1) Core table groups

### Catalog and product master
- `categories` — product categories
- `brands` — product brands
- `pack_sizes` — pack size catalog
- `products` — product master data
- `product_images` — product gallery/image records

### Inventory and batch control
- `inventory_transactions` — stock movements, opening stock, adjustments, purchases, sales, dispatch, returns
- `product_batches` — item batch records (batch number, expiry, available qty)
- `order_item_batches` — allocations of stock to order/invoice items

### Suppliers, purchases and returns
- `suppliers` — supplier master
- `purchases` — purchase documents
- `purchase_items` — purchase lines
- `purchase_returns` — supplier return documents
- `purchase_return_items` — supplier return lines
- `supplier_ledger` — supplier balances

### Orders, customers and sales
- `customers` — customer master
- `orders` — sales orders
- `order_items` — order lines
- `sale_invoices` — invoice documents
- `sale_invoice_items` — invoice lines
- `sale_returns` — customer returns
- `payment_ledger` — payments and balances

### Company and settings
- `company_settings` — branding, legal, invoice metadata

---

## 2) Dashboard

### Screen
- `/admin` / `admin/index.html`

### API endpoints
- `GET /api/dashboard/kpis`

### Actions / usage
- View KPI summary
- Display monthly sales, pending orders, low stock, inventory value

### Tables used
- `orders` — order count and status totals
- `products` — stock and reorder comparisons
- `inventory_transactions` — current stock calculations
- `sale_invoices` — sales totals and invoice status reporting

### Key fields
- `orders.order_total`, `orders.status`, `orders.created_at`
- `products.reorder_level`, `products.purchase_rate`
- `inventory_transactions.quantity_in`, `inventory_transactions.quantity_out`
- `sale_invoices.total`, `sale_invoices.invoice_date`

---

## 3) Products module

### Screen
- `/admin/products` / `admin/products.html`

### API endpoints
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products`
- `PUT /api/products/:id`
- `PATCH /api/products/:id/status`
- `DELETE /api/products/:id`
- `GET /api/products/:id/batches`

### Actions / usage
- Add new product
- Edit product
- Toggle active/inactive status
- Delete/deactivate product
- View product detail and batch list

### Tables used
- `products` — master product row
- `categories` — category assignment
- `product_images` — product image
- `inventory_transactions` — opening stock and stock movement
- `product_batches` — batch records linked to product

### Key fields
- `products.sku`, `products.name`, `products.brand`, `products.pack_size`, `products.unit`
- `products.purchase_rate`, `products.sale_rate`, `products.tax_rate`
- `products.opening_stock`, `products.reorder_level`, `products.active`
- `product_images.image_url`
- `product_batches.batch_number`, `product_batches.expiry_date`, `product_batches.available_quantity`

---

## 4) Inventory module

### Screen
- `/admin/inventory` / `admin/inventory.html`

### API endpoints
- `GET /api/inventory`
- `GET /api/inventory/summary`
- `GET /api/inventory/adjustments`
- `GET /api/inventory/adjustments/:id`
- `GET /api/item-batch-ledger`
- `GET /api/inventory/ledger`
- `GET /api/inventory/low-stock`
- `GET /api/inventory/dead-stock`
- `GET /api/inventory/transactions`
- `POST /api/inventory/adjust`

### Actions / usage
- View stock register
- Filter by category, brand, status, search
- Record stock in/out adjustments
- Review ledger and audit trail
- Check low stock and dead stock
- Inspect batch ledger for each item

### Tables used
- `products` — item master and reorder controls
- `inventory_transactions` — stock changes and audit trail
- `product_batches` — batch balance and expiry data
- `sale_invoice_items` and `sale_invoices` — used to detect dead stock based on last sale date

### Key fields
- `inventory_transactions.transaction_type`, `quantity_in`, `quantity_out`, `unit_cost`, `notes`
- `inventory_transactions.reference_type`, `reference_id`, `batch_id`
- `product_batches.initial_quantity`, `product_batches.available_quantity`, `product_batches.expiry_date`
- `products.reorder_level`

---

## 5) Purchase module

### Screen
- `/admin/purchases` / `admin/purchases.html`

### API endpoints
- `GET /api/suppliers`
- `POST /api/suppliers`
- `GET /api/purchases`
- `POST /api/purchases`
- `GET /api/purchase-returns`
- `POST /api/purchase-returns`
- `GET /api/product-batches`
- `POST /api/product-batches`

### Actions / usage
- Add or edit supplier
- Create purchase invoice
a - Add purchase items
- Resolve or create batch on receiving stock
- Create purchase return
- View purchase register and supplier ledger

### Tables used
- `suppliers` — supplier master
- `purchases` — purchase header
- `purchase_items` — purchase line items
- `product_batches` — creation and reuse of batches during stock intake
- `inventory_transactions` — stock receipt entries
- `supplier_ledger` — supplier balance tracking
- `purchase_returns` / `purchase_return_items` — return records

### Key fields
- `suppliers.name`, `suppliers.company_name`, `suppliers.phone`, `suppliers.email`
- `purchases.purchase_number`, `purchases.supplier_id`, `purchases.total`, `purchases.purchase_date`
- `purchase_items.product_id`, `purchase_items.quantity`, `purchase_items.unit_cost`, `purchase_items.line_total`
- `product_batches.batch_number`, `product_batches.expiry_date`, `product_batches.available_quantity`

---

## 6) Orders module

### Screen
- `/admin/orders` / `admin/orders.html`

### API endpoints
- `GET /api/orders`
- `GET /api/orders/confirmed`
- `POST /api/orders/:id/confirm`
- `GET /api/orders/:id/items`
- `GET /api/orders/:id/invoice`
- `GET /api/orders/:id/payments`
- `POST /api/orders/:id/payment`
- `POST /api/orders/:id/dispatch`

### Actions / usage
- View pending and confirmed orders
- Confirm order and auto-generate invoice
- View order items and payment ledger
- Capture payment against order
- Dispatch order and assign batches

### Tables used
- `orders` — order header
- `order_items` — order lines
- `customers` — customer linking
- `sale_invoices` — generated invoice data
- `payment_ledger` — payment entries
- `order_item_batches` — batch allocation for dispatch
- `product_batches` — stock used by batch allocation

### Key fields
- `orders.order_number`, `orders.customer_name`, `orders.email`, `orders.phone`, `orders.delivery_address`, `orders.status`, `orders.payment_status`, `orders.confirmed_at`
- `order_items.product_id`, `order_items.quantity`, `order_items.unit_price`, `order_items.line_total`
- `sale_invoices.invoice_number`, `sale_invoices.total`, `sale_invoices.payment_status`, `sale_invoices.delivery_status`
- `payment_ledger.amount`, `payment_ledger.balance`, `payment_ledger.entry_date`

---

## 7) Customers module

### Screen
- Orders/customer panel and customer list

### API endpoints
- `GET /api/customers`
- `POST /api/customers`

### Actions / usage
- Save customer contact details
- Search or review customer sales history

### Tables used
- `customers` — customer master
- `orders` — order count by customer
- `sale_invoices` — invoice count and sales totals
- `sale_returns` — customer return totals

### Key fields
- `customers.name`, `customers.email`, `customers.phone`, `customers.city`, `customers.address`
- `customers.customer_code`

---

## 8) Invoices module

### Screen
- Sales invoice tab in orders screen; invoice listing and dispatch panels

### API endpoints
- `GET /api/invoices`
- `GET /api/invoices/:id/items`
- `POST /api/invoices/manual`
- `POST /api/invoices/:id/dispatch`

### Actions / usage
- View sale invoices
- View invoice line items
- Create manual invoice
- Mark invoice as dispatched

### Tables used
- `sale_invoices` — invoice header
- `sale_invoice_items` — invoice lines
- `orders` — parent order reference
- `customers` — customer relation
- `inventory_transactions` — stock out entries for invoiced sale
- `payment_ledger` — payment status adjustments

### Key fields
- `sale_invoices.invoice_number`, `sale_invoices.order_id`, `sale_invoices.customer_id`, `sale_invoices.total`, `sale_invoices.payment_status`, `sale_invoices.delivery_status`
- `sale_invoice_items.product_id`, `sale_invoice_items.quantity`, `sale_invoice_items.unit_price`, `sale_invoice_items.line_total`

---

## 9) Sale Returns module

### Screen
- Sales return table in orders / returns section

### API endpoints
- `GET /api/sale-returns`
- `POST /api/sale-returns`

### Actions / usage
- Record return for a sold item
- Approve / track return status
- Show customer/ invoice reference for each return

### Tables used
- `sale_returns` — customer return records
- `sale_invoices` — source invoice reference
- `orders` — linked order reference
- `customers` — customer reference
- `products` — return product reference

### Key fields
- `sale_returns.return_number`, `sale_returns.invoice_id`, `sale_returns.order_id`, `sale_returns.customer_id`, `sale_returns.product_id`
- `sale_returns.quantity`, `sale_returns.unit_price`, `sale_returns.return_amount`, `sale_returns.return_reason`, `sale_returns.status`

---

## 10) Payment Ledger and customer payments

### Screen
- Payment history / order payment modal

### API endpoints
- `GET /api/payment-ledger`
- `POST /api/orders/:id/payment`
- `POST /api/public/orders/:id/payments`

### Actions / usage
- Capture payment entries
- Track remaining balance
- Review payment history by order or invoice

### Tables used
- `payment_ledger` — payment transaction history
- `orders` — order reference for a payment
- `sale_invoices` — invoice reference for a payment
- `customers` — customer lookup for payment registry

### Key fields
- `payment_ledger.order_id`, `payment_ledger.invoice_id`, `payment_ledger.payment_reference`, `payment_ledger.amount`, `payment_ledger.balance`, `payment_ledger.entry_date`, `payment_ledger.status`

---

## 11) Reports module

### Screen
- `/admin/reports` / `admin/reports.html`

### API endpoints
- `GET /api/reports/orders-sales`
- `GET /api/reports/net-sales`
- `GET /api/reports/net-purchases`

### Actions / usage
- Review sales and return metrics
- Filter by date, customer, invoice number, order number, payment method
- Review net purchases summary

### Tables used
- `orders` — order summary counts and statuses
- `sale_invoices` — gross sales and payment status
- `sale_returns` — return totals
- `purchases` — purchase totals
- `customers` — customer filters and grouping

### Key fields
- `sale_invoices.total`, `sale_invoices.invoice_date`, `sale_invoices.payment_method`, `sale_invoices.payment_status`
- `sale_returns.return_amount`, `sale_returns.status`
- `purchases.total`, `purchases.purchase_date`

---

## 12) Company settings and branding

### Screen
- `/admin/company-settings.html`

### API endpoints
- `GET /api/public/company-settings`
- `GET /api/company-settings`
- `PUT /api/company-settings`

### Actions / usage
- Save company brand details
- Upload logo and alternate logo
- Save document header/footer text, tagline, legal terms, signatures
- Set invoice numbering, currency, tax settings

### Tables used
- `company_settings` — all branding and document configuration

### Key fields
- `company_settings.company_name`, `company_settings.document_header`, `company_settings.document_footer`, `company_settings.footer_tagline`
- `company_settings.logo_data_url`, `company_settings.alternate_logo_data_url`
- `company_settings.terms_and_conditions`, `company_settings.return_policy`, `company_settings.payment_terms`
- `company_settings.invoice_prefix`, `company_settings.invoice_number_format`, `company_settings.starting_number`, `company_settings.number_of_digits`
- `company_settings.currency`, `company_settings.currency_symbol`, `company_settings.tax_display_preference`

---

## 13) System settings / admin metadata

### Screen
- `/admin/settings.html`

### API endpoints
- `GET /api/settings/metadata`
- `GET /api/settings/categories`
- `POST /api/settings/categories`
- `PUT /api/settings/categories/:id`
- `DELETE /api/settings/categories/:id`
- `GET /api/settings/brands`
- `POST /api/settings/brands`
- `PUT /api/settings/brands/:id`
- `DELETE /api/settings/brands/:id`
- `GET /api/settings/pack-sizes`
- `POST /api/settings/pack-sizes`
- `PUT /api/settings/pack-sizes/:id`
- `DELETE /api/settings/pack-sizes/:id`

### Actions / usage
- Manage master lists used by the product form

### Tables used
- `categories`
- `brands`
- `pack_sizes`

### Key fields
- `categories.name`
- `brands.name`
- `pack_sizes.size`

---

## 14) Cross-table logic summary

### Batch logic
- `product_batches` stores reusable batch entries by product and expiry date.
- `order_item_batches` records how many units are allocated to each order/invoice item from a batch.
- `inventory_transactions` records the stock movement that impacts batch availability.

### Dispatch logic
- `orders.status` and `sale_invoices.delivery_status` are updated to `Dispatched`.
- `product_batches.available_quantity` is reduced as stock is allocated to dispatch.
- `order_item_batches` stores the actual batch allocation.

### Payment logic
- `payment_ledger` stores every payment entry.
- `sale_invoices.paid_amount` and `sale_invoices.payment_status` are updated as the balance changes.

### Stock valuation logic
- Inventory totals are calculated using `inventory_transactions.quantity_in - quantity_out`.
- Product stock value uses `products.purchase_rate` and current stock on hand.

---

## 15) Practical mapping rule

If a screen is a document or transaction screen, it is usually driven by one of these patterns:

- Header table: `orders`, `purchases`, `sale_invoices`, `company_settings`
- Line table: `order_items`, `purchase_items`, `sale_invoice_items`, `purchase_return_items`
- Movement table: `inventory_transactions`, `payment_ledger`
- Reference/lookup table: `products`, `customers`, `suppliers`, `categories`, `brands`, `pack_sizes`

This is the most reliable way to trace each admin action back to the database in this project.
