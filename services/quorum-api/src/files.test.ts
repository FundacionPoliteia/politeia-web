import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from './config.js';
import { createMemoryStore, setStoreForTests } from './store.js';
import { uploadEditorialImage } from './files.js';

const mocks = vi.hoisted(() => ({ save: vi.fn(), file: vi.fn(), bucket: vi.fn() }));
vi.mock('./storageClient.js', () => ({ getStorage: async () => ({ bucket: mocks.bucket }) }));
const originalBucket = config.documentsBucket;
const originalUrl = config.publicApiUrl;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=', 'base64');
const image = { buffer: png, mimetype: 'image/png', size: png.length, originalname: 'foto.png' } as Express.Multer.File;
let data = createMemoryStore(false);
beforeEach(() => {
  vi.clearAllMocks();
  config.documentsBucket = 'test-photos';
  config.publicApiUrl = 'https://example.com';
  mocks.bucket.mockReturnValue({ file: mocks.file });
  mocks.file.mockReturnValue({ save: mocks.save });
  mocks.save.mockResolvedValue(undefined);
  data = createMemoryStore(false); setStoreForTests(data);
});
afterEach(() => { config.documentsBucket = originalBucket; config.publicApiUrl = originalUrl; });
describe('fotos editoriales', () => {
  it('sube bytes a Storage y persiste su referencia en el almacén de datos', async () => {
    const result = await uploadEditorialImage(image, 'dev@politeia.ar');
    expect(mocks.bucket).toHaveBeenCalledWith('test-photos');
    expect(mocks.save).toHaveBeenCalledWith(png, expect.objectContaining({ contentType: 'image/png' }));
    expect(result.url).toBe(`https://example.com/v1/public/media/${result.id}`);
    expect(await data.get('uploads', result.id)).toMatchObject({ kind: 'image', contentType: 'image/png', uploadedBy: 'dev@politeia.ar', objectName: result.objectName });
  });
  it('rechaza un archivo inválido o demasiado grande sin escribir metadatos', async () => {
    for (const file of [{ ...image, mimetype: 'image/svg+xml' }, { ...image, buffer: Buffer.from('not-a-png') }, { ...image, size: config.imageMaxBytes + 1 }]) {
      await expect(uploadEditorialImage(file, 'dev@politeia.ar')).rejects.toMatchObject({ code: 'invalid_image' });
    }
    expect(mocks.save).not.toHaveBeenCalled();
    expect(await data.list('uploads')).toEqual([]);
  });
  it('no informa una subida exitosa ni guarda referencias cuando Storage falla', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(uploadEditorialImage(image, 'dev@politeia.ar')).rejects.toThrow('Storage unavailable');
    expect(await data.list('uploads')).toEqual([]);
  });
});
