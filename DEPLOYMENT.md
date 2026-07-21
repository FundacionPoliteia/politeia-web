# Deployment a GitHub

Este documento describe como publicar el proyecto en GitHub y dejarlo listo para conectarlo a un servicio de hosting para Next.js.

Para un pase completo a produccion, incluyendo DNS, subdominio admin, Resend, secretos, pruebas en vivo, notificaciones opt-in y rollback, seguir primero `PRODUCTION-RUNBOOK.md`.

## Comandos rapidos de backend

Desde la raiz del proyecto:

```bash
npm run blog-api:test
npm run blog-api:check
npm run blog-api:cloud:build
npm run blog-api:cloud:deploy
npm run blog-api:cloud:logs
npm run blog-api:cloud:url
npm run blog-api:cloud:env
npm run blog-api:cloud:revisions
npm run blog-api:cloud:auth
npm run blog-api:cloud:project
npm run blog-api:cloud:quota-project
```

- `npm run blog-api:cloud:build`: construye y sube la imagen Docker del backend a Artifact Registry.
- `npm run blog-api:cloud:deploy`: despliega la imagen `latest` en Cloud Run.
- `npm run blog-api:cloud:redeploy`: alias de deploy, util para volver a desplegar la imagen actual.
- `npm run blog-api:cloud:restart`: alias de deploy; en Cloud Run el "reinicio" practico es desplegar una nueva revision con la misma imagen.
- `npm run blog-api:cloud:logs`: lee los ultimos logs del servicio.
- `npm run blog-api:cloud:url`: imprime la URL actual del servicio.
- `npm run blog-api:cloud:describe`: muestra la descripcion completa del servicio.
- `npm run blog-api:cloud:env`: muestra las variables/secrets configuradas en la revision actual de Cloud Run.
- `npm run blog-api:cloud:revisions`: lista revisiones de Cloud Run para auditoria o rollback.
- `npm run blog-api:cloud:auth`: autentica Application Default Credentials para pruebas locales contra Firestore/Cloud Storage reales.
- `npm run blog-api:cloud:project`: configura el proyecto `quick-function-500420-v6` en gcloud.
- `npm run blog-api:cloud:quota-project`: asocia ADC al proyecto para evitar errores de cuota/facturacion en APIs locales.

Flujo habitual para subir cambios del backend:

```bash
npm run blog-api:test
npm run blog-api:check
npm run blog-api:cloud:build
npm run blog-api:cloud:deploy
```

## Publicar el repositorio en GitHub

1. Crear un repositorio nuevo en GitHub.

2. Desde la raiz del proyecto, inicializar Git si todavia no existe:

   ```bash
   git init
   ```

3. Revisar el estado de los archivos:

   ```bash
   git status
   ```

4. Crear el primer commit:

   ```bash
   git add .
   git commit -m "Initial commit"
   ```

5. Asociar el repositorio remoto de GitHub:

   ```bash
   git remote add origin https://github.com/USUARIO/NOMBRE_DEL_REPO.git
   ```

6. Subir la rama principal:

   ```bash
   git branch -M main
   git push -u origin main
   ```

Reemplazar `USUARIO` y `NOMBRE_DEL_REPO` por los datos reales del repositorio.

## Deploy de la aplicacion

GitHub guarda el codigo fuente, pero esta app Next.js necesita un runtime Node.js para funcionar correctamente. La opcion recomendada es conectar el repositorio de GitHub a un hosting compatible con Next.js, por ejemplo Vercel, Netlify o un servidor propio.

### Opcion recomendada: Vercel

1. Entrar a Vercel e iniciar sesion con GitHub.
2. Seleccionar **Add New Project**.
3. Importar el repositorio de GitHub.
4. Mantener la configuracion por defecto:
   - Framework: `Next.js`
   - Install command: `npm install` o `npm ci`
   - Build command: `npm run build`
   - Output directory: la predeterminada de Next.js
5. Ejecutar el deploy.

Cada push a `main` puede disparar un nuevo deploy automatico, segun la configuracion del proveedor.

Configurar en el proveedor:

```text
BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
```

