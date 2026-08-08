import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Legislator, Project, SiteSettings } from '@politeia/quorum-contracts';
import { createApp } from './app.js';
import { resolveRoles } from './auth.js';
import { config } from './config.js';
import { createMemoryStore, setStoreForTests, type DataStore } from './store.js';

let testStore: DataStore;

beforeEach(() => {
  process.env.DEV_AUTH = 'true';
  config.devAuth = true;
  config.publicAccessRequired = false;
  config.publicAccessGateSecret = '';
  testStore = createMemoryStore(true);
  setStoreForTests(testStore);
});

describe('Quórum API', () => {
  it('restringe toda la API pública durante el batch y permite al servidor web autenticado', async () => {
    process.env.DEV_AUTH = 'false';
    config.devAuth = false;
    config.publicAccessRequired = true;
    config.publicAccessGateSecret = 'batch-gate-secret-with-more-than-32-characters';

    await request(createApp()).get('/v1/public/projects').expect(401);
    const response = await request(createApp())
      .get('/v1/public/projects')
      .set('x-quorum-public-access-key', config.publicAccessGateSecret)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('reserva la administración natural y exige asignación explícita al resto', async () => {
    expect(await resolveRoles('dev@politeia.ar')).toEqual(['quorum_admin', 'quorum_editor']);
    expect(await resolveRoles('info@politeia.ar')).toEqual(['quorum_admin', 'quorum_editor']);
    expect(await resolveRoles('persona@politeia.ar')).toEqual([]);
    await testStore.set('roles', 'persona-politeia-ar', {
      id: 'persona-politeia-ar', email: 'persona@politeia.ar', roles: ['quorum_editor'], active: true, updatedAt: new Date().toISOString(),
    });
    expect(await resolveRoles('persona@politeia.ar')).toEqual(['quorum_editor']);
  });

  it('nunca expone los seis borradores en la API pública', async () => {
    const response = await request(createApp()).get('/v1/public/projects').expect(200);
    expect(response.body.items).toEqual([]);
    expect(response.headers['cache-control']).toContain('s-maxage=300');
    expect(response.headers.etag).toBeTruthy();
    const manage = await request(createApp()).get('/v1/manage/bootstrap').expect(200);
    expect(manage.body.projects).toHaveLength(6);
    expect(manage.headers['cache-control']).toBe('private, no-store');
  });

  it('publica una revisión atómica y materializa relaciones', async () => {
    const [project] = await testStore.list<Project>('projects');
    const completed = {
      ...project,
      docketNumber: '1234-D-2026',
      entryDate: '2026-08-03',
      originChamberId: 'diputados',
      initiativeTypeId: 'poder-legislativo',
      summary: 'Un resumen editorial validado que explica el contenido del proyecto.',
      impact: 'Una explicación clara de cómo la propuesta puede afectar a la ciudadanía.',
    };
    await testStore.set('projects', project.id, completed);
    const published = await request(createApp())
      .post(`/v1/manage/projects/${project.id}/publish`)
      .send({ changeSummary: 'Primera publicación validada', notifyFollowers: false })
      .expect(200);
    expect(published.body.revision.number).toBe(1);
    const publicList = await request(createApp()).get('/v1/public/projects').expect(200);
    expect(publicList.body.items[0].slug).toBe(project.slug);
    expect(publicList.body.items[0].workflow.stages).toHaveLength(8);
  });

  it('materializa como etapa vigente el último cambio indicado por la cronología', async () => {
    const [project] = await testStore.list<Project>('projects');
    await testStore.set('projects', project.id, {
      ...project,
      docketNumber: '9876-D-2026', entryDate: '2026-08-03', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
      summary: 'Resumen editorial suficiente para publicar el proyecto con su cronología.',
      impact: 'Impacto editorial suficiente para validar la etapa efectiva del proyecto.',
      currentStageId: 'mesa-de-entrada',
      updates: [
        { id: 'note', date: '2026-08-08', title: 'Nota posterior', body: 'Esta nota no cambia la etapa.', stageId: null, sources: [] },
        { id: 'media', date: '2026-08-07', title: 'Media sanción', body: 'La cámara otorgó media sanción.', stageId: 'media-sancion', sources: [] },
        { id: 'dictamen', date: '2026-08-06', title: 'Dictamen', body: 'La comisión emitió dictamen.', stageId: 'dictamen', sources: [] },
      ],
    });

    const published = await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ notifyFollowers: false }).expect(200);
    expect(published.body.project.currentStageId).toBe('mesa-de-entrada');
    expect(published.body.publicProject.currentStageId).toBe('media-sancion');
    expect(published.body.publicProject.historicalStageId).toBe('mesa-de-entrada');
    const publicProject = await request(createApp()).get(`/v1/public/projects/${project.slug}`).expect(200);
    expect(publicProject.body.item.currentStageId).toBe('media-sancion');
    expect(publicProject.body.item.historicalStageId).toBe('mesa-de-entrada');
  });

  it('acepta publicar sin resumen de cambio y conserva todos los datos al volver a editar', async () => {
    const [project] = await testStore.list<Project>('projects');
    const completed = {
      ...project,
      docketNumber: '2468-D-2026', entryDate: '2026-08-03', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
      summary: 'Resumen persistente que debe seguir disponible después de publicar y recargar.',
      impact: 'Impacto persistente que tampoco puede perderse al preparar una actualización.',
      sources: [{ id: 'source-regression', label: 'Fuente oficial de prueba', url: 'https://example.com/fuente', publishedAt: '2026-08-03' }],
      documents: [{ id: 'document-regression', title: 'Documento oficial de prueba', kind: 'link' as const, url: 'https://example.com/documento.pdf', sourceLabel: 'Congreso', documentDate: '2026-08-03' }],
      updates: [{ id: 'update-regression', date: '2026-08-03', title: 'Actualización persistente', body: 'Detalle público persistente.', stageId: 'mesa-de-entrada', sources: [] }],
    };
    await testStore.set('projects', project.id, completed);
    const firstPublication = await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ changeSummary: '', notifyFollowers: false }).expect(200);
    expect(firstPublication.body.revision.changeSummary).toBe('');
    expect(firstPublication.body.project).toMatchObject({ summary: completed.summary, impact: completed.impact, sources: completed.sources, documents: completed.documents, updates: completed.updates });

    await request(createApp()).patch(`/v1/manage/projects/${project.id}`).send({ summary: 'Resumen actualizado desde la ficha ya publicada, sin perder los demás campos.' }).expect(200);
    const manage = await request(createApp()).get('/v1/manage/bootstrap').expect(200);
    const reopened = manage.body.projects.find((item: Project) => item.id === project.id);
    expect(reopened).toMatchObject({ impact: completed.impact, sources: completed.sources, documents: completed.documents, updates: completed.updates });
    expect(reopened.summary).toContain('Resumen actualizado');

    await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ notifyFollowers: false }).expect(200);
    const publicProject = await request(createApp()).get(`/v1/public/projects/${project.slug}`).expect(200);
    expect(publicProject.body.item).toMatchObject({ summary: reopened.summary, impact: completed.impact, sources: completed.sources, documents: completed.documents, updates: completed.updates });
  });

  it('sólo permite notificar cuando cambió la cronología desde la última publicación', async () => {
    const [project] = await testStore.list<Project>('projects');
    await testStore.set('projects', project.id, {
      ...project,
      docketNumber: '9753-D-2026', entryDate: '2026-08-03', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
      summary: 'Resumen suficiente para publicar y probar la regla de notificación editorial.',
      impact: 'Impacto suficiente para completar la primera revisión pública del proyecto.',
    });
    await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ notifyFollowers: false }).expect(200);

    await request(createApp()).patch(`/v1/manage/projects/${project.id}`).send({ summary: 'Corrección del resumen que no modifica la cronología pública del proyecto.' }).expect(200);
    const blocked = await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ notifyFollowers: true }).expect(422);
    expect(blocked.body.error.code).toBe('notification_requires_chronology_change');

    await request(createApp()).patch(`/v1/manage/projects/${project.id}`).send({
      updates: [{ id: 'timeline-change', date: '2026-08-06', title: 'Nuevo dictamen', body: 'La comisión emitió un dictamen.', stageId: 'dictamen', sources: [] }],
    }).expect(200);
    const allowed = await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ notifyFollowers: true }).expect(200);
    expect(allowed.body.revision.notifyFollowers).toBe(true);
  });

  it('expone autoría y firmantes aprobados sin publicar los perfiles privados completos', async () => {
    const [project] = await testStore.list<Project>('projects');
    const updatedAt = '2026-08-03T15:00:00.000Z';
    const author: Legislator = { id: 'author-private', slug: 'autora-privada', fullName: 'Autora de Prueba', party: 'Partido Federal', bloc: 'Bloque Federal', district: 'Córdoba', office: 'diputado', mandateStart: null, mandateEnd: null, academicTitle: 'Dato editorial privado', bio: 'Biografía todavía no publicada.', attendance: null, published: false, updatedAt };
    const signatory: Legislator = { id: 'signatory-private', slug: 'firmante-privado', fullName: 'Firmante de Prueba', party: 'Partido Provincial', bloc: 'Bloque Provincial', district: 'Santa Fe', office: 'senador', mandateStart: null, mandateEnd: null, academicTitle: '', bio: 'Otro contenido privado.', attendance: null, published: false, updatedAt };
    await testStore.set('legislators', author.id, author);
    await testStore.set('legislators', signatory.id, signatory);
    await testStore.set('projects', project.id, {
      ...project,
      docketNumber: '1357-D-2026', entryDate: '2026-08-03', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
      summary: 'Resumen validado para comprobar la atribución pública del proyecto legislativo.',
      impact: 'Impacto validado que permite publicar y comprobar los datos de autoría y firmas.',
      authorLegislatorId: author.id, signatoryIds: [signatory.id],
    });

    await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ notifyFollowers: false }).expect(200);
    const response = await request(createApp()).get(`/v1/public/projects/${project.slug}`).expect(200);

    expect(response.body.item.authorAttribution).toMatchObject({ id: author.id, fullName: author.fullName, office: author.office, published: false });
    expect(response.body.item.signatoryAttributions).toEqual([expect.objectContaining({ id: signatory.id, fullName: signatory.fullName, office: signatory.office, published: false })]);
    expect(response.body.item.authorAttribution).not.toHaveProperty('bio');
    expect(response.body.item.signatoryAttributions[0]).not.toHaveProperty('academicTitle');
    expect(response.body.item.author).toBeNull();
    expect(response.body.item.signatories).toEqual([]);
  });

  it('bloquea suscripciones mientras la política no esté aprobada', async () => {
    const response = await request(createApp())
      .post('/v1/public/follows/request')
      .send({ email: 'persona@example.com', projectId: 'missing', consent: true })
      .expect(503);
    expect(response.body.error.code).toBe('subscriptions_disabled');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('impide habilitar seguimiento sin aprobación de privacidad', async () => {
    const settings = await testStore.get<SiteSettings>('settings', 'public');
    const response = await request(createApp())
      .patch('/v1/manage/settings')
      .send({ ...settings, subscriptionsEnabled: true, privacyPolicyApproved: false })
      .expect(409);
    expect(response.body.error.code).toBe('privacy_approval_required');
  });

  it('persiste explicaciones editoriales globales y excepciones por proyecto', async () => {
    const manage = await request(createApp()).get('/v1/manage/bootstrap').expect(200);
    const workflow = manage.body.workflows[0];
    const globalRule = {
      workflowId: workflow.id, workflowVersion: workflow.version, stageId: 'comisiones', chamberId: 'diputados', initiativeTypeId: 'iniciativa-popular',
      summary: 'Resumen editorial específico para una iniciativa popular en comisiones.',
      contextualDetail: 'Detalle editorial específico que complementa el procedimiento general para esta combinación.',
    };
    await request(createApp()).patch('/v1/manage/settings').send({ legislativeStageExplanations: [globalRule] }).expect(200);
    const publicBootstrap = await request(createApp()).get('/v1/public/bootstrap').expect(200);
    expect(publicBootstrap.body.settings.legislativeStageExplanations).toEqual([globalRule]);

    const [project] = await testStore.list<Project>('projects');
    const projectRule = {
      stageId: 'comisiones',
      summary: 'Resumen excepcional escrito únicamente para este proyecto legislativo.',
      contextualDetail: 'Detalle excepcional que prevalece sobre la configuración editorial general del sitio.',
    };
    await request(createApp()).patch(`/v1/manage/projects/${project.id}`).send({ stageExplanationOverrides: [projectRule] }).expect(200);
    const refreshed = await request(createApp()).get('/v1/manage/bootstrap').expect(200);
    expect(refreshed.body.projects.find((item: Project) => item.id === project.id).stageExplanationOverrides).toEqual([projectRule]);
  });

  it('valida definiciones breves y evita alias duplicados normalizados', async () => {
    const first = await request(createApp()).post('/v1/manage/glossary').send({
      term: 'Dictamen', slug: 'dictamen', shortDefinition: 'Decisión emitida por una comisión.',
      definition: 'Definición editorial completa del dictamen.', aliases: ['despacho de comisión'],
      inlineEnabled: true, references: [], published: true,
    }).expect(201);
    expect(first.body.item.updatedBy).toBe('dev@politeia.ar');

    const missingShort = await request(createApp()).post('/v1/manage/glossary').send({
      term: 'Promulgación', slug: 'promulgacion', shortDefinition: '', definition: 'Definición completa.',
      aliases: [], inlineEnabled: true, references: [], published: true,
    }).expect(422);
    expect(missingShort.body.error.code).toBe('glossary_short_definition_required');

    const conflict = await request(createApp()).post('/v1/manage/glossary').send({
      term: 'Despacho de Comision', slug: 'despacho-de-comision', shortDefinition: 'Otra definición.',
      definition: 'Otra definición completa.', aliases: [], inlineEnabled: false, references: [], published: false,
    }).expect(409);
    expect(conflict.body.error.code).toBe('glossary_alias_conflict');
  });

  it('aplica términos nuevos automáticamente a proyectos ya publicados sin asociación manual', async () => {
    const [project] = await testStore.list<Project>('projects');
    await testStore.set('projects', project.id, {
      ...project,
      docketNumber: '8080-D-2026', entryDate: '2026-08-03', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
      summary: 'El proyecto obtuvo media sanción y continúa su tratamiento legislativo.',
      impact: 'La propuesta todavía debe atravesar otras instancias antes de convertirse en ley.',
      glossaryTermIds: [],
    });
    await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ notifyFollowers: false }).expect(200);
    await request(createApp()).post('/v1/manage/glossary').send({
      term: 'Media sanción', slug: 'media-sancion', shortDefinition: 'Aprobación de una sola cámara del Congreso.',
      definition: 'Es la aprobación de un proyecto por una de las dos cámaras.', aliases: ['proyecto con media sancion'],
      inlineEnabled: true, references: [], published: true,
    }).expect(201);

    const response = await request(createApp()).get(`/v1/public/projects/${project.slug}`).expect(200);
    expect(response.body.item.glossary).toEqual([
      expect.objectContaining({ term: 'Media sanción', inlineEnabled: true, published: true }),
    ]);
  });

  it('respeta la lista negra y la desactivación de glosario por proyecto', async () => {
    const [project] = await testStore.list<Project>('projects');
    const created = await request(createApp()).post('/v1/manage/glossary').send({
      term: 'Democracia', slug: 'democracia', shortDefinition: 'Forma de organización política.',
      definition: 'Definición completa de democracia.', aliases: [], inlineEnabled: true, references: [], published: true,
    }).expect(201);
    await testStore.set('projects', project.id, {
      ...project,
      docketNumber: '8181-D-2026', entryDate: '2026-08-03', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
      summary: 'La democracia aparece varias veces porque la democracia organiza el debate.',
      impact: 'La democracia también forma parte del impacto explicado a la ciudadanía.',
      glossaryExcludedTermIds: [created.body.item.id], glossaryOccurrenceMode: 'first',
    });
    await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ notifyFollowers: false }).expect(200);
    const excluded = await request(createApp()).get(`/v1/public/projects/${project.slug}`).expect(200);
    expect(excluded.body.item.glossary).toEqual([]);
    expect(excluded.body.item.glossaryOccurrenceMode).toBe('first');

    await request(createApp()).patch(`/v1/manage/projects/${project.id}`).send({ glossaryExcludedTermIds: [], glossaryEnabled: false }).expect(200);
    await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ notifyFollowers: false }).expect(200);
    const disabled = await request(createApp()).get(`/v1/public/projects/${project.slug}`).expect(200);
    expect(disabled.body.item.glossary).toEqual([]);
    expect(disabled.body.item.glossaryEnabled).toBe(false);
  });

  it('completa doble opt-in, exportación, baja y borrado sin exponer tokens almacenados', async () => {
    const [project] = await testStore.list<Project>('projects');
    await testStore.set('projects', project.id, {
      ...project, docketNumber: '555-D-2026', entryDate: '2026-08-03', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
      summary: 'Resumen público suficientemente completo para validar la publicación.', impact: 'Impacto ciudadano suficientemente completo para validar la publicación.',
    });
    await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ changeSummary: 'Publicación para suscripciones', notifyFollowers: false }).expect(200);
    const settings = await testStore.get<SiteSettings>('settings', 'public');
    await testStore.set('settings', 'public', { ...settings!, privacyPolicyApproved: true, subscriptionsEnabled: true });
    const requested = await request(createApp()).post('/v1/public/follows/request').send({ email: 'persona@example.com', projectId: project.id, consent: true }).expect(202);
    const confirmed = await request(createApp()).post('/v1/public/follows/confirm').send({ token: requested.body.debugToken }).expect(200);
    const token = confirmed.body.manageToken;
    const exported = await request(createApp()).get(`/v1/public/follows/export?token=${encodeURIComponent(token)}`).expect(200);
    expect(exported.body.data.email).toBe('persona@example.com');
    await request(createApp()).post('/v1/public/follows/unsubscribe').send({ token }).expect(200);
    const removed = await request(createApp()).delete('/v1/public/follows/preferences').send({ token }).expect(200);
    expect(removed.body.deleted).toBe(true);
    const storedTokens = await testStore.list<{ id: string }>('subscriptionTokens');
    expect(storedTokens.every((item) => item.id.length === 64)).toBe(true);
  });

  it('restaura una revisión como borrador sin alterar la proyección ni el historial', async () => {
    const [project] = await testStore.list<Project>('projects');
    await testStore.set('projects', project.id, {
      ...project, docketNumber: '777-S-2026', entryDate: '2026-08-03', originChamberId: 'senado', initiativeTypeId: 'poder-legislativo',
      summary: 'Versión original del resumen con contenido editorial validado.', impact: 'Versión original del impacto con contenido editorial validado.',
    });
    const published = await request(createApp()).post(`/v1/manage/projects/${project.id}/publish`).send({ changeSummary: 'Versión original', notifyFollowers: false }).expect(200);
    await request(createApp()).patch(`/v1/manage/projects/${project.id}`).send({ summary: 'Cambio posterior que sólo vive en el borrador editorial.' }).expect(200);
    const restored = await request(createApp()).post(`/v1/manage/projects/${project.id}/revisions/${published.body.revision.id}/restore`).expect(200);
    expect(restored.body.item.status).toBe('draft');
    expect(restored.body.item.summary).toContain('Versión original');
    const publicProject = await request(createApp()).get(`/v1/public/projects/${project.slug}`).expect(200);
    expect(publicProject.body.item.summary).toContain('Versión original');
    expect(await testStore.list('revisions')).toHaveLength(1);
  });

  it('rechaza orígenes no autorizados con el contrato de error uniforme', async () => {
    const response = await request(createApp()).post('/v1/public/metrics').set('Origin', 'https://evil.example').send({ event: 'search-used' }).expect(403);
    expect(response.body.error.code).toBe('origin_not_allowed');
    expect(response.body.error.requestId).toBeTypeOf('string');
  });

  it('rechaza identidades OIDC inválidas en la sincronización programada', async () => {
    const previousEnabled = config.congressAutoSyncEnabled; const previousEmail = config.congressSyncInvokerEmail;
    config.congressAutoSyncEnabled = true; config.congressSyncInvokerEmail = 'scheduler@project.iam.gserviceaccount.com';
    try {
      const response = await request(createApp()).post('/v1/operations/integrations/legislators/sync-due').set('Authorization', 'Bearer invalid-token').expect(403);
      expect(response.body.error.code).toBe('scheduler_identity_invalid');
    } finally {
      config.congressAutoSyncEnabled = previousEnabled; config.congressSyncInvokerEmail = previousEmail;
    }
  });
});
