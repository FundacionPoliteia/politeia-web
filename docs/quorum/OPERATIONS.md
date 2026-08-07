# Operación, lanzamiento y recuperación

Para el primer despliegue privado y el checklist completo de GitHub, Google Cloud, OAuth, Vercel, DNS y secretos, seguir [BATCH-DEPLOYMENT.md](./BATCH-DEPLOYMENT.md).

## Provisionamiento

> Estado inicial del 3 de agosto de 2026: el proyecto `politeia-quorum`, la base Firestore `quorum-staging` y el bucket `politeia-quorum-quorum-staging-source-snapshots` se crearon manualmente para la primera importación controlada. Antes del primer `terraform apply`, importar esos recursos al state de Terraform; no intentar recrearlos.

1. Crear un proyecto GCP exclusivo y una cuenta de Terraform con permisos acotados.
2. Crear el repositorio Artifact Registry y subir una imagen inmutable de la API.
3. Completar un `terraform.tfvars` fuera de Git y ejecutar `terraform plan` sobre `infra/quorum/terraform`.
4. Revisar especialmente nombres de proyecto, regiones, dominios, bases y políticas IAM; recién entonces aplicar.
5. Cargar versiones de Secret Manager manualmente. Terraform crea los contenedores de secretos, no sus valores.
6. Desplegar `apps/quorum` como proyecto Vercel independiente con root directory `apps/quorum`.
7. Asociar primero los tres hosts de staging. OAuth debe permitir sólo los orígenes exactos y las cuentas asignadas.
8. Configurar Resend con remitente, dominio, webhook y audiencia propios. Mantener `subscriptionsEnabled=false`.
9. Mantener `congress_import_enabled`, `hcdn_import_enabled`, `senate_import_enabled` y `congress_auto_sync_enabled` en `false` al crear los entornos. La primera activación se hace únicamente en staging siguiendo `CONGRESS-INTEGRATION.md`.
10. Antes de activar términos contextuales existentes, ejecutar `npm run quorum:migrate:glossary-inline`, revisar definiciones breves y habilitar cada término manualmente.

## Variables web mínimas

`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_QUORUM_API_BASE_URL`, `QUORUM_API_BASE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_REVALIDATE_SECRET`, `GESTION_HOSTS`, `STAGING_HOSTS`, `STAGING_ACCESS_REQUIRED=true`, `PUBLIC_ACCESS_REQUIRED=true`, `SESSION_SECRET`, `SESSION_COOKIE_NAME`, `PUBLIC_ACCESS_GATE_SECRET` y `NEXT_PUBLIC_ENVIRONMENT`.

## UAT cerrado

- Confirmar que los seis registros son borradores sin afirmaciones no validadas.
- Cargar y verificar fuentes manualmente; no existe scraping.
- Probar editor y administrador con cuentas reales, incluida una externa asignada.
- Publicar, cambiar etapa, restaurar y archivar un proyecto de prueba.
- Validar PDF por firma, MIME, tamaño y descarga autenticada por la API.
- Aprobar institucionalmente `/privacidad` antes de activar correo.
- Probar doble opt-in, preferencias, baja, borrado, rebote y webhook.
- Ejecutar `quorum:check`, `quorum:test`, `quorum:build` y `quorum:e2e`.
- Ejecutar una exportación Firestore, restaurarla en una base temporal y documentar duración/resultado.

## Salida gradual

1. Desplegar producción sin enlace desde `politeia.ar`.
2. Verificar canonical, Open Graph, `robots`, CORS, cookies, CSRF, rate limits, Turnstile y logs.
3. Publicar contenido validado y monitorear errores, latencia, trabajos de correo y exportación diaria.
4. Sólo después, agregar en la web actual una variable de entorno que habilite el enlace externo a Quórum. Ese cambio no forma parte de este workspace aislado.
5. Rollback del enlace: desactivar la variable. Rollback web: deployment anterior de Vercel. Rollback API: revisión anterior de Cloud Run. Rollback editorial: restaurar una revisión como borrador y publicarla como una revisión nueva.

## Backups

Cloud Scheduler llama diariamente al endpoint OIDC `/v1/operations/backups/export`. Las exportaciones van a un bucket privado con retención de 30 días. Storage documental mantiene versionado y elimina versiones antiguas según la regla de ciclo de vida. Una exportación no se considera operativa hasta demostrar una restauración real.

## Alertas recomendadas

- API: 5xx > 1%, p95 > 1 s, instancias sin disponibilidad.
- Publicación: transacciones fallidas o revalidación repetidamente fallida.
- Correo: jobs en `pending` por más de 10 minutos, rebotes y webhooks inválidos.
- Backups: ausencia del prefijo del día o error del Scheduler.
- Seguridad: picos de 401/403/429, uploads rechazados y cambios de roles.
- Integraciones: ejecución en cuarentena, tres fallos consecutivos, fuente vencida, caída abrupta del total de legisladores, cambio de esquema, snapshot sin éxito durante siete días o sugerencias pendientes sin revisar.
