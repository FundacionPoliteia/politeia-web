import AdminConsole from '../../../components/AdminConsole';

export const metadata = {
  title: 'Gestor editorial - Politeia',
  robots: { index: false, follow: false },
};

export default function InternalBlogPage() {
  return <AdminConsole surface="editorial" />;
}
