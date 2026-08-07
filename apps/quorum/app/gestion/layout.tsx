import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Gestión', robots: { index: false, follow: false } };

export default function ManagementLayout({ children }: { children: React.ReactNode }) { return children; }
