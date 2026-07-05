# Politeia Web

Sitio institucional y plataforma de contenidos de Fundacion Politeia, construido con Next.js. La aplicacion presenta la identidad de la fundacion, sus proyectos, su equipo y un blog conectado a una API propia preparada para Google Cloud Run.

Politeia busca acercar la ciudadania a la politica mediante informacion clara, datos abiertos, herramientas digitales y contenidos de analisis. Este sitio funciona como puerta de entrada al ecosistema: muestra el proyecto Promesas, anticipa Quorum, publica notas del Observatorio y organiza la informacion institucional de la fundacion.

## Que incluye

- Home institucional con hero animado, carrusel de notas destacadas, seccion de proyectos, ultimas notas del blog y formulario de newsletter.
- Blog dinamico alimentado desde `BLOG_API_BASE_URL`, una API Express propia.
- Paginas individuales para cada nota del blog, generadas por slug.
- Paginas estaticas para origen, proyectos y equipo.
- Navegacion y footer compartidos en todo el sitio.
- Estilos globales en CSS puro, sin framework de componentes.
- Revalidacion de contenido para que las notas nuevas aparezcan sin tener que reconstruir manualmente todo el sitio.

## Stack tecnico

- Next.js `15.5.7`
- React `19.2.3`
- React DOM `19.2.3`
- npm como gestor de paquetes
- App Router de Next.js, usando la carpeta `app`
- Componentes de servidor por defecto
- Componentes cliente solo cuando hay estado o efectos del navegador
- API Node.js + Express en Cloud Run como fuente de contenido
- Firestore para posts, media y auditoria
- Cloud Storage para imagenes cargadas desde la API
- Google Identity + Google Groups para perfiles `blog`, `reviewer` y `admin`

## Estructura principal

```text
app/
  layout.js              Layout global, metadata base, fuentes, nav y footer
  page.js                Home
  globals.css            Estilos globales del sitio
  blog/
    page.js              Listado del blog
    [slug]/
      page.js            Detalle de nota
  equipo/
    page.js              Pagina de equipo
  origen/
    page.js              Pagina institucional de origen
  proyectos/
    page.js              Pagina de proyectos

components/
  Footer.js              Footer global
  Hero.js                Hero interactivo y carrusel de notas
  Nav.js                 Navegacion principal
  NewsletterForm.js      Formulario cliente para newsletter

lib/
  blogApi.js             Cliente publico para la API de blogs
  wordpress.js           Cliente legado de WordPress, no usado por las rutas actuales

services/
  blog-api/              Backend Express para Cloud Run

DEVELOPMENT.md           Guia para levantar desarrollo local
DEPLOYMENT.md            Guia de publicacion en GitHub y deploy
PRODUCTION-RUNBOOK.md    Manual paso a paso para pase a produccion y QA en vivo
CHEAT-SHEET.md           Referencia rapida de comandos y patrones de Next.js
```

## Rutas de la aplicacion

- `/`: home principal de Politeia.
- `/origen`: historia, proposito y valores de la fundacion.
- `/proyectos`: listado de iniciativas como Promesas, Quorum, Observatorio de Innovacion y Revista IDEAR.
- `/equipo`: miembros y areas del equipo.
- `/blog`: listado de notas publicadas desde la API propia.
- `/blog/[slug]`: pagina individual de una nota.

## Flujo de datos del blog

El contenido del blog se obtiene desde la variable:

```text
BLOG_API_BASE_URL
```

La logica vive en `lib/blogApi.js`:

- `getPosts(cantidad)`: trae las ultimas notas, incluyendo autor, categoria e imagen destacada.
- `getPost(slug)`: trae una nota puntual por su slug.
- `getAllSlugs()`: trae los slugs disponibles para generar paginas de blog.
- `formatearFecha(iso)`: formatea fechas en espanol de Argentina.

Las respuestas se normalizan antes de llegar a las paginas. Eso permite que los componentes trabajen con objetos simples como `titulo`, `extracto`, `contenido`, `fecha`, `imagen`, `autor`, `categoria` y `tags`.

Next.js usa revalidacion con `next: { revalidate: 300 }`, por lo que el contenido se refresca como maximo cada 5 minutos.

## Backend de blogs

El backend vive en `services/blog-api` y expone una REST API versionada bajo `/v1`.

