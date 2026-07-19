# Manual de pase a produccion

Este runbook describe como pasar el sistema completo a produccion y como probarlo en vivo sin depender de supuestos. Cubre frontend, backend, subdominio interno, Google OAuth, roles, Resend, notificaciones opt-in, comentarios, publicacion, logs y rollback.

## Objetivo del pase

El estado esperado de produccion es:

- `https://politeia.ar` y `https://www.politeia.ar` muestran solo el sitio publico.
- `https://politeia.ar/admin` responde como no disponible para visitantes publicos.
- `https://admin.politeia.ar` redirige al panel interno.
- El panel interno usa Google OAuth, cookies persistentes, roles y permisos del backend.
- Usuarios `@politeia.ar` pueden entrar segun Google Groups o asignacion admin.
- Usuarios `@gmail.com` solo pueden entrar si un admin `@politeia.ar` les asigno roles.
- Las notificaciones por email son opt-in por usuario.
- El rol `blog` solo dispara emails al enviar un post a revision.
- Reviewer/admin disparan emails al crear comentarios, resolver/reabrir comentarios, publicar posts o cambiar roles.
- Archivar posts no dispara emails.

## Archivos relevantes

- `package.json`: comandos locales y de Cloud Run.
- `.env.local`: variables del frontend.
- `services/blog-api/.env`: variables locales del backend.
- `services/blog-api/.env.example`: plantilla del backend.
- `DEPLOYMENT.md`: deploy tecnico.
- `DEVELOPMENT.md`: pruebas locales.
- `PRODUCTION-RUNBOOK.md`: este manual operativo.

## Cuentas y accesos necesarios

Antes de empezar, confirmar acceso a:

- Google Cloud project: `quick-function-500420-v6`.
- Cloud Run service: `politeia-blog-api`.
- Artifact Registry: `us-central1-docker.pkg.dev/quick-function-500420-v6/politeia`.
- Firestore del proyecto.
- Cloud Storage bucket: `politeia-blog-media-quick-function-500420-v6`.
- Secret Manager del proyecto.
- Google OAuth client usado por el frontend.
- DNS de `politeia.ar`.
- Resend dashboard y dominio verificado.
- Proveedor de hosting del frontend, por ejemplo Vercel.

## Checklist previo

Desde la raiz del proyecto:

```bash
npm install
npm run blog-api:test
npm run blog-api:check
npm run build
```

No avanzar si alguno falla.

Verificar proyecto activo de gcloud:

```bash
gcloud config get-value project
```

Si no devuelve `quick-function-500420-v6`:

```bash
npm run blog-api:cloud:project
```

## 1. Preparar DNS y subdominio interno

En el DNS de `politeia.ar`:

```text
admin.politeia.ar -> mismo deployment frontend que politeia.ar
```

La forma exacta depende del hosting:

- En Vercel suele ser un registro `CNAME` a `cname.vercel-dns.com`.
- Si el hosting entrega registros propios, usar los que indique el proveedor.

Validar despues de propagar:

```bash
nslookup admin.politeia.ar
```

Prueba esperada:

- `https://admin.politeia.ar` abre el mismo frontend.
- El middleware redirige `/` a `/admin`.
- `https://politeia.ar/admin` no muestra el panel.

## 2. Configurar Google OAuth

En el OAuth Client de Google, agregar:

```text
Authorized JavaScript origins:
https://politeia.ar
https://www.politeia.ar
https://admin.politeia.ar
```

Para desarrollo local, si se necesita:

```text
http://localhost:3000
http://admin.localhost:3000
```

No usar `admin.localhost:3000` sin protocolo: Google lo rechaza. Si Google no permite el origen local para ese host, usar el boton de sesion local con `DEV_AUTH=true`.

## 3. Preparar Resend

En Resend:

1. Crear o entrar al workspace.
2. Verificar el dominio `politeia.ar`.
3. Copiar los registros DNS que indique Resend.
4. Crear esos registros en el DNS del dominio.
5. Esperar a que Resend marque el dominio como verificado.
6. Crear una API key desde `API Keys`.
7. Copiarla una sola vez y guardarla como secreto, no en el repositorio.

Variables esperadas:

```text
MAIL_PROVIDER=resend
MAIL_FROM=no-reply@politeia.ar
MAIL_REPLY_TO=
RESEND_API_KEY=secreto
APP_BASE_URL=https://admin.politeia.ar
```

Notas:

