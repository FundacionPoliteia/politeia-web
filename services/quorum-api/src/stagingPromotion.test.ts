import { describe, expect, it } from 'vitest';
import {
  equivalentStorageObject, planCollectionPromotion, preparePromotionRecord,
  referencedUploadIds, rewriteStagingApiUrls, stagingPromotionCollections,
} from './stagingPromotion.js';

const stagingApi = 'https://staging.quorum.politeia.ar/api/quorum';
const productionApi = 'https://quorum.politeia.ar/api/quorum';

describe('staging-to-production content promotion', () => {
  it('allowlists editorial content but never access assignments, subscriptions or telemetry', () => {
    expect(stagingPromotionCollections).toContain('projects');
    expect(stagingPromotionCollections).toContain('revisions');
    expect(stagingPromotionCollections).toContain('teamMembers');
    expect(stagingPromotionCollections).not.toContain('roles');
    expect(stagingPromotionCollections).not.toContain('subscriptions');
    expect(stagingPromotionCollections).not.toContain('audits');
    expect(stagingPromotionCollections).not.toContain('metrics');
  });

  it('rewrites only staging API base URLs and preserves third-party URLs', () => {
    const result = rewriteStagingApiUrls({
      photo: `${stagingApi}/v1/public/media/image-1`,
      document: `${stagingApi}/v1/public/files/document-1`,
      officialSource: 'https://www.senado.gob.ar/acta/1',
    }, stagingApi, productionApi);

    expect(result.photo).toBe(`${productionApi}/v1/public/media/image-1`);
    expect(result.document).toBe(`${productionApi}/v1/public/files/document-1`);
    expect(result.officialSource).toBe('https://www.senado.gob.ar/acta/1');
  });

  it('finds only uploaded Quórum media and document IDs referenced by saved content', () => {
    const ids = referencedUploadIds([
      { photoUrl: `${stagingApi}/v1/public/media/image-1?size=large` },
      { documents: [{ url: `${stagingApi}/v1/public/files/document-2` }] },
      { link: 'https://example.com/media/image-external' },
    ]);
    expect([...ids].sort()).toEqual(['document-2', 'image-1']);
  });

  it('copies editorial settings but keeps subscriptions disabled in production', () => {
    const settings = preparePromotionRecord('settings', {
      id: 'public',
      subscriptionsEnabled: true,
      privacyPolicyApproved: true,
      electionPortal: { enabled: true },
    }, stagingApi, productionApi) as Record<string, unknown>;

    expect(settings.subscriptionsEnabled).toBe(false);
    expect(settings.privacyPolicyApproved).toBe(true);
    expect(settings.electionPortal).toEqual({ enabled: true });
  });

  it('is resumable for identical rows but refuses to overwrite divergent production records', () => {
    const source = new Map([['project-1', { title: 'Aprobado' }]]);
    const identical = planCollectionPromotion(source, new Map([['project-1', { title: 'Aprobado' }]]), (_id, value) => value);
    expect(identical.toWrite).toEqual([]);
    expect(identical.conflicts).toEqual([]);

    const divergent = planCollectionPromotion(source, new Map([['project-1', { title: 'Editado en producción' }]]), (_id, value) => value);
    expect(divergent.toWrite).toEqual([]);
    expect(divergent.conflicts).toContain('project-1: distinto en producción');
  });

  it('uses object checksums before considering an existing uploaded file identical', () => {
    expect(equivalentStorageObject({ md5Hash: 'abc' }, { md5Hash: 'abc' })).toBe(true);
    expect(equivalentStorageObject({ md5Hash: 'abc' }, { md5Hash: 'def' })).toBe(false);
    expect(equivalentStorageObject({}, {})).toBe(false);
  });
});
