import AuthorsIndex from '../../../../components/AuthorsIndex';
import { getPublicAuthorProfiles } from '../../../../lib/blogApi';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Autores - Politeia',
  description: 'Conocé las voces que escriben en Politeia.',
};

export default async function AuthorsPage() {
  const authors = await getPublicAuthorProfiles(80);
  return <AuthorsIndex authors={authors} />;
}