- `MAIL_FROM` debe pertenecer a un dominio verificado en Resend.
- Para pruebas controladas se puede usar un remitente validado por Resend, pero produccion debe usar `politeia.ar`.
- Si `MAIL_PROVIDER=console`, no salen emails reales: queda logueado como `logged`.
- Si `MAIL_PROVIDER=disabled`, se saltean entregas.

## 4. Guardar secretos en Google Secret Manager

Crear el secreto de Resend:

```bash
gcloud secrets create resend-api-key --replication-policy=automatic
```

Cargar el valor. Pegar la API key cuando el comando espere input:

```bash
gcloud secrets versions add resend-api-key --data-file=-
```

Crear secreto de sesion si todavia no existe:

```bash
gcloud secrets create blog-api-session-secret --replication-policy=automatic
gcloud secrets versions add blog-api-session-secret --data-file=-
```

Usar una cadena larga y privada para `SESSION_SECRET`.

Dar acceso a la service account de Cloud Run. Primero obtener la service account:

```bash
gcloud run services describe politeia-blog-api --region us-central1 --format="value(spec.template.spec.serviceAccountName)"
```

Si no devuelve nada, Cloud Run usa la default compute service account. Verificarla en la consola de Cloud Run.

Luego dar permiso sobre secretos:

```bash
gcloud secrets add-iam-policy-binding resend-api-key --member=serviceAccount:SERVICE_ACCOUNT --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding blog-api-session-secret --member=serviceAccount:SERVICE_ACCOUNT --role=roles/secretmanager.secretAccessor
```

Reemplazar `SERVICE_ACCOUNT` por el email real.

## 5. Configurar variables del backend en Cloud Run

Variables recomendadas para produccion:

```text
NODE_ENV=production
GCP_PROJECT_ID=quick-function-500420-v6
MEDIA_BUCKET=politeia-blog-media-quick-function-500420-v6
ALLOWED_ORIGIN=https://politeia.ar,https://www.politeia.ar,https://admin.politeia.ar
GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID_REAL
ALLOWED_EMAIL_DOMAIN=politeia.ar
ALLOWED_ASSIGNED_EMAIL_DOMAINS=gmail.com
SESSION_COOKIE_SAME_SITE=none
SESSION_COOKIE_SECURE=true
BLOG_GROUP_EMAIL=politeia-blog@politeia.ar
ADMIN_GROUP_EMAIL=politeia-admin@politeia.ar
REVIEWER_GROUP_EMAIL=politeia-reviewer@politeia.ar
MAIL_PROVIDER=resend
MAIL_FROM=no-reply@politeia.ar
MAIL_REPLY_TO=
APP_BASE_URL=https://admin.politeia.ar
```

Actualizar Cloud Run:

```bash
gcloud run services update politeia-blog-api --region us-central1 --set-env-vars NODE_ENV=production,GCP_PROJECT_ID=quick-function-500420-v6,MEDIA_BUCKET=politeia-blog-media-quick-function-500420-v6,ALLOWED_ORIGIN=https://politeia.ar,https://www.politeia.ar,https://admin.politeia.ar,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID_REAL,ALLOWED_EMAIL_DOMAIN=politeia.ar,ALLOWED_ASSIGNED_EMAIL_DOMAINS=gmail.com,SESSION_COOKIE_SAME_SITE=none,SESSION_COOKIE_SECURE=true,BLOG_GROUP_EMAIL=politeia-blog@politeia.ar,ADMIN_GROUP_EMAIL=politeia-admin@politeia.ar,REVIEWER_GROUP_EMAIL=politeia-reviewer@politeia.ar,MAIL_PROVIDER=resend,MAIL_FROM=no-reply@politeia.ar,APP_BASE_URL=https://admin.politeia.ar --set-secrets RESEND_API_KEY=resend-api-key:latest,SESSION_SECRET=blog-api-session-secret:latest
```

No activar:

```text
DEV_AUTH=true
```

`DEV_AUTH` debe estar ausente o en `false` en produccion.

Ver variables actuales:

```bash
npm run blog-api:cloud:env
```

## 6. Permisos de Google Cloud

La service account de Cloud Run necesita:

```bash
gcloud projects add-iam-policy-binding quick-function-500420-v6 --member=serviceAccount:SERVICE_ACCOUNT --role=roles/datastore.user
gcloud storage buckets add-iam-policy-binding gs://politeia-blog-media-quick-function-500420-v6 --member=serviceAccount:SERVICE_ACCOUNT --role=roles/storage.objectAdmin
```

