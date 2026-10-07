import { describe, expect, it, vi } from 'vitest';
import { copyStorageObject, listStorageObjects, type StorageApiClient } from './storagePromotionClient.js';

describe('storagePromotionClient', () => {
  it('paginates through every object in a bucket', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: { items: [{ name: 'docs/a.pdf', generation: '10' }], nextPageToken: 'page-2' } })
      .mockResolvedValueOnce({ data: { items: [{ name: 'docs/b.pdf', generation: '11' }] } });

    const objects = await listStorageObjects({ request } as unknown as StorageApiClient, 'bucket-one');

    expect(objects.map(({ name }) => name)).toEqual(['docs/a.pdf', 'docs/b.pdf']);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toMatchObject({
      url: 'https://storage.googleapis.com/storage/v1/b/bucket-one/o',
      params: { maxResults: 1000, projection: 'noAcl' },
    });
    expect(request.mock.calls[1][0].params).toMatchObject({ pageToken: 'page-2' });
  });

  it('copies an object with source-generation and create-only destination preconditions', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: { done: false, rewriteToken: 'continue-copy' } })
      .mockResolvedValueOnce({ data: { done: true } });

    await copyStorageObject({ request } as unknown as StorageApiClient, {
      objectName: 'documents/member photo.jpg',
      sourceBucketName: 'staging-docs',
      targetBucketName: 'production-docs',
      sourceGeneration: '42',
    });

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      url: 'https://storage.googleapis.com/storage/v1/b/staging-docs/o/documents%2Fmember%20photo.jpg/rewriteTo/b/production-docs/o/documents%2Fmember%20photo.jpg',
      params: { ifGenerationMatch: '0', ifSourceGenerationMatch: '42' },
    });
    expect(request.mock.calls[1][0].params).toMatchObject({ rewriteToken: 'continue-copy' });
  });

  it('fails closed if Cloud Storage omits an object generation', async () => {
    const request = vi.fn().mockResolvedValue({ data: { items: [{ name: 'docs/a.pdf' }] } });

    await expect(listStorageObjects({ request } as unknown as StorageApiClient, 'bucket-one'))
      .rejects.toThrow('omitió el nombre o generación');
  });
});