## Deploy del backend en Cloud Run

El backend vive en `services/blog-api`.

1. Habilitar servicios de Google Cloud:

   ```bash
   gcloud services enable run.googleapis.com firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com cloudidentity.googleapis.com
   ```

2. Crear Firestore y el bucket de media:

   ```bash
   gcloud firestore databases create --location=us-central1
   gsutil mb -l us-central1 gs://politeia-blog-media
   ```

3. Crear el repositorio Docker si todavia no existe:

   ```bash
   gcloud artifacts repositories create politeia --repository-format=docker --location=us-central1
   ```

4. Build y push con Cloud Build:

   ```bash
   gcloud builds submit services/blog-api --tag us-central1-docker.pkg.dev/quick-function-500420-v6/politeia/blog-api:latest
   ```

5. Deploy:

   ```bash
   gcloud run deploy politeia-blog-api \
     --image us-central1-docker.pkg.dev/quick-function-500420-v6/politeia/blog-api:latest \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars GCP_PROJECT_ID=quick-function-500420-v6,MEDIA_BUCKET=politeia-blog-media-quick-function-500420-v6,ALLOWED_ORIGIN=https://politeia.ar,https://www.politeia.ar,https://admin.politeia.ar,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID,ALLOWED_EMAIL_DOMAIN=politeia.ar,SESSION_SECRET=CAMBIAR_POR_SECRETO_LARGO,SESSION_COOKIE_SAME_SITE=none,SESSION_COOKIE_SECURE=true,BLOG_GROUP_EMAIL=politeia-blog@politeia.ar,ADMIN_GROUP_EMAIL=politeia-admin@politeia.ar,REVIEWER_GROUP_EMAIL=politeia-reviewer@politeia.ar,MAIL_PROVIDER=resend,MAIL_FROM=no-reply@politeia.ar,APP_BASE_URL=https://admin.politeia.ar
   ```

6. Dar permisos a la service account de Cloud Run:

   ```bash
   gcloud projects add-iam-policy-binding quick-function-500420-v6 --member=serviceAccount:SERVICE_ACCOUNT --role=roles/datastore.user
   gcloud storage buckets add-iam-policy-binding gs://politeia-blog-media-quick-function-500420-v6 --member=serviceAccount:SERVICE_ACCOUNT --role=roles/storage.objectAdmin
   ```

## Rebuild y redeploy del backend

Usar este flujo cuando ya existe el servicio de Cloud Run y solo queres subir cambios nuevos del backend, por ejemplo un fix en `services/blog-api/src/auth.js` o un endpoint nuevo.

> En Windows CMD o PowerShell, copiar los comandos en una sola linea. No usar `\` como continuacion de linea.

### 1. Confirmar el proyecto activo

```bash
gcloud config get-value project
```

Si no devuelve `quick-function-500420-v6`, configurarlo:

```bash
gcloud config set project quick-function-500420-v6
```

### 2. Probar el backend antes de subirlo

Desde la raiz del proyecto:

```bash
npm run blog-api:test
```

Opcionalmente validar sintaxis:

```bash
npm run blog-api:check
```

### 3. Rebuild de la imagen y push a Artifact Registry

```bash
npm run blog-api:cloud:build
```

Este comando toma el `Dockerfile` de `services/blog-api`, construye una imagen nueva y la sube al repositorio `politeia` de Artifact Registry.

### 4. Redeploy en Cloud Run

```bash
npm run blog-api:cloud:deploy
```

Si Cloud Run pregunta si permite llamadas no autenticadas, responder `y`. La API valida usuarios con Google ID Token en las rutas protegidas, pero las rutas publicas necesitan poder responder sin IAM de Cloud Run.

Si el deploy pide variables y no las conserva, usar el comando completo:

```bash
gcloud run deploy politeia-blog-api --image us-central1-docker.pkg.dev/quick-function-500420-v6/politeia/blog-api:latest --region us-central1 --set-env-vars GCP_PROJECT_ID=quick-function-500420-v6,MEDIA_BUCKET=politeia-blog-media-quick-function-500420-v6,ALLOWED_ORIGIN=http://localhost:3000,GOOGLE_CLIENT_ID=692286616272-6rkulju18me0hj747vu80muqffiu59g5.apps.googleusercontent.com,ALLOWED_EMAIL_DOMAIN=politeia.ar,SESSION_SECRET=CAMBIAR_POR_SECRETO_LARGO,SESSION_COOKIE_SAME_SITE=none,SESSION_COOKIE_SECURE=true,BLOG_GROUP_EMAIL=politeia-blog@politeia.ar,ADMIN_GROUP_EMAIL=politeia-admin@politeia.ar,REVIEWER_GROUP_EMAIL=politeia-reviewer@politeia.ar
```

Para produccion, cambiar `ALLOWED_ORIGIN=http://localhost:3000` por `https://politeia.ar,https://www.politeia.ar,https://admin.politeia.ar`. Si se necesitan varios origenes, separarlos por coma sin espacios.
`SESSION_SECRET` debe ser una cadena larga y privada. Idealmente guardarla en Secret Manager y pasarla a Cloud Run como secret; si se usa el comando completo directo, reemplazar `CAMBIAR_POR_SECRETO_LARGO` antes de desplegar.
Si no se usa un grupo separado de revisores, se puede omitir `REVIEWER_GROUP_EMAIL`; los admins ya tienen permiso para elegir slug.

