# Despliegue privado para el batch de Quórum

Esta guía deja la experiencia pública, el gestor y la API detrás de una identidad de Google durante la prueba cerrada. El acceso al batch y los permisos editoriales son independientes:

- `dev@politeia.ar` e `info@politeia.ar` son siempre administradores y editores.
- Ninguna otra cuenta `@politeia.ar` recibe permisos editoriales automáticamente.
- Los administradores pueden asignar `quorum_editor` o `quorum_admin` desde Gestión → Usuarios.
- Un tester autorizado puede recorrer el sitio público, pero no entrar al gestor si no tiene además un rol editorial.
- Al abrir Quórum, se desactiva la barrera pública; Google y los roles siguen protegiendo Gestión.

## 1. Datos y accesos que debe aportar Politeia

Antes de desplegar, reunir:

1. Acceso con escritura al repositorio `FundacionPoliteia/politeia-web`.
2. Acceso al proyecto Google Cloud `politeia-quorum`, con facturación activa.
3. Permisos para Cloud Run, Cloud Build, Artifact Registry, Firestore, Storage, Secret Manager, IAM y Cloud Scheduler.
4. Acceso al equipo de Vercel que administrará Quórum.
5. Acceso al proveedor DNS de `politeia.ar`.
6. Una dirección institucional de soporte para la pantalla de consentimiento de Google.
7. La lista exacta y en minúsculas de correos Google de los testers externos, separada por comas.
8. Confirmación de los dominios de staging:
   - `staging.quorum.politeia.ar`
   - `gestion.staging.quorum.politeia.ar`
   - `api.staging.quorum.politeia.ar` queda reservado; el primer batch usa un proxy seguro de Vercel y no necesita publicarlo.

No enviar contraseñas, claves JSON, tokens ni secretos por GitHub, correo o chat. Los valores secretos se cargan directamente en Secret Manager y Vercel.

## 2. Subir el código mediante una rama y un pull request

Desde PowerShell, en la raíz del repositorio:

```powershell
cd D:\Juan\PROG\politeia-web
git remote -v
git status --short
npm.cmd run quorum:check
npm.cmd run quorum:test
npm.cmd run quorum:build
git diff --check
```

Confirmar que los archivos locales de configuración permanecen ignorados:

```powershell
git check-ignore -v apps/quorum/.env.local
git check-ignore -v services/quorum-api/.env
git check-ignore -v infra/quorum/terraform/terraform.tfvars
```

Crear la rama, revisar y subir:

```powershell
git switch -c feat/quorum-private-batch
git add -A
git status --short
git diff --cached --stat
git diff --cached --check
git commit -m "feat: prepare Quorum private batch"
git push -u origin feat/quorum-private-batch
```

En GitHub, abrir el pull request hacia `main` y esperar los dos jobs de `Quórum CI`: `verify` y `terraform`. No fusionar si falla alguno.

Después del primer merge, configurar un ruleset para `main` en GitHub → Settings → Rules → Rulesets:

- exigir pull request;
- exigir los checks `verify` y `terraform`;
- bloquear force-push;
- exigir una aprobación si siempre habrá una segunda persona disponible para revisar.

## 3. Preparar Google Cloud

### 3.1 Seleccionar proyecto y autenticar herramientas

Instalar Google Cloud CLI y Terraform 1.7 o superior. Luego:

```powershell
gcloud.cmd auth login
gcloud.cmd auth application-default login
gcloud.cmd config set project politeia-quorum
gcloud.cmd config get-value project
```

Verificar que el resultado sea exactamente `politeia-quorum` antes de continuar.

### 3.2 Crear el backend remoto de Terraform

El state contiene referencias sensibles y no debe vivir en Git ni sólo en una computadora. Crear una vez un bucket privado y versionado:

```powershell
gcloud.cmd storage buckets create gs://politeia-quorum-quorum-terraform-state --location=southamerica-east1 --uniform-bucket-level-access
gcloud.cmd storage buckets update gs://politeia-quorum-quorum-terraform-state --versioning
```

Copiar la plantilla privada y completar únicamente nombres e imagen:

```powershell
Copy-Item infra/quorum/terraform/terraform.tfvars.example infra/quorum/terraform/terraform.tfvars
terraform -chdir=infra/quorum/terraform init -backend-config="bucket=politeia-quorum-quorum-terraform-state" -backend-config="prefix=quorum"
```

La plantilla deja `deployment_environments = ["staging"]`; no crear producción durante el batch.

### 3.3 Importar los recursos de staging ya existentes

La base y el bucket de snapshots se crearon previamente. Importarlos evita que Terraform intente recrearlos:

```powershell
terraform -chdir=infra/quorum/terraform import 'google_firestore_database.quorum["staging"]' 'projects/politeia-quorum/databases/quorum-staging'
terraform -chdir=infra/quorum/terraform import 'google_storage_bucket.source_snapshots["staging"]' 'politeia-quorum-quorum-staging-source-snapshots'
```

Si Terraform informa que alguno no existe, detenerse y comprobar el nombre en Google Cloud; no cambiar ni borrar recursos para “hacer pasar” el import.

