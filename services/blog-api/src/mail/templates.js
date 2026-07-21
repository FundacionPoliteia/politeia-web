import { config } from '../config.js';

const TEXT_FONT = "'Archivo','Helvetica Neue',Arial,sans-serif";
const DISPLAY_FONT = "'Fraunces',Georgia,'Times New Roman',serif";

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
  preferencesUrl = '',
}) {
  const brand = escapeHtml(config.mailBrandName);
  const safeHeading = escapeHtml(heading);
  const button = actionUrl && actionLabel
    ? `<p style="margin:28px 0"><a href="${escapeAttribute(actionUrl)}" style="display:inline-block;background:#137a9f;color:#fff;text-decoration:none;padding:13px 20px;border-radius:6px;font-family:${TEXT_FONT};font-weight:700">${escapeHtml(actionLabel)}</a></p>`
    : '';
  const preferences = preferencesUrl
    ? `<p style="margin:12px 0 0;font-size:12px;color:#737489">Podes <a href="${escapeAttribute(preferencesUrl)}" style="color:#0b809f;text-decoration:underline">administrar que novedades recibis</a>.</p>`
    : '';
  const unsubscribe = unsubscribeUrl
    ? `<p style="margin:8px 0 0;font-size:12px;color:#737489">Tambien podes <a href="${escapeAttribute(unsubscribeUrl)}" style="color:#0b809f;text-decoration:underline">darte de baja de todos los envios</a>.</p>`
    : '';
  const preferencesText = preferencesUrl ? `Administrar preferencias: ${preferencesUrl}` : '';
  const unsubscribeText = unsubscribeUrl ? `Darte de baja: ${unsubscribeUrl}` : '';
  const hiddenPreheader = `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:#f5f3f1">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>`;
  return {
    text: [heading, bodyText, actionUrl, preferencesText, unsubscribeText].filter(Boolean).join('\n\n'),
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap" rel="stylesheet"><style>@media only screen and (max-width:640px){.politeia-shell{padding:16px 8px!important}.politeia-content{padding:24px 20px!important}.politeia-heading{font-size:30px!important}}</style></head><body style="margin:0;background:#f7f5f2;color:#1a1a37;font-family:${TEXT_FONT}">${hiddenPreheader}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f7f5f2"><tr><td class="politeia-shell" align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #dcdde3;border-top:4px solid #137a9f"><tr><td class="politeia-content" style="padding:32px"><p style="margin:0 0 28px;color:#137a9f;font-family:${TEXT_FONT};font-size:13px;line-height:1.2;font-weight:800;text-transform:uppercase">${brand}</p><h1 class="politeia-heading" style="margin:0 0 26px;color:#1a1a37;font-family:${DISPLAY_FONT};font-size:34px;line-height:1.12;font-weight:700">${safeHeading}</h1><div style="color:#42445b;font-family:${TEXT_FONT};font-size:16px;line-height:1.65">${bodyHtml}</div>${button}<div style="margin-top:36px;padding-top:20px;border-top:1px solid #e5e5e8;font-family:${TEXT_FONT}"><p style="margin:0;font-size:12px;line-height:1.5;color:#737489">Este mensaje fue enviado por ${brand}.</p>${preferences}${unsubscribe}</div></td></tr></table></td></tr></table></body></html>`,
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
