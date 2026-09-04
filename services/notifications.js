const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { db } = require('../db');

class NotificationService {
  constructor() {
    this.mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } })
      : null;
    this.sms = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;
  }

  async sendOrderConfirmation({ to, orderNumber, invoiceNumber, invoicePdf }) {
    if (!this.mailer || !to) return false;
    await this.mailer.sendMail({ from: process.env.NOTIFICATION_FROM, to, subject: `Order ${orderNumber} confirmed`, text: `Your payment for order ${orderNumber} was confirmed. Invoice: ${invoiceNumber}.`, attachments: [{ filename: `${invoiceNumber}.pdf`, content: invoicePdf, contentType: 'application/pdf' }] });
    return true;
  }

  async sendLowStockAlert({ productName, stock }) {
    return this.sendInternalAlert({ type: 'low_stock', subject: `Low stock: ${productName}`, text: `${productName} has ${stock} remaining.` });
  }

  async sendDispatchUpdate({ to, orderNumber, status }) {
    if (!this.sms || !to || !process.env.TWILIO_FROM_NUMBER) return false;
    await this.sms.messages.create({ from: process.env.TWILIO_FROM_NUMBER, to, body: `Order ${orderNumber}: ${status}` });
    return true;
  }

  async sendAdminAlert({ type, subject, text }) {
    return this.sendInternalAlert({ type, subject, text });
  }

  async sendInternalAlert({ type, subject, text }) {
    const settings = db.prepare('SELECT * FROM notification_settings WHERE id = 1').get();
    const prefix = String(type || '').trim();
    if (!settings || !prefix || !Number(settings[`${prefix}_enabled`])) return false;
    const emails = String(settings[`${prefix}_emails`] || '').trim();
    const smsPhone = String(settings[`${prefix}_sms_phone`] || '').trim();
    if (!emails && !smsPhone) return false;
    const sends = [];
    if (this.mailer && emails) sends.push(this.mailer.sendMail({ from: process.env.NOTIFICATION_FROM, to: emails, subject, text }));
    if (this.sms && smsPhone && process.env.TWILIO_FROM_NUMBER) sends.push(this.sms.messages.create({ from: process.env.TWILIO_FROM_NUMBER, to: smsPhone, body: `${subject}: ${text}` }));
    if (!sends.length) return false;
    await Promise.all(sends);
    return true;
  }
}

module.exports = { NotificationService };