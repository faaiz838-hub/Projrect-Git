const crypto = require('crypto');

class PaymentProvider {
  async createCheckoutSession() {
    throw new Error('PaymentProvider#createCheckoutSession must be implemented.');
  }

  verifyWebhook() {
    throw new Error('PaymentProvider#verifyWebhook must be implemented.');
  }
}

class StripeProvider extends PaymentProvider {
  constructor({ secretKey, webhookSecret, Stripe }) {
    super();
    this.webhookSecret = webhookSecret;
    this.client = secretKey ? new Stripe(secretKey) : null;
  }

  async createCheckoutSession({ orderId, orderNumber, email, amount, currency }) {
    if (!this.client) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY before accepting card payments.');
    }

    const checkoutSession = await this.client.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      client_reference_id: String(orderId),
      metadata: { order_id: String(orderId), order_number: orderNumber },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: String(currency || 'usd').toLowerCase(),
          unit_amount: Math.round(Number(amount) * 100),
          product_data: { name: `Order ${orderNumber}` },
        },
      }],
      success_url: `${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/track-order?order=${encodeURIComponent(orderNumber)}`,
      cancel_url: `${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/track-order?order=${encodeURIComponent(orderNumber)}`,
    });

    return {
      gateway: 'Stripe', gateway_type: 'stripe', method: 'card', online_payment: true,
      session_id: checkoutSession.id, status: 'ready', checkout_url: checkoutSession.url,
      secure_note: 'Redirect to Stripe to complete payment securely.',
    };
  }

  verifyWebhook(rawBody, signature) {
    if (!this.webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
    return this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}

class PayFastProvider extends PaymentProvider {
  constructor({ merchantId, merchantKey, passphrase, webhookSecret }) {
    super();
    this.merchantId = merchantId;
    this.merchantKey = merchantKey;
    this.passphrase = passphrase;
    this.webhookSecret = webhookSecret;
  }

  async createCheckoutSession({ orderId, orderNumber, email, amount }) {
    if (!this.merchantId || !this.merchantKey) {
      throw new Error('PayFast is not configured. Set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY.');
    }
    const reference = `PF-${orderId}-${Date.now()}`;
    return {
      gateway: 'PayFast', gateway_type: 'payfast', method: 'payfast', online_payment: true,
      session_id: reference, status: 'pending_redirect', checkout_url: null,
      secure_note: 'PayFast checkout must be initiated with the provider-specific signed form payload.',
    };
  }

  verifyWebhook(rawBody, signature) {
    if (!this.webhookSecret) throw new Error('PAYFAST_WEBHOOK_SECRET is not configured.');
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const received = String(signature || '').replace(/^sha256=/, '');
    if (!received || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
      throw new Error('Invalid PayFast webhook signature.');
    }
    return JSON.parse(rawBody.toString('utf8'));
  }
}

module.exports = { PaymentProvider, StripeProvider, PayFastProvider };