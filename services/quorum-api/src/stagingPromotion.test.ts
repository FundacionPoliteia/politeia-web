import { collections } from './store.js';
import { describe, expect, it } from 'vitest';
import {
  equivalentStorageObject, hasStagingPromotionReferences, planCollectionPromotion, preparePromotionRecord,
  referencedUploadIds, rewriteStagingApiUrls, rewriteStagingStorageUris, stagingPromotionCollections,
  stagingPromotionExcludedCollections, type PromotionLocations,
} from './stagingPromotion.js';

const locations: PromotionLocations = {
  sourceApiBase: 'https://staging.quorum.politeia.ar/api/quorum',
  productionApiBase: 'https://quorum.politeia.ar/api/quorum',
  sourceDocumentsBucket: 'politeia-quorum-quorum-staging-documents',
  productionDocumentsBucket: 'politeia-quorum-quorum-production-documents',
  sourceSnapshotsBucket: 'politeia-quorum-quorum-staging-source-snapshots',
  productionSnapshotsBucket: 'politeia-quorum-quorum-production-source-snapshots',
};

describe('staging-to-production data promotion', () => {
  it('includes every persistent store collection and excludes only the mail delivery queue', () => {
    const expected = (Object.keys(collections) as Array<keyof typeof collections>).filter((key) => key !== 'mailJobs');
    expect(stagingPromotionCollections).toEqual(expected);
    expect(stagingPromotionExcludedCollections).toEqual(['mailJobs']);
    expect(stagingPromotionCollections).toContain('roles');
    expect(stagingPromotionCollections).toContain('subscriptions');
    expect(stagingPromotionCollections).toContain('subscriptionTokens');
    expect(stagingPromotionCollections).toContain('audits');
    expect(stagingPromotionCollections).toContain('metrics');
    expect(stagingPromotionCollections).toContain('sourceSnapshots');
    expect(stagingPromotionCollections).toContain('uploads');
  });

  it('rewrites only Quórum staging API URLs and preserves third-party URLs', () => {
    const result = rewriteStagingApiUrls({
      photo: `${locations.sourceApiBase}/v1/public/media/image-1`,
      document: `${locations.sourceApiBase}/v1/public/files/document-1`,
      officialSource: 'https://www.senado.gob.ar/acta/1',
    }, locations.sourceApiBase, locations.productionApiBase);

    expect(result.photo).toBe(`${locations.productionApiBase}/v1/public/media/image-1`);
    expect(result.document).toBe(`${locations.productionApiBase}/v1/public/files/document-1`);
    expect(result.officialSource).toBe('https://www.senado.gob.ar/acta/1');
  });

  it('rewrites private GCS URIs for document uploads and source snapshots', () => {
    const result = rewriteStagingStorageUris({
      upload: `gs://${locations.sourceDocumentsBucket}/media/image-1.webp`,
      snapshot: `gs://${locations.sourceSnapshotsBucket}/hcdn/2026/run-1.json.gz`,
      external: 'gs://outside-project-data/unchanged.json',
    }, locations);

    expect(result.upload).toBe(`gs://${locations.productionDocumentsBucket}/media/image-1.webp`);
    expect(result.snapshot).toBe(`gs://${locations.productionSnapshotsBucket}/hcdn/2026/run-1.json.gz`);
    expect(result.external).toBe('gs://outside-project-data/unchanged.json');
    expect(hasStagingPromotionReferences(result, locations)).toBe(false);
    expect(hasStagingPromotionReferences({ value: locations.sourceApiBase }, locations)).toBe(true);
  });

  it('finds only uploaded Quórum media and document IDs referenced by saved content', () => {
    const ids = referencedUploadIds([
      { photoUrl: `${locations.sourceApiBase}/v1/public/media/image-1?size=large` },
      { documents: [{ url: `${locations.sourceApiBase}/v1/public/files/document-2` }] },
      { link: 'https://example.com/media/image-external' },
    ]);
    expect([...ids].sort()).toEqual(['document-2', 'image-1']);
  });

  it('preserves subscriptions data but disables sending and marks imported metrics as staging history', () => {
    const settings = preparePromotionRecord('settings', {
      id: 'public', subscriptionsEnabled: true, privacyPolicyApproved: true,
    }, locations) as Record<string, unknown>;
    const metrics = preparePromotionRecord('metrics', {
      id: '2026-10-07', events: { 'project-opened': 120 },
    }, locations) as Record<string, unknown>;

    expect(settings.subscriptionsEnabled).toBe(false);
    expect(settings.privacyPolicyApproved).toBe(true);
    expect(metrics).toMatchObject({ id: '2026-10-07', events: { 'project-opened': 120 }, sourceEnvironment: 'staging' });
    expect(preparePromotionRecord('roles', { email: 'editor@example.com', active: false }, locations)).toEqual({ email: 'editor@example.com', active: false });
  });

  it('is resumable for identical rows but refuses to overwrite divergent production records', () => {
    const source = new Map([['project-1', { title: 'Aprobado' }]]);
    const identical = planCollectionPromotion(source, new Map([['project-1', { title: 'Aprobado' }]]), (_id, value) => value);
    expect(identical.toWrite).toEqual([]);
    expect(identical.conflicts).toEqual([]);

    const divergent = planCollectionPromotion(source, new Map([['project-1', { title: 'Editado en producción' }]]), (_id, value) => value);
    expect(divergent.toWrite).toEqual([]);
    expect(divergent.conflicts).toContain('project-1: distinto en producción');
    const targetOnly = planCollectionPromotion(new Map(), new Map([['production-only', { title: 'Conservar' }]]), (_id, value) => value);
    expect(targetOnly.conflicts).toContain('production-only: extra en producción');
  });

  it('uses object size and available MD5 or CRC32C checksums before considering files identical', () => {
    expect(equivalentStorageObject({ size: '10', md5Hash: 'abc' }, { size: '10', md5Hash: 'abc' })).toBe(true);
    expect(equivalentStorageObject({ size: '10', crc32c: 'crc' }, { size: '10', crc32c: 'crc' })).toBe(true);
    expect(equivalentStorageObject({ size: '10', md5Hash: 'abc' }, { size: '10', md5Hash: 'def' })).toBe(false);
    expect(equivalentStorageObject({ size: '10', crc32c: 'abc' }, { size: '11', crc32c: 'abc' })).toBe(false);
    expect(equivalentStorageObject({}, {})).toBe(false);
  });
});