### 3.4 Crear el repositorio de contenedores y la imagen inmutable

```powershell
gcloud.cmd artifacts repositories describe quorum --location=southamerica-east1
```

Si devuelve “not found”, crearlo una sola vez:

```powershell
gcloud.cmd artifacts repositories create quorum --repository-format=docker --location=southamerica-east1 --description="Quorum API images"
```

Construir usando el SHA real del commit fusionado:

```powershell
$QuorumCommit = git rev-parse HEAD
gcloud.cmd builds submit --tag "southamerica-east1-docker.pkg.dev/politeia-quorum/quorum/quorum-api:$QuorumCommit" .
```

Copiar esa URL completa en `api_images.staging` dentro del `terraform.tfvars`. No usar `latest`.

### 3.5 Crear contenedores de secretos

Terraform crea los nombres, pero nunca los valores. Ejecutar primero este apply acotado:

```powershell
terraform -chdir=infra/quorum/terraform plan -target=google_project_service.required -target=google_secret_manager_secret.quorum
terraform -chdir=infra/quorum/terraform apply -target=google_project_service.required -target=google_secret_manager_secret.quorum
```

Abrir Google Cloud → Security → Secret Manager. Cargar una versión para cada secreto de staging:

| Secret Manager | Contenido | También se carga en Vercel |
|---|---|---|
| `quorum-staging-session-secret` | aleatorio, mínimo 32 caracteres | `SESSION_SECRET` |
| `quorum-staging-google-client-id` | Client ID web de Google | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| `quorum-staging-public-access-emails` | emails exactos de testers, separados por comas | no |
| `quorum-staging-public-gate-secret` | aleatorio distinto, mínimo 32 caracteres | `PUBLIC_ACCESS_GATE_SECRET` |
| `quorum-staging-revalidate-secret` | aleatorio distinto | `NEXT_REVALIDATE_SECRET` |
| `quorum-staging-dispatch-token` | aleatorio distinto | no |
| `quorum-staging-resend-key` | `disabled-for-batch` mientras no haya correo | no |
| `quorum-staging-resend-webhook` | `disabled-for-batch` mientras no haya correo | no |
| `quorum-staging-turnstile-secret` | clave real o `disabled-for-batch` con suscripciones apagadas | no |

Generar cada secreto aleatorio por separado y copiar su salida directamente al servicio correspondiente:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

No reutilizar el secreto de sesión como gate o revalidación. Guardar una copia en el gestor institucional de contraseñas.

### 3.6 Aplicar infraestructura de staging

```powershell
terraform -chdir=infra/quorum/terraform fmt -check -recursive
terraform -chdir=infra/quorum/terraform validate
terraform -chdir=infra/quorum/terraform plan -out=quorum-staging.tfplan
terraform -chdir=infra/quorum/terraform apply quorum-staging.tfplan
terraform -chdir=infra/quorum/terraform output api_urls
```

Guardar la URL `run.app` de `staging`; Vercel la utilizará como `QUORUM_API_BASE_URL`. No compartirla como URL de uso público.

## 4. Configurar Google Sign-In

En Google Cloud → Google Auth Platform:

1. Completar Branding con “Quórum · Politeia”, correo de soporte y datos institucionales.
2. Elegir audiencia interna si todas las cuentas pertenecen al mismo Google Workspace; elegir externa si habrá testers con Gmail u otros dominios Google.
3. Si la app está en modo Testing, agregar las cuentas del batch como test users.
4. Crear un cliente OAuth de tipo “Web application”.
5. Agregar estos Authorized JavaScript origins, sin rutas ni barra final:

```text
https://staging.quorum.politeia.ar
https://gestion.staging.quorum.politeia.ar
http://localhost:3100
http://gestion.localhost:3100
```

6. No agregar redirect URI: Quórum usa el callback JavaScript de Google Identity Services.
7. Copiar el Client ID a Secret Manager y Vercel. El Client Secret de OAuth no se utiliza en este flujo y no debe agregarse al repositorio.

La lista de test users de OAuth y `PUBLIC_ACCESS_ALLOWED_EMAILS` resuelven problemas distintos: Google permite que la cuenta se autentique y Quórum decide si puede entrar al batch.

## 5. Crear el proyecto web en Vercel

Crear inicialmente un único proyecto llamado, por ejemplo, `quorum-staging`:

1. Vercel → Add New → Project.
2. Importar `FundacionPoliteia/politeia-web`.
3. Root Directory: `apps/quorum`.
4. Activar “Include source files outside of the Root Directory”, porque la app usa los workspaces `brand` y `packages/quorum-contracts`.
5. Framework Preset: Next.js. Los comandos ya están en `apps/quorum/vercel.json`.
6. No desplegar aún: cargar primero las variables.

