# Desarrollo local

Esta aplicacion esta hecha con Next.js 15, React 19 y npm.

## Comandos rapidos

Desde la raiz del proyecto:

```bash
npm run dev
npm run blog-api:dev
npm run blog-api:test
npm run blog-api:check
npm run blog-api:cloud:auth
npm run blog-api:cloud:project
npm run blog-api:cloud:quota-project
```

- `npm run dev`: levanta el frontend Next en `http://localhost:3000`.
- `npm run blog-api:dev`: levanta el backend local en modo watch, usando `services/blog-api/.env`.
- `npm run blog-api:test`: corre los tests del backend.
- `npm run blog-api:check`: valida sintaxis del entrypoint del backend.
- `npm run blog-api:cloud:auth`: abre el login de Application Default Credentials para usar Firestore/Cloud Storage reales desde local.
- `npm run blog-api:cloud:project`: configura `quick-function-500420-v6` como proyecto activo de gcloud.
- `npm run blog-api:cloud:quota-project`: asocia tus credenciales ADC al proyecto de facturacion/cuotas usado por las APIs de Google.

Para reiniciar el backend local despues de cambiar `.env`, cortar el proceso con `Ctrl+C` y volver a correr:

```bash
npm run blog-api:dev
```

Para probar el panel interno local:

```text
http://admin.localhost:3000/admin
```

## Requisitos

- Node.js 20 o superior.
- npm, incluido con Node.js.
- Acceso a internet para instalar dependencias y, si corresponde, acceder a Google Cloud.

## Instalacion

Desde la raiz del proyecto:

```bash
npm install
```

Si queres una instalacion mas estricta y reproducible usando `package-lock.json`:

```bash
npm ci
```

## Levantar el servidor de desarrollo

```bash
npm run dev
```

Por defecto Next.js levanta la app en:

```text
http://localhost:3000
```

Si el puerto `3000` esta ocupado, podes usar otro puerto:

```bash
npm run dev -- -p 3001
```

## Scripts disponibles

- `npm run dev`: inicia Next.js en modo desarrollo.
- `npm run build`: genera la build de produccion.
- `npm run start`: ejecuta la build de produccion generada previamente.
- `npm run lint`: ejecuta el linter de Next.js, si la configuracion del proyecto lo permite.
- `npm run blog-api:dev`: inicia el backend Express de blogs.
- `npm run blog-api:start`: inicia el backend Express sin watch.
- `npm run blog-api:test`: ejecuta los tests del backend de blogs.
- `npm run blog-api:check`: valida sintaxis del entrypoint del backend.

## Variables de entorno

Copiar `.env.example` a `.env.local` y configurar:

```text
BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
NEXT_PUBLIC_BLOG_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_GOOGLE_CLIENT_ID=tu-google-client-id
```

En desarrollo local conviene separar estos dos valores:

- `BLOG_API_BASE_URL`: lo usa Next del lado servidor para el blog publico. Puede apuntar a Cloud Run para ver las notas reales.
- `NEXT_PUBLIC_BLOG_API_BASE_URL`: lo usa el panel en el navegador. Para probar roles con `DEV_AUTH=true`, debe apuntar al backend local `http://localhost:8080`.

El backend tiene su propio ejemplo en `services/blog-api/.env.example`.

## Levantar el backend de blogs

```bash
cd services/blog-api
npm install
npm run dev
```

En desarrollo local se puede usar:

```text
DEV_AUTH=true
DEV_AUTH_EMAIL=dev@politeia.ar
DEV_AUTH_ROLES=admin
ALLOWED_ORIGIN=http://localhost:3000,http://admin.localhost:3000
ALLOWED_EMAIL_DOMAIN=politeia.ar
SESSION_SECRET=dev-session-secret
SESSION_COOKIE_SAME_SITE=lax
SESSION_COOKIE_SECURE=false
```

Esto evita depender de Google Groups mientras se prueba localmente. No usar `DEV_AUTH=true` en produccion.

El backend local usa el mismo codigo y los mismos endpoints que produccion. Si queres probar listados, importacion `.docx` o subida de imagenes contra Firestore/Cloud Storage reales, tambien necesitas tener credenciales locales de Google Cloud disponibles para las librerias de Google:

```bash
npm run blog-api:cloud:auth
npm run blog-api:cloud:project
npm run blog-api:cloud:quota-project
```

Sin esas credenciales, el panel puede iniciar sesion local, pero las rutas que leen/escriben Firestore o Cloud Storage van a fallar.

