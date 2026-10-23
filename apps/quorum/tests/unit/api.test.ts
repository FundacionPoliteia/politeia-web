import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGlossaryTerm, fetchPublicBootstrap, fetchPublicLegislator, fetchPublicProject } from '../../lib/api';

afterEach(() => vi.unstubAllGlobals());

describe('errores de la API pública', () => {
  it('sólo interpreta como inexistente un proyecto cuando el API devuelve 404', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('error', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicProject('proyecto-ausente')).resolves.toBeNull();
    await expect(fetchPublicProject('api-no-disponible')).rejects.toThrow('Project API unavailable');
    await expect(fetchPublicProject('respuesta-invalida')).rejects.toThrow('invalid project response');
    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/v1/public/projects/proyecto-ausente'), expect.objectContaining({ cache: 'no-store' }));
  });

  it('no convierte fallas del API en perfiles o términos inexistentes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 503 })));

    await expect(fetchPublicLegislator('perfil')).rejects.toThrow('Public API unavailable');
    await expect(fetchGlossaryTerm('termino')).rejects.toThrow('Public API unavailable');
  });

  it('mantiene el fallback de catálogos sólo cuando el llamador lo solicita', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection failed')));

    await expect(fetchPublicBootstrap()).resolves.toMatchObject({ projects: [], legislators: [], glossary: [] });
    await expect(fetchPublicBootstrap({ fresh: true, throwOnError: true })).rejects.toThrow('connection failed');
  });
});
