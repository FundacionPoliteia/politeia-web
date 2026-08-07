import { gzipSync } from 'node:zlib';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { getStorage } from '../storageClient.js';

export async function archiveSourcePayload(sourceId: string, snapshotId: string, payload: Buffer, sha256: string) {
  const objectName = `source-snapshots/${sourceId}/${new Date().getUTCFullYear()}/${snapshotId}.json.gz`;
  if (config.dataStore === 'memory') return `memory://${objectName}`;
  if (!config.sourceSnapshotsBucket) throw new ApiError(503, 'source_archive_not_configured', 'El bucket de snapshots oficiales no está configurado');
  const storage = await getStorage();
  await storage.bucket(config.sourceSnapshotsBucket).file(objectName).save(gzipSync(payload), {
    resumable: false,
    contentType: 'application/json',
    metadata: {
      contentEncoding: 'gzip',
      cacheControl: 'private,no-store',
      metadata: { sourceId, snapshotId, sha256 },
    },
  });
  return `gs://${config.sourceSnapshotsBucket}/${objectName}`;
}
