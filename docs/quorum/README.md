# Quórum MVP

Quórum vive aislado del sitio público actual. La aplicación web está en `apps/quorum`, la API en `services/quorum-api`, los contratos en `packages/quorum-contracts` y la infraestructura declarativa en `infra/quorum`.

## Desarrollo local

1. Ejecutar `npm install` en la raíz.
2. Ejecutar `gcloud auth application-default login --project=politeia-quorum`. La API usa estas credenciales sólo desde tu computadora.
3. Copiar `services/quorum-api/.env.example` a `.env`. La configuración local persistente debe señalar exclusivamente `GCP_PROJECT_ID=politeia-quorum`, `FIRESTORE_DATABASE_ID=quorum-staging` y `DATA_STORE=firestore`.
4. Copiar `apps/quorum/.env.example` a `.env.local`.
5. Ejecutar una vez `npm run quorum:seed` y comprobar la conexión con `npm run quorum:verify:store`.
6. Iniciar toda la aplicación con `npm run quorum:dev:persistent`.
7. Abrir `http://localhost:3100` para la experiencia pública y `http://gestion.localhost:3100` —o `/gestion`— para el gestor.

El navegador nunca accede directamente a Firestore: público y gestor consumen `http://localhost:8090`, y esa API escribe en la base nombrada `quorum-staging`. El seed es idempotente, conserva proyectos ya editados y no completa afirmaciones legislativas. El endpoint `GET /readyz` comprueba una lectura real de la base; `GET /healthz` sólo indica que el proceso está vivo.

Para pruebas efímeras aisladas se puede arrancar la API con `DATA_STORE=memory npm run quorum:api:dev`. La suite automatizada ya fuerza ese modo y nunca escribe staging.

### Datos que persisten

- Proyectos privados, proyecciones públicas y revisiones inmutables.
- Legisladores, vínculos oficiales, snapshots, sugerencias y procedencia.
- Glosario, alias y activación contextual.
- Catálogos, workflows, configuración, suscripciones, auditoría y métricas.
- Metadatos de PDFs en Firestore; archivos y snapshots en buckets privados de staging.

Si `npm run quorum:verify:store` informa credenciales vencidas, repetir el acceso de Google. Nunca cambiar la base local a `quorum-production`.

## Límites de aislamiento

- No existe una importación desde Quórum hacia componentes o rutas de la web pública actual.
- Los borradores y proyecciones públicas viven en colecciones diferentes.
- Staging y producción usan bases Firestore, buckets, cuentas de servicio, secretos y servicios Cloud Run diferentes.
- La publicación es la única operación que materializa una ficha pública y crea una revisión inmutable.
- Los hosts de gestión se reescriben a `/gestion`; staging y gestión emiten `noindex`.
- El logo productivo es tipográfico hasta recibir una marca aprobada.
- La integración legislativa nace desactivada. Al habilitarla, primero guarda una copia externa aislada y sólo permite importaciones privadas asistidas; nunca publica automáticamente.

## Verificación

- `npm run quorum:check`: TypeScript en contratos, API y web.
- `npm run quorum:test`: esquemas y API con almacén aislado.
- `npm run quorum:build`: artefactos productivos.
- `npm run quorum:e2e`: flujos públicos/gestión y axe en Chromium desktop/móvil.
- `npm run quorum:verify:store`: lectura real y conteos de Firestore staging.

## Superficies

| Entorno | Público | Gestión | API |
|---|---|---|---|
| Local | `localhost:3100` | `localhost:3100/gestion` o `gestion.localhost:3100` | `localhost:8090` |
| Staging | `staging.quorum.politeia.ar` | `gestion.staging.quorum.politeia.ar` | `api.staging.quorum.politeia.ar` |
| Producción | `quorum.politeia.ar` | `gestion.quorum.politeia.ar` | `api.quorum.politeia.ar` |

La configuración exacta de dominios es deliberadamente externa al código. No se deben crear DNS ni credenciales desde una computadora de desarrollo.

La guía de activación y contingencia de fuentes oficiales está en `CONGRESS-INTEGRATION.md`. La configuración editorial y migración del marcado inline está en `GLOSSARY-CONTEXT.md`.