Si `npm run blog-api:cloud:quota-project` falla con:

```text
Cannot add the project "quick-function-500420-v6" to application default credentials (ADC)
because the account in ADC does not have the "serviceusage.services.use" permission
```

el problema no es Next ni el backend: la cuenta usada en Application Default Credentials no tiene permiso para consumir cuota del proyecto. Un owner/admin del proyecto debe otorgarle:

```bash
gcloud projects add-iam-policy-binding quick-function-500420-v6 --member=user:TU_EMAIL_DE_GOOGLE --role=roles/serviceusage.serviceUsageConsumer
```

Despues volver a correr:

```bash
npm run blog-api:cloud:auth
npm run blog-api:cloud:project
npm run blog-api:cloud:quota-project
```

Si estabas autenticado con una cuenta incorrecta, revocar ADC y loguearte de nuevo:

```bash
gcloud auth application-default revoke
npm run blog-api:cloud:auth
```

Si despues aparece:

```text
7 PERMISSION_DENIED: Missing or insufficient permissions.
```

ADC ya esta autenticado, pero esa cuenta no puede leer/escribir el recurso real. Para probar Firestore desde el backend local, un owner/admin del proyecto debe otorgar:

```bash
gcloud projects add-iam-policy-binding quick-function-500420-v6 --member=user:TU_EMAIL_DE_GOOGLE --role=roles/datastore.user
```

Para subir imagenes al bucket real, tambien:

```bash
gcloud storage buckets add-iam-policy-binding gs://politeia-blog-media-quick-function-500420-v6 --member=user:TU_EMAIL_DE_GOOGLE --role=roles/storage.objectAdmin
```

Resumen de permisos minimos para desarrollo local contra recursos reales:

```text
roles/serviceusage.serviceUsageConsumer  # permite usar el proyecto como quota project de ADC
roles/datastore.user                     # permite leer/escribir Firestore
roles/storage.objectAdmin                # permite subir/gestionar imagenes en Cloud Storage
```

### Alternativa recomendada: service account local

Para evitar depender de permisos IAM de tu usuario personal, se puede usar una service account local. Es mas parecido a Cloud Run y separa permisos de infraestructura de los roles del panel.

Crear una service account dedicada, por ejemplo:

```bash
gcloud iam service-accounts create politeia-blog-api-local --display-name="Politeia blog API local"
```

Darle permisos minimos:

```bash
gcloud projects add-iam-policy-binding quick-function-500420-v6 --member=serviceAccount:politeia-blog-api-local@quick-function-500420-v6.iam.gserviceaccount.com --role=roles/datastore.user
gcloud storage buckets add-iam-policy-binding gs://politeia-blog-media-quick-function-500420-v6 --member=serviceAccount:politeia-blog-api-local@quick-function-500420-v6.iam.gserviceaccount.com --role=roles/storage.objectAdmin
```

Crear una key JSON y guardarla fuera de git. Por ejemplo:

```bash
gcloud iam service-accounts keys create D:\Juan\secrets\politeia-blog-api-local.service-account.json --iam-account=politeia-blog-api-local@quick-function-500420-v6.iam.gserviceaccount.com
```

Luego configurar `services/blog-api/.env`:

```text
GOOGLE_APPLICATION_CREDENTIALS=D:\Juan\secrets\politeia-blog-api-local.service-account.json
GCP_PROJECT_ID=quick-function-500420-v6
MEDIA_BUCKET=politeia-blog-media-quick-function-500420-v6
```

Reiniciar el backend:

```bash
npm run blog-api:dev
```

No pegar el JSON ni sus valores en chats, tickets o commits. Si una key se expone, eliminarla desde IAM y crear una nueva.

## Probar emails en desarrollo

El correo esta dividido en tres canales configurables:

```text
internal    avisos del flujo editorial, siempre sujetos al opt-in del usuario
updates     mensajes puntuales y pruebas operativas
newsletter newsletter publico, con confirmacion doble antes del alta
```

Copiar `services/blog-api/.env.example` a `services/blog-api/.env` y empezar con `MAIL_PROVIDER=console`. Ese modo ejecuta el ciclo completo, guarda entregas en Firestore y escribe `mail delivery` en la terminal, pero no contacta a ningun destinatario.

Configuracion local recomendada:

