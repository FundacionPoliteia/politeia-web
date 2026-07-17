import { Webhook } from 'svix';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { processResendWebhook } from '../repositories/mailWebhooks.js';

export async function handleResendWebhook(req, res, next) {
  try {
    if (!config.resendWebhookSecret) throw new HttpError(503, 'RESEND_WEBHOOK_SECRET is not configured');
    const svixId = String(req.get('svix-id') || '');
    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    let event;
    try {
      event = new Webhook(config.resendWebhookSecret).verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': req.get('svix-timestamp') || '',
        'svix-signature': req.get('svix-signature') || '',
      });
    } catch {
      throw new HttpError(400, 'Invalid Resend webhook signature');
    }
    const result = await processResendWebhook(svixId, event);
    res.json({ ok: true, duplicate: result.duplicate });
  } catch (err) {
    next(err);
  }
}