Para validar Google Groups con Cloud Identity, la configuracion exacta puede depender del Workspace. Si aparecen errores de permisos en logs al resolver grupos, revisar que la service account tenga permisos de lectura suficientes para Cloud Identity/Groups o usar asignaciones manuales desde el panel admin como fallback.

## 7. Deploy del backend

Desde la raiz:

```bash
npm run blog-api:test
npm run blog-api:check
npm run blog-api:cloud:build
npm run blog-api:cloud:deploy
```

Ver URL:

```bash
npm run blog-api:cloud:url
```

Healthcheck:

```bash
curl -i https://URL_DE_CLOUD_RUN/healthz
```

Logs:

```bash
npm run blog-api:cloud:logs
```

## 8. Configurar frontend

En el hosting del frontend:

```text
BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
NEXT_PUBLIC_BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
NEXT_PUBLIC_GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID_REAL
NEXT_PUBLIC_SITE_URL=https://politeia.ar
NEXT_PUBLIC_SITE_LAUNCHED=false
```

Mantener `NEXT_PUBLIC_SITE_LAUNCHED=false` durante el pre-lanzamiento. Con ese valor, la home puede mostrarse como coming soon y el navbar publico no renderiza enlaces superiores. Cuando se apruebe el lanzamiento completo, cambiarlo a `true` y hacer redeploy del frontend.

### Preview branch en Vercel

Para probar una rama no productiva en Vercel, usar la URL real del deployment preview, por ejemplo:

```text
https://politeia-web-git-feature-mvp-fundacion-politeia-s-projects.vercel.app
```

No usar `admin.` delante de esa URL. Vercel no emite automaticamente certificado para `admin.<preview>.vercel.app`, por eso el navegador puede fallar con error TLS.

Variables recomendadas para el entorno `Preview` de Vercel:

```text
BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
NEXT_PUBLIC_BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
NEXT_PUBLIC_GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID_REAL
NEXT_PUBLIC_SITE_URL=https://politeia-web-git-feature-mvp-fundacion-politeia-s-projects.vercel.app
NEXT_PUBLIC_SITE_LAUNCHED=true
ENABLE_PREVIEW_ADMIN=true
```

Con `ENABLE_PREVIEW_ADMIN=true`, el panel interno se prueba en:

```text
https://politeia-web-git-feature-mvp-fundacion-politeia-s-projects.vercel.app/admin
```

Ese flag debe existir solo en `Preview`, no en `Production`.

Dominios del frontend:

```text
https://politeia.ar
https://www.politeia.ar
https://admin.politeia.ar
```

Luego desplegar frontend con el flujo del proveedor.

Validar:

```text
https://politeia.ar
https://www.politeia.ar
https://admin.politeia.ar/admin
```

## 9. Preparar cuentas de prueba en vivo

Usar cuentas reales pero de bajo riesgo:

```text
admin@politeia.ar       rol admin
reviewer@politeia.ar    rol reviewer
autor@politeia.ar       rol blog
autor.extern@gmail.com  rol blog asignado manualmente por admin
```

Si no se tienen esas cuentas exactas, usar equivalentes.

Desde el panel admin:

1. Entrar con un admin `@politeia.ar`.
2. Abrir gestion de usuarios.
3. Agregar la cuenta `@gmail.com`.
4. Asignarle rol `blog`.
5. Guardar.
6. Cerrar sesion.
7. Entrar con la cuenta `@gmail.com`.
8. Activar opt-in de emails y eventos deseados.

Recordatorio: los emails de comentarios/publicacion van al `authorEmail` del post. Si queres que lleguen a la cuenta Gmail, el post debe haber sido creado por esa cuenta o debe tener ese `authorEmail`.

## 10. Matriz de pruebas end-to-end

Crear posts de prueba con nombres unicos, por ejemplo:

```text
QA Produccion Email 2026-07-05 A
QA Produccion Comentarios 2026-07-05 B
```

### Publico

1. Abrir `https://politeia.ar`.
2. Confirmar que el navbar no muestra Login.
3. Abrir `https://politeia.ar/admin`.
4. Resultado esperado: no muestra login interno ni panel.
5. Abrir `https://politeia.ar/blog`.
6. Resultado esperado: lista de posts publicados.

### Subdominio admin

1. Abrir `https://admin.politeia.ar`.
2. Resultado esperado: redirige a `/admin`.
3. Login con Google.
4. Resultado esperado: panel interno sin navbar publico ni footer publico.

### Rol blog

1. Entrar como usuario `blog`.
2. Crear un post.
3. Guardar.
4. Confirmar que solo ve sus propios posts.
5. Enviar a revision.
6. Resultado esperado: admins/reviewers con opt-in reciben email `postSubmittedReview`.
7. Confirmar que el usuario blog no ve estados internos como archivado.