```text
MAIL_PROVIDER=console
MAIL_PROJECT_KEY=politeia
MAIL_BRAND_NAME=Politeia
MAIL_FROM_INTERNAL=Politeia Interno <notificaciones@politeia.ar>
MAIL_FROM_UPDATES=Politeia Updates <updates@politeia.ar>
MAIL_FROM_NEWSLETTER=Politeia Newsletter <newsletter@politeia.ar>
MAIL_REPLY_TO=info@politeia.ar
NEWSLETTER_AUDIENCE_KEY=politeia-newsletter
NEWSLETTER_TOKEN_SECRET=una-cadena-larga-distinta-de-session-secret
RESEND_TOPIC_NEWSLETTER_ID=
RESEND_TOPIC_NEW_POSTS_ID=
MAILING_DISPATCH_TOKEN=una-cadena-larga-distinta-de-los-otros-secretos
APP_BASE_URL=http://admin.localhost:3000
PUBLIC_SITE_URL=http://localhost:3000
API_PUBLIC_URL=http://localhost:8080
```

Validar la configuracion sin mostrar secretos:

```bash
npm run blog-api:mail:check
```

Para una prueba manual, definir `MAIL_TEST_TO` en `services/blog-api/.env` y ejecutar:

```bash
npm run blog-api:mail:test
```

Con `MAIL_PROVIDER=console` solo se imprime el correo. Para una prueba real, cambiar a `MAIL_PROVIDER=resend`, cargar `RESEND_API_KEY`, `RESEND_SEGMENT_ID`, `RESEND_TOPIC_NEWSLETTER_ID` y `RESEND_TOPIC_NEW_POSTS_ID`, reiniciar el backend y repetir el comando.

El formulario de `/blog` crea una suscripcion pendiente con Newsletter y Nuevos blogs activos por defecto. El usuario debe abrir el link de confirmacion antes de quedar activo y luego puede administrar ambos temas desde el enlace de preferencias. En el panel, cada cuenta configura sus avisos internos desde `Mi perfil`; el administrador crea newsletters desde `Newsletter` y controla los avisos de publicaciones desde `Mailing`.

Para probar el ciclo automatico local sin esperar 12 horas, usar el boton de despacho manual de la tab `Mailing` o llamar el endpoint administrativo. El intervalo de produccion se mantiene en 12 horas por defecto y puede cambiarse desde la misma configuracion.

No pegues keys reales en tickets, chats o capturas. Si una `RESEND_API_KEY` queda expuesta, revocarla en Resend y crear una nueva antes de seguir probando.

## Probar una build de produccion localmente

Antes de publicar cambios conviene validar que la app compile:

```bash
npm run build
npm run start
```

Luego abrir:

```text
http://localhost:3000
```

## Datos externos

El blog consume datos desde la API configurada por:

```text
BLOG_API_BASE_URL
```

El cliente publico vive en `lib/blogApi.js`. `lib/wordpress.js` queda como referencia legada y no es usado por las rutas actuales.

La UI interna de carga vive en el subdominio admin. En local, usar:

```text
http://admin.localhost:3000/admin
```

Si el boton de Google no aparece en `admin.localhost`, hay dos caminos:

- Para probar roles localmente, levantar el backend con `DEV_AUTH=true`, cambiar `DEV_AUTH_ROLES` a `blog`, `reviewer` o `admin`, cambiar `DEV_AUTH_EMAIL` para simular otro autor, reiniciar el backend y usar el boton "Usar sesion local" del panel. `blog` solo ve y opera posts cuyo `authorEmail` coincide con `DEV_AUTH_EMAIL`; `reviewer` incluye permisos de `blog`; `admin` incluye todo.
- Para probar Google real desde local, agregar `http://admin.localhost:3000` como Authorized JavaScript Origin en Google OAuth y sumar `http://admin.localhost:3000` a `ALLOWED_ORIGIN` del backend que estes usando.

Necesita estas variables en `.env.local`:

```text
NEXT_PUBLIC_BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
NEXT_PUBLIC_GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID
```

## Flujo recomendado de trabajo

1. Crear una rama para el cambio:

   ```bash
   git checkout -b nombre-del-cambio
   ```

2. Instalar dependencias si es necesario:

   ```bash
   npm install
   ```

3. Levantar el entorno local:

   ```bash
   npm run dev
   ```

4. Validar antes de subir:

   ```bash
   npm run build
   ```

5. Commit y push:

   ```bash
   git add .
   git commit -m "Descripcion del cambio"
   git push origin nombre-del-cambio
   ```