### Correo: Resend, newsletter y avisos internos

El backend soporta estos modos:

```text
MAIL_PROVIDER=console   # no envia emails reales, solo logs/deliveries con estado logged
MAIL_PROVIDER=resend    # envia emails reales por Resend
MAIL_PROVIDER=disabled  # saltea envios
```

Antes de activar envios, verificar `politeia.ar` en Resend y crear:

- un Segment para el newsletter; copiar su ID a `RESEND_SEGMENT_ID`;
- un Topic para novedades/editoriales; copiar su ID a `RESEND_TOPIC_NEWSLETTER_ID`;
- un Topic para avisos de nuevos blogs; copiar su ID a `RESEND_TOPIC_NEW_POSTS_ID`;
- configurar ambos Topics para que los contactos existentes comiencen suscriptos y puedan salir de cada tema por separado;
- un webhook HTTPS apuntando a `https://URL_DE_CLOUD_RUN/v1/mail/webhooks/resend` para `email.delivered`, `email.failed`, `email.bounced`, `email.complained` y `email.suppressed`;
- copiar el Signing Secret del webhook a Secret Manager como `resend-webhook-secret`.

Crear los secretos sin pegarlos en comandos ni commits:

```bash
gcloud secrets create resend-api-key --replication-policy=automatic
gcloud secrets versions add resend-api-key --data-file=-
gcloud secrets create resend-webhook-secret --replication-policy=automatic
gcloud secrets versions add resend-webhook-secret --data-file=-
gcloud secrets create newsletter-token-secret --replication-policy=automatic
gcloud secrets versions add newsletter-token-secret --data-file=-
```

Copiar `services/blog-api/cloudrun.mail.env.yaml.example` como `services/blog-api/cloudrun.mail.env.yaml`, reemplazar los IDs y la URL real del servicio, y mantener ese archivo fuera del commit si se agregara informacion sensible. Usar un archivo evita los problemas de escape de comas y espacios de `gcloud.cmd` en Windows.

```bash
gcloud.cmd run services update politeia-blog-api --region us-central1 --env-vars-file services/blog-api/cloudrun.mail.env.yaml --set-secrets "RESEND_API_KEY=resend-api-key:latest,RESEND_WEBHOOK_SECRET=resend-webhook-secret:latest,NEWSLETTER_TOKEN_SECRET=newsletter-token-secret:latest"
```

La cuenta de servicio de Cloud Run necesita `roles/secretmanager.secretAccessor` sobre esos tres secretos. En Vercel configurar `NEXT_PUBLIC_EMAIL_SETTINGS_ENABLED=true` cuando el backend ya tenga Resend listo.

