# Cheat Sheet de Next.js para este proyecto

Referencia rapida para codear, mantener y extender esta app.

## Comandos npm

```bash
npm install
npm ci
npm run dev
npm run dev -- -p 3001
npm run build
npm run start
npm run lint
npm run blog-api:dev
npm run blog-api:test
```

- `npm install`: instala dependencias y puede actualizar `package-lock.json`.
- `npm ci`: instala exactamente lo indicado en `package-lock.json`; ideal para CI/deploy.
- `npm run dev`: servidor local en `http://localhost:3000`.
- `npm run build`: valida que Next.js pueda compilar en produccion.
- `npm run start`: sirve la build generada por `npm run build`.
- `npm run lint`: corre lint si el proyecto tiene configuracion compatible.
- `npm run blog-api:dev`: levanta el backend Express de blogs.
- `npm run blog-api:test`: corre tests del backend de blogs.

## Comandos Git utiles

```bash
git status
git checkout -b nombre-del-cambio
git add .
git commit -m "Descripcion clara del cambio"
git push origin nombre-del-cambio
git push origin main
```

## App Router

Next.js usa rutas basadas en carpetas dentro de `app`.

```text
app/page.js                  -> /
app/origen/page.js           -> /origen
app/proyectos/page.js        -> /proyectos
app/equipo/page.js           -> /equipo
app/blog/page.js             -> /blog
app/blog/[slug]/page.js      -> /blog/cualquier-slug
```

Reglas practicas:

- Una carpeta representa un segmento de URL.
- Un archivo `page.js` crea una pagina publica.
- Un archivo `layout.js` crea estructura compartida para sus paginas hijas.
- `app/layout.js` es obligatorio y envuelve toda la aplicacion.

## Server Components por defecto

En App Router, los componentes son de servidor por defecto.

Usar componentes de servidor para:

- Traer datos con `fetch`.
- Leer datos desde helpers server-side.
- Renderizar contenido sin interaccion del navegador.
- Mantener menos JavaScript en el cliente.

Ejemplo:

```js
import { getPosts } from '../lib/blogApi';

export default async function Home() {
  const posts = await getPosts(6);
  return <main>{posts.length}</main>;
}
```

## Client Components

Agregar `'use client'` solo cuando haga falta:

- `useState`
- `useEffect`
- `useRef`
- eventos como `onClick`, `onSubmit`, `onChange`
- timers como `setInterval` o `setTimeout`
- APIs del navegador como `window`, `document` o `localStorage`

Ejemplo:

```js
'use client';

import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

## Navegacion interna

Usar `Link` de Next.js para rutas internas:

```js
import Link from 'next/link';

<Link href="/blog">Blog</Link>
<Link href={`/blog/${post.slug}`}>{post.titulo}</Link>
```

Usar `<a>` para links externos:

```js
<a href="https://politeiatest.vercel.app/" target="_blank" rel="noopener">
  Promesas
</a>
```

## Metadata

Para metadata estatica:

```js
export const metadata = {
  title: 'Proyectos - Politeia',
  description: 'Descripcion de la pagina',
};
```

Para metadata dinamica:

```js
export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);
  return { title: post ? `${post.titulo} - Politeia` : 'No encontrado' };
}
```

## Rutas dinamicas

Una carpeta entre corchetes crea un parametro dinamico:

```text
app/blog/[slug]/page.js
```

Uso:

```js
export default async function NotaPage({ params }) {
  const post = await getPost(params.slug);
}
```

Generar rutas conocidas:

```js
export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}
```

Permitir rutas nuevas despues del build:

```js
export const dynamicParams = true;
```

## Not Found

Para mostrar la pagina 404 de Next.js:

```js
import { notFound } from 'next/navigation';