### Reviewer

1. Entrar como reviewer.
2. Ver posts en revision.
3. Abrir el post de prueba.
4. Agregar comentario en una seleccion de texto desde Tiptap.
5. Resultado esperado: el autor con opt-in recibe email `commentCreated`.
6. Resolver comentario.
7. Resultado esperado: el autor con opt-in recibe email `commentResolved`.
8. Reabrir comentario.
9. Resultado esperado: el autor con opt-in recibe email `commentReopened`.
10. Publicar post.
11. Resultado esperado: el autor con opt-in recibe email `postPublished`.
12. Archivar un post.
13. Resultado esperado: no se envia email.

### Admin

1. Entrar como admin.
2. Ver panel de gestion completo.
3. Cambiar roles de un usuario con opt-in.
4. Resultado esperado: el usuario recibe email `roleChanged`.
5. Probar acciones batch sobre posts de prueba.
6. Resultado esperado: permisos y estados correctos; archivar no envia email.

### Gmail asignado

1. Entrar con el `@gmail.com` asignado.
2. Confirmar que puede entrar solo si tiene roles.
3. Confirmar que al quitar roles ya no puede operar.
4. Confirmar que opt-in de email queda asociado a esa cuenta.

## 11. Verificacion de emails

En Resend:

- Revisar `Emails` o `Logs`.
- Confirmar destinatario, asunto, estado y timestamp.
- Confirmar que no hay rechazos por dominio no verificado.

En Cloud Run:

```bash
npm run blog-api:cloud:logs
```

Buscar:

```text
mail delivery
notification skipped
notification failed
```

Interpretacion:

- `mail delivery` con provider `resend`: intento real de envio.
- Delivery `sent`: Resend acepto el correo.
- Delivery `failed`: Resend o config fallo; revisar `lastError`.
- `notification skipped`: no habia destinatarios opt-in, el actor era el mismo destinatario, o el post no tenia el `authorEmail` esperado.
- Provider `console`: no era envio real.
- Provider `disabled`: envio salteado intencionalmente.

En Firestore revisar colecciones:

```text
notificationPreferences
notificationEvents
emailDeliveries
reviewComments
posts
userRoleAssignments
```

## 12. Smoke test tecnico

Backend:

```bash
curl -i https://URL_DE_CLOUD_RUN/healthz
curl -i "https://URL_DE_CLOUD_RUN/v1/posts?status=published&limit=3"
```

Frontend publico:

```text
https://politeia.ar
https://politeia.ar/blog
```

Panel:

```text
https://admin.politeia.ar/admin
```

OAuth:

- Si Google dice origin no autorizado, revisar Authorized JavaScript Origins.
- Si el backend rechaza CORS, revisar `ALLOWED_ORIGIN`.
- Si la cookie no persiste, revisar `SESSION_COOKIE_SAME_SITE=none` y `SESSION_COOKIE_SECURE=true`.

## 13. Limpieza despues de QA

Despues de validar:

1. Archivar o eliminar posts de prueba.
2. Quitar roles temporales de cuentas de prueba.
3. Desactivar opt-in de cuentas que no deban recibir emails.
4. Revisar que no queden secretos en archivos locales versionables.
5. Guardar evidencia minima: fecha, revision Cloud Run, URL frontend, resultado de pruebas.

## 14. Rollback

### Desactivar emails sin bajar el sistema

```bash
gcloud run services update politeia-blog-api --region us-central1 --set-env-vars MAIL_PROVIDER=disabled
```

Para volver a activar:

```bash
gcloud run services update politeia-blog-api --region us-central1 --set-env-vars MAIL_PROVIDER=resend
```

### Volver a revision anterior de Cloud Run

Listar revisiones:

```bash
npm run blog-api:cloud:revisions
```

Redirigir trafico a una revision anterior:

```bash
gcloud run services update-traffic politeia-blog-api --region us-central1 --to-revisions REVISION_NAME=100
```

### Rollback del frontend

Usar el panel del hosting para promover el deployment anterior. En Vercel, entrar al proyecto, buscar el deployment anterior y usar Promote/Redeploy segun corresponda.

## 15. Problemas frecuentes

### No llega email

Revisar en orden:

