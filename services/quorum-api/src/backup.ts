import firestore from '@google-cloud/firestore';
import { OAuth2Client } from 'google-auth-library';
import type { Request } from 'express';
import { config } from './config.js';
import { ApiError } from './errors.js';

const auth = new OAuth2Client();

export async function exportFirestoreBackup(req: Request) {
  if (!config.backupsBucket || !config.backupInvokerEmail) throw new ApiError(503, 'backup_not_configured', 'La exportación no está configurada');
  const bearer = String(req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!bearer) throw new ApiError(401, 'backup_auth_required', 'Falta la identidad del programador');
  const ticket = await auth.verifyIdToken({ idToken: bearer, audience: operationAudience(req) });
  const payload = ticket.getPayload();
  if (payload?.email?.toLowerCase() !== config.backupInvokerEmail || payload.email_verified !== true) throw new ApiError(403, 'backup_identity_invalid', 'Identidad de backup no autorizada');
  const client = new firestore.v1.FirestoreAdminClient();
  const database = client.databasePath(config.gcpProjectId, config.firestoreDatabaseId);
  const day = new Date().toISOString().slice(0, 10);
  const [operation] = await client.exportDocuments({ name: database, outputUriPrefix: `gs://${config.backupsBucket}/firestore/${config.firestoreDatabaseId}/${day}` });
  return { accepted: true, operation: operation.name || '', database, day };
}

function operationAudience(req: Request) {
  return `${req.protocol}://${req.get('host')}`;
}
