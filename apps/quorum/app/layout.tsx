import type { Metadata, Viewport } from 'next';
import '@politeia/brand/tokens.css';
import './globals.css';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://quorum.politeia.ar';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Quórum · Politeia', template: '%s · Quórum Politeia' },
  description: 'Seguí los principales proyectos legislativos argentinos en lenguaje claro.',
  alternates: { canonical: '/' },
  openGraph: { title: 'Quórum · Politeia', description: 'Información legislativa clara, accesible y apartidaria.', type: 'website', locale: 'es_AR' },
  twitter: { card: 'summary_large_image' },
  ...(process.env.PUBLIC_ACCESS_REQUIRED === 'true' ? { robots: { index: false, follow: false, nocache: true } } : {}),
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f7f5f2' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a className="skip-link" href="#contenido">Saltar al contenido</a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