1. `MAIL_PROVIDER` debe ser `resend`.
2. `RESEND_API_KEY` debe estar cargada como secreto y accesible para Cloud Run.
3. `MAIL_FROM` debe pertenecer a un dominio verificado en Resend.
4. El destinatario debe tener opt-in activo.
5. El evento especifico debe estar activo en preferencias.
6. El actor no debe ser el mismo email que el destinatario.
7. El post debe tener `authorEmail` correcto.
8. Revisar `emailDeliveries.lastError`.
9. Revisar logs de Resend.

### El panel no permite login

1. Revisar `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
2. Revisar Authorized JavaScript Origins.
3. Revisar `ALLOWED_ORIGIN`.
4. Revisar cookies `SameSite=None` y `Secure=true`.
5. Revisar logs de `/v1/me` y `/v1/auth/google`.

### Un Gmail no puede entrar

1. Debe ser `@gmail.com`.
2. Debe tener roles asignados por admin `@politeia.ar`.
3. Debe cerrar y abrir sesion despues de cambios de rol.
4. Si persiste, revisar `userRoleAssignments` y logs de auth.

### Comentarios no disparan emails

1. Solo reviewer/admin disparan email de comentario.
2. El autor del post debe tener opt-in.
3. El comentario debe haberse guardado en backend.
4. Revisar `reviewComments`, `notificationEvents` y `emailDeliveries`.

### Publicacion no dispara email

1. Solo reviewer/admin disparan email de publicacion.
2. Archivar no dispara email.
3. El post debe tener `authorEmail`.
4. El autor debe tener opt-in de `postPublished`.

## 16. Logs administrativos y prueba de Resend

El panel interno registra metadatos sanitizados de cada request en `apiRequestLogs`. No guarda bodies, cookies, headers de autorizacion ni valores de query. Los tokens de confirmacion de newsletter no se persisten.

### Activar el registro en Cloud Run

En produccion queda activo por defecto. Se recomienda dejarlo explicito:

```bash
gcloud.cmd run services update politeia-blog-api --region us-central1 --update-env-vars API_REQUEST_LOGS_ENABLED=true,API_REQUEST_LOGS_RETENTION_DAYS=14
```

Despues de desplegar el backend, configurar Firestore TTL para eliminar registros vencidos:

```bash
gcloud.cmd firestore fields ttls update expiresAt --collection-group=apiRequestLogs --enable-ttl --project=quick-function-500420-v6
gcloud.cmd firestore fields ttls update expiresAt --collection-group=notificationEvents --enable-ttl --project=quick-function-500420-v6
gcloud.cmd firestore fields ttls update expiresAt --collection-group=notificationReads --enable-ttl --project=quick-function-500420-v6
```

La habilitacion del TTL puede demorar. Firestore elimina los documentos vencidos de manera asincronica, normalmente dentro de las 24 horas posteriores al vencimiento. El backend tambien limpia notificaciones con mas de 7 dias al consultar o crear actividad, por lo que el TTL funciona como una segunda garantia.

### Configurar el webhook de Resend

En Resend > Webhooks, registrar:

```text
https://CLOUD_RUN_URL/v1/mail/webhooks/resend
```

Seleccionar como minimo:

- `email.sent`
- `email.delivered`
- `email.failed`
- `email.bounced`
- `email.complained`
- `email.suppressed`
- `contact.updated`

`contact.updated` mantiene sincronizada la baja realizada desde el enlace de Resend con `newsletterSubscriptions` en Firestore. Todos los broadcasts incluyen un enlace visible de baja; las pruebas individuales usan el endpoint firmado `/v1/newsletter/unsubscribe`.

Guardar el signing secret del webhook en Secret Manager y montarlo como `RESEND_WEBHOOK_SECRET`. No usar la API key como signing secret.

### Probar desde produccion

1. Desplegar primero el backend y luego el frontend.
2. Entrar en `https://admin.politeia.ar/admin` con una cuenta `admin`.
3. Abrir `Mi perfil` y bajar hasta `Logs y diagnostico`.
4. Pulsar `Probar Resend` y confirmar. El destinatario siempre es el email del administrador autenticado.
5. En `Solicitudes API`, verificar `POST /v1/admin/logs/resend-test` con estado `200`.
6. En `Correos`, buscar el asunto `Prueba operativa de Resend - Politeia`.
7. `sent` confirma que Resend acepto el request. `delivered` y `email.delivered` confirman que el servidor del destinatario recibio el correo mediante el webhook.
8. Ante un error, filtrar por estado `5xx`, copiar el `requestId` y revisar `lastError` en la vista Correos.

El panel muestra hasta 500 requests y 500 entregas recientes. Solo `admin` puede acceder tanto a la UI como a los endpoints `/v1/admin/logs/*`.
