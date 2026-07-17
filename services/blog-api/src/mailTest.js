import { config } from './config.js';
import { MAIL_CHANNELS, sendMail } from './mail/provider.js';
import { renderMailLayout } from './mail/templates.js';

if (!process.env.MAIL_TEST_TO) {
  console.error('Set MAIL_TEST_TO in services/blog-api/.env before running this command.');
  process.exit(1);
}

const rendered = renderMailLayout({
  preheader: 'Prueba de configuracion de correo.',
  heading: 'Correo de prueba',
  bodyHtml: '<p>La integracion de correo de Politeia esta respondiendo correctamente.</p>',
  bodyText: 'La integracion de correo de Politeia esta respondiendo correctamente.',
  actionUrl: config.appBaseUrl,
  actionLabel: 'Abrir panel',
});
const result = await sendMail({
  channel: MAIL_CHANNELS.updates,
  to: process.env.MAIL_TEST_TO,
  subject: `[${config.mailProvider}] Prueba de correo Politeia`,
  text: rendered.text,
  html: rendered.html,
  idempotencyKey: `manual-mail-test:${Date.now()}`,
});

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