Para reutilizar el modulo en otro proyecto o branch, cambiar `MAIL_PROJECT_KEY`, `MAIL_BRAND_NAME`, los tres `MAIL_FROM_*`, `NEWSLETTER_AUDIENCE_KEY`, `RESEND_SEGMENT_ID`, los dos `RESEND_TOPIC_*`, `PUBLIC_SITE_URL` y `APP_BASE_URL`. Las colecciones de Firestore quedan particionadas por `projectKey` y `audienceKey`.

### Dispatcher de nuevos blogs

El envio automatico usa un heartbeat de Cloud Scheduler y un gate persistido en Firestore. Scheduler puede consultar cada hora, pero el backend no crea un broadcast hasta que transcurre la frecuencia elegida en `Mailing > Configuracion automatica`; el valor inicial es 12 horas. Esto permite cambiar la frecuencia sin recrear el job y evita el comportamiento anterior de cinco minutos.

Agregar a Cloud Run una cadena privada larga en `MAILING_DISPATCH_TOKEN`. No debe reutilizar `SESSION_SECRET` ni quedar en Git. Luego crear el job:

```bash
gcloud.cmd scheduler jobs create http politeia-blog-mailing-dispatch --location us-central1 --schedule="0 * * * *" --uri="https://URL_DE_CLOUD_RUN/v1/mailing/dispatch" --http-method=POST --headers="Authorization=Bearer TOKEN_PRIVADO" --time-zone="America/Argentina/Buenos_Aires"
```

El cron horario solo despierta el dispatcher. Con la configuracion inicial, los broadcasts reales se procesan como maximo una vez cada 12 horas. Desde la tab `Mailing`, un administrador puede cambiar el intervalo, desactivar la automatizacion, ajustar el limite semanal y forzar una seleccion de notas.

Despues de actualizar variables o secretos, revisar:

```bash
npm run blog-api:cloud:logs
```

Las cuentas destinatarias tambien deben haber activado el opt-in de emails desde el panel interno.

### 5. Verificar que Cloud Run quedo actualizado

Obtener la URL real del servicio:

```bash
npm run blog-api:cloud:url
```

Probar una ruta publica:

```bash
curl -i "https://URL_DE_CLOUD_RUN/v1/posts?status=published&limit=10"
```

Probar el healthcheck:

```bash
curl -i https://URL_DE_CLOUD_RUN/healthz
```

Si `/healthz` devolviera el 404 HTML de Google, revisar que se este usando exactamente la URL devuelta por `gcloud run services describe`.

### 6. Leer logs si algo falla

```bash
npm run blog-api:cloud:logs
```

Para el error de Google Groups que dice `Unknown name "groupKey_id"`, el fix esta en el codigo local. Despues de ejecutar rebuild + redeploy, volver a iniciar sesion en `/admin` para forzar una nueva validacion contra el backend actualizado.

## Validacion antes de subir

Antes de hacer push a GitHub, ejecutar:

```bash
npm install
npm run build
```

Si la build termina correctamente, el proyecto esta listo para publicarse.

## GitHub Pages

GitHub Pages sirve archivos estaticos. Este proyecto no esta configurado como export estatico de Next.js, y ademas consume contenido desde una API externa usando funciones de servidor de Next.js con revalidacion.

Por eso, para este estado del proyecto, GitHub Pages no es la opcion recomendada. Si se quisiera publicar ahi, habria que convertir la app a export estatico y ajustar la configuracion de Next.js.

## Variables y servicios externos

El frontend necesita:

```text
BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
NEXT_PUBLIC_BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
NEXT_PUBLIC_GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID
```

El backend necesita las variables documentadas en `services/blog-api/.env.example`.

Para que las imagenes subidas al bucket puedan renderizarse publicamente en la web, el bucket debe exponer lectura publica o se deben usar URLs externas ya publicas. La opcion simple para esta v1 es:

```bash
gcloud storage buckets add-iam-policy-binding gs://MEDIA_BUCKET --member=allUsers --role=roles/storage.objectViewer
```

## Flujo habitual de deploy

```bash
git status
npm run build
git add .
git commit -m "Descripcion del cambio"
git push origin main
```

Despues del push, revisar el deploy en el proveedor conectado al repositorio.