if (!post) notFound();
```

## Fetch con revalidacion

Patron usado para la API de blogs:

```js
const res = await fetch(url, {
  next: { revalidate: 300 },
});
```

Esto le indica a Next.js que puede cachear la respuesta y refrescarla cada 300 segundos.

## Helpers de datos

Mantener la logica de APIs externas fuera de las paginas.

Buen patron:

```text
lib/blogApi.js
```

La pagina importa funciones de alto nivel:

```js
import { getPosts } from '../../lib/blogApi';
```

Evitar repetir URLs, normalizacion y `try/catch` en cada pagina.

## Manejo defensivo de APIs externas

Cuando una API externa falla, devolver un valor seguro:

```js
try {
  const res = await fetch(url);
  if (!res.ok) return [];
  return await res.json();
} catch (e) {
  return [];
}
```

Para un recurso individual:

```js
if (!data.length) return null;
```

## Renderizar HTML externo

La API devuelve `contentHtml` sanitizado por el backend. En React se renderiza asi:

```js
<div dangerouslySetInnerHTML={{ __html: post.contenido }} />
```

Precauciones:

- Usarlo solo con fuentes confiables.
- Evitar usarlo para contenido ingresado por usuarios desconocidos.
- Aplicar estilos al contenedor, por ejemplo `.art-body`.

## Backend de blogs

Ubicacion:

```text
services/blog-api
```

Comandos:

```bash
cd services/blog-api
npm install
npm run dev
npm test
```

Endpoints principales:

```text
GET    /healthz
GET    /docs
GET    /v1/posts
GET    /v1/posts/:slug
POST   /v1/posts
PATCH  /v1/posts/:id
DELETE /v1/posts/:id
POST   /v1/posts/:id/submit-review
POST   /v1/posts/:id/publish
POST   /v1/posts/:id/archive
POST   /v1/media
```

Variables importantes:

```text
BLOG_API_BASE_URL=http://localhost:8080
GCP_PROJECT_ID=quick-function-500420-v6
MEDIA_BUCKET=politeia-blog-media-quick-function-500420-v6
ALLOWED_ORIGIN=http://localhost:3000
GOOGLE_CLIENT_ID=...
BLOG_GROUP_EMAIL=politeia-blog@dominio
ADMIN_GROUP_EMAIL=politeia-admin@dominio
```

## CSS global

Este proyecto usa `app/globals.css`.

Patrones utiles:

```css
.wrap {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
}

.sec {
  padding: 80px 0;
}
```

Consejos:

- Reutilizar clases existentes como `wrap`, `sec`, `cards`, `card`, `btn`, `eyebrow`.
- Mantener nombres descriptivos.
- Evitar estilos inline salvo casos puntuales o valores dinamicos.

## Imagenes

Si se usa `next/image` con dominios externos, agregar el dominio en `next.config.js`.

Ejemplo:

```js
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'politeia.ar' },
      { protocol: 'https', hostname: '**.politeia.ar' },
    ],
  },
};
```

Para imagenes de fondo dinamicas, el proyecto actualmente usa:

```js
style={post.imagen ? { backgroundImage: `url('${post.imagen}')` } : {}}
```

## Formularios cliente

Un formulario con estado necesita `'use client'`.

```js
'use client';

import { useState } from 'react';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');

  function onSubmit(e) {
    e.preventDefault();
  }

  return (
    <form onSubmit={onSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit">Enviar</button>
    </form>
  );
}
```

## Patrones para agregar una pagina

1. Crear carpeta dentro de `app`.
2. Agregar `page.js`.
3. Exportar metadata si corresponde.
4. Usar clases globales existentes.
5. Agregar link en `components/Nav.js` o `components/Footer.js` si debe estar navegable.

Ejemplo:

```text
app/contacto/page.js
```

```js
export const metadata = { title: 'Contacto - Politeia' };

export default function ContactoPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Contacto</span>
          <h1>Hablemos.</h1>
        </div>
      </section>
    </main>
  );
}
```

## Patrones para agregar un componente

1. Crear archivo en `components/Nombre.js`.
2. Exportar una funcion por defecto.
3. Mantenerlo server component salvo que necesite interaccion.
4. Importarlo desde la pagina o layout.

```js
export default function BloqueSimple({ titulo, texto }) {
  return (
    <section className="sec">
      <div className="wrap">
        <h2>{titulo}</h2>
        <p>{texto}</p>
      </div>
    </section>
  );
}
```

## Checklist antes de deploy

```bash
npm install
npm run build
git status
```

Revisar:

- Que la home cargue.
- Que `/blog` no rompa si la API tarda o no responde.
- Que una nota individual abra correctamente.
- Que los links externos tengan `target="_blank"` y `rel="noopener"`.
- Que no haya variables de entorno faltantes.

## Errores comunes

- Usar hooks en un componente sin `'use client'`.
- Usar `<a href="/ruta">` para navegacion interna en vez de `Link`.
- Olvidar agregar dominios externos en `next.config.js` al usar `next/image`.
- Acceder a `window` o `document` desde un server component.
- Renderizar HTML externo sin controlar la fuente.
- Poner logica de API duplicada dentro de cada pagina.
