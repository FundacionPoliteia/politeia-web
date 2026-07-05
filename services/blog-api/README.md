# Politeia Blog API

Backend API first para publicar blogs desde Google Cloud Run.

## Desarrollo local

```bash
npm install
npm run dev
```

Variables principales:

```text
GCP_PROJECT_ID=quick-function-500420-v6
MEDIA_BUCKET=politeia-blog-media-quick-function-500420-v6
ALLOWED_ORIGIN=http://localhost:3000,http://admin.localhost:3000
GOOGLE_CLIENT_ID=google-oauth-client-id
ALLOWED_EMAIL_DOMAIN=politeia.ar
SESSION_SECRET=change-me-in-production
SESSION_COOKIE_SAME_SITE=lax
SESSION_COOKIE_SECURE=false
BLOG_GROUP_EMAIL=politeia-blog@dominio
ADMIN_GROUP_EMAIL=politeia-admin@dominio
REVIEWER_GROUP_EMAIL=politeia-reviewer@dominio
DEV_AUTH=true
DEV_AUTH_EMAIL=dev@politeia.ar
DEV_AUTH_ROLES=admin
```

`DEV_AUTH=true` solo debe usarse en local. En produccion los roles se resuelven con Google Identity + Google Groups. Para probar ownership de autores, cambia `DEV_AUTH_EMAIL` y reinicia el backend: el rol `blog` solo ve y opera posts propios.

## Endpoints

- `GET /healthz`
- `GET /docs`
- `GET /v1/posts`
- `GET /v1/posts/:slug`
- `POST /v1/posts`
- `PATCH /v1/posts/:id`
- `DELETE /v1/posts/:id`
- `POST /v1/posts/:id/submit-review`
- `POST /v1/posts/:id/publish`
- `POST /v1/posts/:id/archive`
- `POST /v1/media`
- `POST /v1/import/docx`

## Roles

- `blog`: crea, edita, sube/importa contenido y envia posts a revision.
- `reviewer`: incluye permisos de `blog` y suma revision, preparacion editorial, administracion de categorias, eleccion de slug, publicacion y archivo.
- `admin`: incluye permisos de `reviewer` y suma eliminacion y responsabilidades administrativas.