Variables de Vercel para el entorno que sirve staging:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://staging.quorum.politeia.ar` |
| `NEXT_PUBLIC_QUORUM_API_BASE_URL` | `/api/quorum` |
| `QUORUM_API_BASE_URL` | URL `https://...run.app` del output de Terraform |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | mismo Client ID web de Google |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | vacío mientras seguimiento esté apagado, o clave real |
| `NEXT_PUBLIC_ENVIRONMENT` | `staging` |
| `NEXT_REVALIDATE_SECRET` | mismo valor de `quorum-staging-revalidate-secret` |
| `PUBLIC_ACCESS_REQUIRED` | `true` |
| `STAGING_ACCESS_REQUIRED` | `true` |
| `SESSION_SECRET` | mismo valor de `quorum-staging-session-secret` |
| `SESSION_COOKIE_NAME` | `quorum_session` |
| `PUBLIC_ACCESS_GATE_SECRET` | mismo valor de `quorum-staging-public-gate-secret` |
| `GESTION_HOSTS` | `gestion.staging.quorum.politeia.ar,gestion.localhost` |
| `STAGING_HOSTS` | `staging.quorum.politeia.ar,gestion.staging.quorum.politeia.ar` |

Los valores `NEXT_PUBLIC_*` quedan incorporados al build. Toda modificación exige un redeploy. `SESSION_SECRET`, `PUBLIC_ACCESS_GATE_SECRET` y `NEXT_REVALIDATE_SECRET` son secretos de servidor: nunca deben llevar el prefijo `NEXT_PUBLIC_`.

El proxy `/api/quorum` mantiene login y cookies en los hosts de Quórum y evita depender de un dominio personalizado de Cloud Run durante el batch. La API sigue protegida aunque alguien conozca su URL `run.app`.

## 6. Dominios y DNS

En Vercel → proyecto `quorum-staging` → Settings → Domains, agregar:

- `staging.quorum.politeia.ar`
- `gestion.staging.quorum.politeia.ar`

Vercel mostrará los registros exactos. En el proveedor DNS de `politeia.ar`, crear los CNAME indicados. No inventar destinos ni copiar valores de otra cuenta de Vercel.

Esperar certificado válido y verificar ambos hosts por HTTPS antes de probar OAuth. El host `api.staging.quorum.politeia.ar` queda reservado para una fase posterior con Application Load Balancer; `southamerica-east1` no admite el domain mapping directo de Cloud Run.

## 7. Primer despliegue y prueba de acceso

1. Desplegar Vercel desde el commit aprobado.
2. Abrir una ventana incógnita en `https://staging.quorum.politeia.ar`.
3. Confirmar redirección a `/acceso` y cabecera `X-Robots-Tag: noindex, nofollow, noarchive`.
4. Probar una cuenta no incluida: debe recibir rechazo y no ver contenido.
5. Probar un tester incluido: debe ver el sitio, pero no el gestor.
6. Probar `dev@politeia.ar` e `info@politeia.ar`: ambas deben entrar a `https://gestion.staging.quorum.politeia.ar` como administradores.
7. Desde Gestión → Usuarios, asignar un editor de prueba. Cerrar sesión y verificar sus permisos.
8. Abrir directamente la URL `run.app/v1/public/projects`: debe responder `401` sin cookie ni clave interna.
9. Confirmar que borradores, perfiles privados y secretos no aparecen en respuestas públicas.
10. Publicar un proyecto de prueba, recargar su URL pública y revisar historial, glosario, documentos y cronología.

Si se cambia la lista `quorum-staging-public-access-emails`, crear una nueva versión del secreto y desplegar una nueva revisión de Cloud Run para que todas las instancias adopten el valor. Rotar `SESSION_SECRET` invalida inmediatamente todas las sesiones y obliga a volver a ingresar.

## 8. Observabilidad mínima durante el batch

Revisar diariamente:

- Cloud Run → `quorum-api-staging` → Logs: 5xx, 401/403 anómalos y latencia.
- Cloud Scheduler: ejecución del backup diario.
- Storage: existencia de la exportación Firestore del día.
- Vercel → Functions/Logs: fallos del proxy, middleware o revalidación.
- Firestore: ausencia de datos de producción en `quorum-staging`.

Mantener desactivados hasta tener aprobación institucional:

- `subscriptionsEnabled`;
- Resend productivo;
- sincronización automática del Congreso;
- producción y enlace desde `politeia.ar`.

## 9. Abrir el sitio público más adelante

La apertura no requiere quitar Google del gestor.

1. En Terraform, cambiar sólo `public_access_required.production` a `false` y aplicar producción.
2. En el proyecto Vercel de producción, establecer `PUBLIC_ACCESS_REQUIRED=false` y redeploy.
3. Mantener staging con `PUBLIC_ACCESS_REQUIRED=true` y `STAGING_ACCESS_REQUIRED=true`.
4. Confirmar que `/`, fichas, glosario y API pública funcionan sin sesión.
5. Confirmar que `gestion.quorum.politeia.ar` todavía exige Google y roles.
6. Recién entonces habilitar el enlace desde `politeia.ar`.

Rollback inmediato: volver a `PUBLIC_ACCESS_REQUIRED=true` en API y web, desplegar ambas capas y rotar `SESSION_SECRET` si existe sospecha de acceso indebido.
