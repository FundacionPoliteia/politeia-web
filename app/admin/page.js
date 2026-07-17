import AdminConsole from '../../components/AdminConsole';

export const metadata = {
  title: 'Panel interno - Politeia',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return <AdminConsole />;
}
