import { config } from '../config.js';

export function renderEditorialMail({ subject, text, actionUrl = '', actionLabel = 'Abrir panel' }) {
  const lines = String(text || '').split('\n').filter(Boolean);
  return renderMailLayout({
    preheader: subject,
    heading: subject,
    bodyHtml: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
    bodyText: lines.join('\n'),
    actionUrl,
    actionLabel,
  });
}

export function renderNewsletterConfirmation({ confirmUrl }) {
  return renderMailLayout({
    preheader: 'Confirma tu suscripcion al newsletter de Politeia.',
    heading: 'Confirma tu suscripcion',
    bodyHtml: '<p>Recibimos tu solicitud para recibir novedades de Politeia.</p><p>Confirma tu direccion para completar la suscripcion. Si no fuiste vos, podes ignorar este mensaje.</p>',
    bodyText: 'Recibimos tu solicitud para recibir novedades de Politeia. Confirma tu direccion para completar la suscripcion.',
    actionUrl: confirmUrl,
    actionLabel: 'Confirmar suscripcion',
  });
}

export function renderMailLayout({
  preheader = '',
  heading,
  bodyHtml,
  bodyText,
  actionUrl = '',
  actionLabel = '',
  unsubscribeUrl = '',
}) {
  const brand = escapeHtml(config.mailBrandName);
  const safeHeading = escapeHtml(heading);
  const button = actionUrl && actionLabel
    ? `<p style="margin:28px 0"><a href="${escapeAttribute(actionUrl)}" style="display:inline-block;background:#0b809f;color:#fff;text-decoration:none;padding:13px 20px;border-radius:6px;font-weight:700">${escapeHtml(actionLabel)}</a></p>`
    : '';
  const unsubscribe = unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-size:12px;color:#737489">Si ya no queres recibir estas novedades, podes <a href="${escapeAttribute(unsubscribeUrl)}" style="color:#0b809f;text-decoration:underline">darte de baja</a>.</p>`
    : '';
  const unsubscribeText = unsubscribeUrl ? `Darte de baja: ${unsubscribeUrl}` : '';
  const hiddenPreheader = `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:#f5f3f1">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>`;
  return {
    text: [heading, bodyText, actionUrl, unsubscribeText].filter(Boolean).join('\n\n'),
    html: `<!doctype html><html><body style="margin:0;background:#f5f3f1;color:#111332;font-family:Arial,sans-serif">${hiddenPreheader}<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #dcdde3"><tr><td style="padding:28px 32px"><p style="margin:0 0 28px;color:#0b809f;font-size:14px;font-weight:700;text-transform:uppercase">${brand}</p><h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:30px;line-height:1.15">${safeHeading}</h1><div style="font-size:16px;line-height:1.6;color:#42445b">${bodyHtml}</div>${button}<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e5e8"><p style="margin:0;font-size:12px;color:#737489">Este mensaje fue enviado por ${brand}.</p>${unsubscribe}</div></td></tr></table></td></tr></table></body></html>`,
  };
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value = '') {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
