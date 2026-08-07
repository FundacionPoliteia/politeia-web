import {
  apiErrorSchema, catalogItemSchema, contentRevisionSchema, glossaryTermSchema, legislatorImportSuggestionSchema, legislatorRevisionSchema, legislatorSchema,
  projectSchema, publicProjectSchema, roleAssignmentSchema, siteSettingsSchema, subscriptionSchema, workflowDefinitionSchema,
} from '@politeia/quorum-contracts';
import { zodToJsonSchema } from 'zod-to-json-schema';

const json = (schema: Parameters<typeof zodToJsonSchema>[0]) => zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' });
const ok = (description: string, schema?: Record<string, unknown>) => ({ description, ...(schema ? { content: { 'application/json': { schema } } } : {}) });
const errorResponses = { '401': ok('Autenticación requerida', { $ref: '#/components/schemas/ApiError' }), '403': ok('Permiso insuficiente', { $ref: '#/components/schemas/ApiError' }), '422': ok('Datos inválidos', { $ref: '#/components/schemas/ApiError' }) };

export const openApiSpec = {
  openapi: '3.1.0',
  info: { title: 'Quórum API', version: '1.0.0', description: 'API pública, de seguimiento y editorial de Quórum Politeia. Los esquemas se generan desde los contratos Zod compartidos.' },
  servers: [{ url: '/v1' }],
  tags: [{ name: 'Public' }, { name: 'Subscriptions' }, { name: 'Auth' }, { name: 'Manage' }, { name: 'Integrations' }, { name: 'Operations' }],
  components: {
    securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'quorum_session' }, csrf: { type: 'apiKey', in: 'header', name: 'x-csrf-token' } },
    schemas: {
      Project: json(projectSchema), PublicProject: json(publicProjectSchema), Legislator: json(legislatorSchema), GlossaryTerm: json(glossaryTermSchema),
      WorkflowDefinition: json(workflowDefinitionSchema), CatalogItem: json(catalogItemSchema), ContentRevision: json(contentRevisionSchema),
      Subscription: json(subscriptionSchema), SiteSettings: json(siteSettingsSchema), RoleAssignment: json(roleAssignmentSchema), ApiError: json(apiErrorSchema),
      LegislatorImportSuggestion: json(legislatorImportSuggestionSchema), LegislatorRevision: json(legislatorRevisionSchema),
    },
  },
  paths: {
    '/public/bootstrap': { get: { tags: ['Public'], summary: 'Contenido público y catálogos visibles', responses: { '200': ok('Bootstrap público') } } },
    '/public/projects': { get: { tags: ['Public'], summary: 'Lista proyectos publicados', responses: { '200': ok('Proyectos') } } },
    '/public/projects/{slug}': { get: { tags: ['Public'], summary: 'Obtiene una ficha pública', parameters: [{ in: 'path', name: 'slug', required: true, schema: { type: 'string' } }], responses: { '200': ok('Proyecto', { $ref: '#/components/schemas/PublicProject' }), '404': ok('No encontrado') } } },
    '/public/follows/request': { post: { tags: ['Subscriptions'], summary: 'Solicita seguimiento con consentimiento', responses: { '202': ok('Confirmación encolada'), ...errorResponses } } },
    '/public/follows/confirm': { post: { tags: ['Subscriptions'], summary: 'Confirma doble opt-in', responses: { '200': ok('Suscripción confirmada'), ...errorResponses } } },
    '/public/follows/preferences': { get: { tags: ['Subscriptions'], summary: 'Consulta preferencias', responses: { '200': ok('Preferencias'), ...errorResponses } }, patch: { tags: ['Subscriptions'], summary: 'Actualiza preferencias o da de baja', responses: { '200': ok('Preferencias actualizadas'), ...errorResponses } }, delete: { tags: ['Subscriptions'], summary: 'Borra y anonimiza datos', responses: { '200': ok('Datos borrados'), ...errorResponses } } },
    '/public/follows/export': { get: { tags: ['Subscriptions'], summary: 'Exporta los datos de la persona', responses: { '200': ok('Exportación JSON'), ...errorResponses } } },
    '/auth/google': { post: { tags: ['Auth'], summary: 'Crea una sesión con Google Identity', responses: { '200': ok('Sesión creada'), ...errorResponses } } },
    '/me': { get: { tags: ['Auth'], summary: 'Devuelve la sesión editorial', security: [{ sessionCookie: [] }], responses: { '200': ok('Usuario'), ...errorResponses } } },
    '/manage/bootstrap': { get: { tags: ['Manage'], summary: 'Datos completos del gestor', security: [{ sessionCookie: [] }], responses: { '200': ok('Bootstrap editorial'), ...errorResponses } } },
    '/manage/projects': { post: { tags: ['Manage'], summary: 'Crea un borrador', security: [{ sessionCookie: [], csrf: [] }], responses: { '201': ok('Borrador creado'), ...errorResponses } } },
    '/manage/projects/{id}': { patch: { tags: ['Manage'], summary: 'Actualiza un borrador', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Borrador actualizado'), ...errorResponses } } },
    '/manage/projects/{id}/preview': { get: { tags: ['Manage'], summary: 'Materializa una vista previa privada', security: [{ sessionCookie: [] }], responses: { '200': ok('Vista previa'), ...errorResponses } } },
    '/manage/projects/{id}/publish': { post: { tags: ['Manage'], summary: 'Publica una revisión atómica e inmutable', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Revisión publicada'), ...errorResponses } } },
    '/manage/projects/{id}/revisions/{revisionId}/restore': { post: { tags: ['Manage'], summary: 'Restaura como borrador sin reescribir historial', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Borrador restaurado'), ...errorResponses } } },
    '/manage/integrations': { get: { tags: ['Integrations'], summary: 'Estado privado de fuentes oficiales', security: [{ sessionCookie: [] }], responses: { '200': ok('Estado de integraciones'), ...errorResponses } } },
    '/manage/integrations/hcdn-legislators/sync': { post: { tags: ['Integrations'], summary: 'Sincroniza manualmente Diputados en almacenamiento privado', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Sincronización completada'), ...errorResponses } } },
    '/manage/integrations/senate-legislators/sync': { post: { tags: ['Integrations'], summary: 'Sincroniza manualmente Senado en almacenamiento privado', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Sincronización completada'), ...errorResponses } } },
    '/manage/integrations/legislators/bulk-import-all': { post: { tags: ['Integrations'], summary: 'Crea en privado los perfiles faltantes de ambas cámaras', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Importación bicameral completada'), ...errorResponses } } },
    '/manage/integrations/legislators/search': { get: { tags: ['Integrations'], summary: 'Busca perfiles en el último snapshot válido', security: [{ sessionCookie: [] }], responses: { '200': ok('Resultados oficiales'), ...errorResponses } } },
    '/manage/integrations/legislators/import': { post: { tags: ['Integrations'], summary: 'Importa campos seleccionados a un perfil privado', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Perfil privado importado'), ...errorResponses } } },
    '/manage/integrations/legislators/bulk-import': { post: { tags: ['Integrations'], summary: 'Crea de forma idempotente los perfiles privados faltantes del snapshot vigente', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Importación masiva completada'), ...errorResponses } } },
    '/manage/integrations/legislators/sync-all': { post: { tags: ['Integrations'], summary: 'Comprueba manualmente las dos fuentes oficiales', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Comprobación completada'), ...errorResponses } } },
    '/manage/integrations/legislators/changes': { get: { tags: ['Integrations'], summary: 'Lista diferencias oficiales pendientes o revisadas', security: [{ sessionCookie: [] }], responses: { '200': ok('Cambios oficiales'), ...errorResponses } } },
    '/manage/integrations/legislators/changes/{id}/apply': { post: { tags: ['Integrations'], summary: 'Aplica campos seleccionados y crea una revisión inmutable', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Cambio aplicado'), ...errorResponses } } },
    '/manage/integrations/legislators/changes/{id}/dismiss': { post: { tags: ['Integrations'], summary: 'Descarta un cambio con motivo editorial', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Cambio descartado'), ...errorResponses } } },
    '/manage/integrations/legislators/changes/{id}/reopen': { post: { tags: ['Integrations'], summary: 'Reabre un cambio descartado', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Cambio reabierto'), ...errorResponses } } },
    '/manage/legislators/{id}/revisions': { get: { tags: ['Integrations'], summary: 'Lista revisiones inmutables de un legislador', security: [{ sessionCookie: [] }], responses: { '200': ok('Revisiones'), ...errorResponses } } },
    '/manage/legislators/{id}/revisions/{revisionId}/restore': { post: { tags: ['Integrations'], summary: 'Restaura datos mediante una revisión nueva', security: [{ sessionCookie: [], csrf: [] }], responses: { '200': ok('Revisión restaurada'), ...errorResponses } } },
    '/manage/documents': { post: { tags: ['Manage'], summary: 'Carga un PDF validado con metadatos', security: [{ sessionCookie: [], csrf: [] }], responses: { '201': ok('Documento cargado'), ...errorResponses } } },
    '/manage/media/images': { post: { tags: ['Manage'], summary: 'Carga una imagen editorial validada para contenido enriquecido', security: [{ sessionCookie: [], csrf: [] }], responses: { '201': ok('Imagen cargada'), ...errorResponses } } },
    '/operations/backups/export': { post: { tags: ['Operations'], summary: 'Inicia exportación diaria de Firestore mediante OIDC', responses: { '202': ok('Exportación iniciada'), ...errorResponses } } },
    '/operations/integrations/legislators/sync-due': { post: { tags: ['Operations'], summary: 'Comprueba mediante OIDC sólo las fuentes cuyo caché está vencido', responses: { '200': ok('Fuentes vencidas procesadas'), ...errorResponses } } },
  },
};