- Publico: `GET /v1/posts`, `GET /v1/posts/:slug`.
- Perfil `blog`: crear, editar, subir/importar contenido y enviar posts a revision.
- Perfil `reviewer`: incluye `blog` y suma revision, preparacion editorial, categorias, slug, publicacion y archivo.
- Perfil `admin`: incluye `reviewer` y suma eliminacion y responsabilidades administrativas.
- Swagger protegido: `GET /docs`.
- Healthcheck: `GET /healthz`.

Los posts se guardan en Firestore, las imagenes cargadas se guardan en Cloud Storage y los roles se resuelven con Google Identity + Google Groups. En local se puede usar `DEV_AUTH=true` dentro de `services/blog-api/.env`.

La UI interna vive en `/admin`, visible solo desde `admin.politeia.ar`. Usa Google Identity en el navegador, consulta `/v1/me` para conocer el perfil y habilita acciones segun rol.

## Paginas y componentes

### Layout global

`app/layout.js` define la estructura HTML comun:

- Idioma `es`.
- Metadata base del sitio.
- Precarga de fuentes de Google Fonts.
- `Nav` antes del contenido.
- `Footer` despues del contenido.

### Home

`app/page.js` es una pagina de servidor asincrona. Antes de renderizar, pide notas publicadas a la API con `getPosts(6)`.

La home incluye:

- Hero con frase animada.
- Carrusel de notas destacadas.
- Marquee visual con conceptos clave.
- Cards del entorno Politeia.
- Ultimas tres notas del blog.
- Bloque de newsletter.

### Hero

`components/Hero.js` es un componente cliente porque usa:

- `useState` para manejar el texto animado y el slide activo.
- `useEffect` para el efecto de maquina de escribir.
- `useEffect` para avanzar el carrusel automaticamente.
- `useRef` para mantener estado interno entre ticks sin causar renders innecesarios.

Recibe `destacadas` desde la home y usa las primeras cuatro notas como slides.

### Blog

`app/blog/page.js` trae hasta 30 posts publicados desde la API y los muestra como tarjetas.

`app/blog/[slug]/page.js`:

- Genera parametros estaticos con `generateStaticParams`.
- Permite slugs nuevos con `dynamicParams = true`.
- Genera metadata por nota con `generateMetadata`.
- Renderiza el `contentHtml` sanitizado por el backend con `dangerouslySetInnerHTML`.
- Usa `notFound()` si el slug no existe.

## Desarrollo local

Instalar dependencias:

```bash
npm install
```

Levantar el servidor local:

```bash
npm run dev
```

Abrir:

```text
http://localhost:3000
```

Probar build de produccion:

```bash
npm run build
npm run start
```

Para mas detalle, ver `DEVELOPMENT.md`.

Para levantar el backend:

```bash
cd services/blog-api
npm install
npm run dev
```

## Scripts disponibles

- `npm run dev`: inicia el servidor de desarrollo.
- `npm run build`: compila la aplicacion para produccion.
- `npm run start`: corre la build de produccion.
- `npm run lint`: ejecuta el linter de Next.js si esta configurado.
- `npm run blog-api:dev`: inicia la API de blogs.
- `npm run blog-api:test`: corre los tests de la API de blogs.

## Configuracion

La variable obligatoria para conectar el frontend al backend es:

```text
BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
NEXT_PUBLIC_BLOG_API_BASE_URL=https://URL_DE_CLOUD_RUN
NEXT_PUBLIC_GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID
```

## Deployment

El codigo puede publicarse en GitHub y conectarse a un proveedor compatible con Next.js, como Vercel, Netlify o un servidor Node.js propio.

La opcion recomendada es Vercel porque detecta Next.js automaticamente y puede desplegar cada push a `main`.

Comandos base antes de publicar:

```bash
npm install
npm run build
git add .
git commit -m "Descripcion del cambio"
git push origin main
```

Para mas detalle, ver `DEPLOYMENT.md`.

## Notas importantes para futuros cambios

- Mantener los datos externos centralizados en `lib/blogApi.js`.
- Usar componentes de servidor por defecto.
- Agregar `'use client'` solo cuando el componente necesite hooks, eventos del navegador, timers o estado interactivo.
- Evitar duplicar estilos inline si una regla puede vivir en `app/globals.css`.
- Cuidar el HTML recibido desde la API, porque el detalle de nota lo renderiza directamente. El backend debe seguir sanitizando Markdown a HTML.
- Si se conecta el newsletter a un servicio real, el punto de entrada actual es `components/NewsletterForm.js`.
- Si se agregan imagenes con `next/image`, revisar `next.config.js` para permitir el dominio remoto.
