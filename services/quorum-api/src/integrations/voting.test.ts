import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gunzipSync } from 'node:zlib';
import request from 'supertest';
import { createMemoryStore, setStoreForTests, store } from '../store.js';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { importOfficialVoting, parseOfficialVoting, officialVotingUrl, validateVotingProvenance, getVotingOriginal } from './voting.js';

const senateUrl = 'https://www.senado.gob.ar/votaciones/detalleActa/2544';
const deputiesUrl = 'https://votaciones.diputados.gov.ar/votacion/4621';
function fixture(senate = true) {
  return `<html><body><div class="tab-content">${senate ? '<p>Acta Nro: 1</p><p>Una moción de prueba</p><span>07/05/2025 - 13:05</span><span>DOS TERCIOS DE MIEMBROS PRESENTES</span><p>NEGATIVO</p>' : '<h4 class="black-opacity">Una votación de prueba</h4><h5>07/05/2025 - 13:05</h5><li><h3>NEGATIVO</h3><h5>Dos tercios</h5></li>'}
    <div class="row-in">${[['AFIRMATIVOS', 2], ['NEGATIVOS', 1], ['ABSTENCIONES', 0], ['AUSENTES', 0], ['SIN VOTAR', 1]].map(([label, n]) => `<ul><h3>${n}</h3><h4>${label}</h4></ul>`).join('')}</div>
    <h4>AFIRMATIVOS</h4><table id="${senate ? 'tabla' : 'myTable'}"><thead><tr><th>¿Cómo votó?</th></tr></thead><tbody>
    ${[['Pérez, María', 'Bloque A', 'AFIRMATIVO'], ['Gómez, José', '', 'AFIRMATIVO'], ['López, Ana', 'Bloque B', 'NEGATIVO'], ['Paz, Juan', 'Bloque B', 'PRESIDENTE']].map(([name, bloc, choice]) => `<tr><td></td><td>${name}</td><td>${bloc}</td><td>Buenos Aires</td><td>${choice}</td></tr>`).join('')}
    </tbody></table><script>throw new Error('Never execute');</script></div></body></html>`;
}
beforeEach(() => { setStoreForTests(createMemoryStore(true)); config.devAuth = true; process.env.DEV_AUTH = 'true'; });
afterEach(() => { vi.unstubAllGlobals(); config.devAuth = true; process.env.DEV_AUTH = 'true'; });
const mockDownload = (html = fixture()) => vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } })));

describe('Importación oficial de votaciones', () => {
  it.each([true, false])('interpreta tablas oficiales, presidencia, bloque faltante y mayoría sin inferir aprobación (%s)', senate => {
    const vote = parseOfficialVoting(fixture(senate), senate ? senateUrl : deputiesUrl);
    expect(vote.outcome).toBe('rejected'); expect(vote.counts?.yes).toBe(2);
    expect(vote.nominal).toHaveLength(4); expect(vote.nominal[1].bloc).toBe('');
    expect(vote.counts?.notVoting).toBe(1); expect(vote.majorityRule).toContain(senate ? 'DOS TERCIOS' : 'Dos tercios');
    expect(vote.date).toBe('2025-05-07'); expect(vote.type).toBe('unspecified');
  });
  it.each(['http://localhost/acta', 'https://www.senado.gob.ar.evil.test/votaciones/detalleActa/1', 'https://www.senado.gob.ar:8443/votaciones/detalleActa/1', `${senateUrl}?url=http://localhost`, 'https://user@www.senado.gob.ar/votaciones/detalleActa/1'])('bloquea URLs no permitidas: %s', url => { expect(() => officialVotingUrl(url)).toThrow(); });
  it('rechaza totales distintos, categorías desconocidas, fecha inválida y filas duplicadas', () => {
    for (const html of [fixture().replace('<h3>2</h3>', '<h3>3</h3>'), fixture().replace('>PRESIDENTE<', '>OTRO<'), fixture().replace('07/05/2025', '31/02/2025'), fixture().replace('Gómez, José', 'Pérez, María')]) expect(() => parseOfficialVoting(html, senateUrl)).toThrow();
  });
  it('conserva original comprimido, reutiliza caché y no modifica proyectos ni legisladores', async () => {
    mockDownload(); const projects = await store().list('projects'); const legislators = await store().list('legislators');
    const [first, concurrent] = await Promise.all([importOfficialVoting(senateUrl, 'editor@example.com'), importOfficialVoting(senateUrl, 'editor@example.com')]);
    const cached = await importOfficialVoting(senateUrl, 'editor@example.com');
    expect(concurrent.item).toEqual(first.item); expect(cached.cached).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
    const snapshot = await getVotingOriginal(first.item.official!.snapshotId);
    expect(gunzipSync(Buffer.from(snapshot.rawHtmlGzipBase64, 'base64')).toString()).toBe(fixture());
    expect(await store().list('projects')).toEqual(projects); expect(await store().list('legislators')).toEqual(legislators);
    expect(await store().list('votingSnapshots')).toHaveLength(1);
  });
  it('calcula correcciones en backend y no altera el original', async () => {
    mockDownload(); const { item } = await importOfficialVoting(senateUrl, 'editor@example.com');
    const [edited] = await validateVotingProvenance([{ ...item, notes: 'Aclaración editorial', official: { ...item.official!, sourceUrl: 'https://fake.test', overriddenFields: [] } }]);
    expect(edited.official?.overriddenFields).toEqual(['notes']); expect(edited.official?.sourceUrl).toBe(senateUrl);
    expect((await getVotingOriginal(item.official!.snapshotId)).original.notes).toBe('');
    await expect(validateVotingProvenance([{ ...item, official: { ...item.official!, snapshotId: 'a'.repeat(64) } }])).rejects.toThrow();
    await expect(validateVotingProvenance([item, item])).rejects.toThrow();
  });
  it('un fallo no avanza el puntero ni invalida el original', async () => {
    mockDownload(); const { item } = await importOfficialVoting(senateUrl, 'editor@example.com');
    const [source] = await store().list<{ id: string; snapshotId: string; checkedAt: string }>('votingSources');
    await store().set('votingSources', source.id, { ...source, checkedAt: '2020-01-01T00:00:00Z' });
    mockDownload('<html>No hay datos</html>');
    await expect(importOfficialVoting(senateUrl, 'editor@example.com')).rejects.toThrow();
    expect((await store().get<{ snapshotId: string }>('votingSources', source.id))?.snapshotId).toBe(item.official?.snapshotId);
    expect(await store().list('votingSnapshots')).toHaveLength(1);
  });
  it('exige sesión y devuelve sólo el original normalizado, no HTML', async () => {
    config.devAuth = false; process.env.DEV_AUTH = 'false';
    await request(createApp()).post('/v1/manage/integrations/votings/import').send({ url: senateUrl }).expect(401);
    config.devAuth = true; process.env.DEV_AUTH = 'true'; mockDownload();
    const imported = await request(createApp()).post('/v1/manage/integrations/votings/import').send({ url: senateUrl }).expect(200);
    const original = await request(createApp()).get(`/v1/manage/integrations/votings/snapshots/${imported.body.item.official.snapshotId}`).expect(200);
    expect(original.body.rawHtmlGzipBase64).toBeUndefined(); expect(original.body.item.nominal).toHaveLength(4);
  });
});
