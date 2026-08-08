import crypto from 'node:crypto';
import type { PublicProject, Subscription } from '@politeia/quorum-contracts';
import { config } from './config.js';
import { store } from './store.js';
import { createManageTokenForSubscription } from './subscriptions.js';

interface MailJob { id: string; type: string; status: string; attempts: number; projectId?: string; revisionId?: string; subscriptionId?: string; token?: string; updatedAt: string; }

export async function dispatchPendingMail(limit = 25) {
  const jobs = (await store().list<MailJob>('mailJobs')).filter((job) => job.status === 'pending').slice(0, limit);
  const results = [];
  for (const job of jobs) {
    try {
      if (job.type === 'follow-confirmation') await sendConfirmation(job);
      if (job.type === 'project-update') await sendProjectUpdate(job);
      await store().set('mailJobs', job.id, { ...job, status: 'sent', attempts: job.attempts + 1, updatedAt: new Date().toISOString() });
      results.push({ id: job.id, status: 'sent' });
    } catch (error) {
      const attempts = job.attempts + 1;
      await store().set('mailJobs', job.id, { ...job, status: attempts >= 5 ? 'failed' : 'pending', attempts, lastError: error instanceof Error ? error.message : 'Error desconocido', updatedAt: new Date().toISOString() });
      results.push({ id: job.id, status: 'error' });
    }
  }
  return results;
}

async function sendConfirmation(job: MailJob) {
  const subscription = await store().get<Subscription>('subscriptions', job.subscriptionId || '');
  const project = await store().get<PublicProject>('publicProjects', job.projectId || '');
  if (!subscription || !project || !job.token) return;
  const url = `https://quorum.politeia.ar/seguir/confirmar?token=${encodeURIComponent(job.token)}`;
  await sendMail(subscription.email, 'Confirmá el seguimiento en Quórum', mailLayout(
    'Confirmá tu seguimiento',
    `<p>Pediste seguir <strong>${escapeHtml(project.title)}</strong>.</p><p><a href="${url}">Confirmar seguimiento</a></p><p>Si no fuiste vos, ignorá este mensaje.</p>`,
  ));
}

async function sendProjectUpdate(job: MailJob) {
  const project = await store().get<PublicProject>('publicProjects', job.projectId || '');
  if (!project) return;
  const subscribers = (await store().list<Subscription>('subscriptions')).filter((item) => item.status === 'active' && item.projectIds.includes(project.id));
  for (const subscriber of subscribers) {
    const manageToken = await createManageTokenForSubscription(subscriber.id);
    const preferences = `https://quorum.politeia.ar/seguir/preferencias?token=${encodeURIComponent(manageToken)}`;
    await sendMail(subscriber.email, `Actualización: ${project.title}`, mailLayout(
      'Un proyecto que seguís se actualizó',
      `<p><strong>${escapeHtml(project.title)}</strong> tiene novedades.</p><p>${escapeHtml(project.updates.at(-1)?.title || 'Consultá la ficha para conocer los cambios.')}</p><p><a href="https://quorum.politeia.ar/proyectos/${project.slug}">Ver la ficha</a></p><p><a href="${preferences}">Administrar preferencias</a></p>`,
    ));
  }
}

async function sendMail(to: string, subject: string, html: string) {
  if (config.mailProvider === 'disabled') return;
  if (config.mailProvider === 'console') {
    console.info(JSON.stringify({ mail: { to, subject } }));
    return;
  }
  if (!config.resendApiKey) throw new Error('RESEND_API_KEY no configurada');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ from: config.mailFrom, to: [to], subject, html }),
  });
  if (!response.ok) throw new Error(`Resend respondió ${response.status}`);
}

function mailLayout(title: string, body: string) {
  return `<div style="font-family:Arial,sans-serif;color:#1a1a37;max-width:600px;margin:auto"><p style="color:#137a9f;font-weight:700">QUÓRUM · POLITEIA</p><h1>${title}</h1>${body}<hr><small>Información legislativa clara, accesible y apartidaria.</small></div>`;
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char)); }
