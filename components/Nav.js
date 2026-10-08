import { getPosts } from '../lib/blogApi';
import PublicNavbar from './PublicNavbar';

const SHOW_PUBLIC_NAV_LINKS = process.env.NEXT_PUBLIC_SITE_LAUNCHED === 'true';

export default async function Nav() {
  const posts = SHOW_PUBLIC_NAV_LINKS ? await getPosts(1) : [];
  const latestPostAt = posts[0]?.fecha || '';

  return <PublicNavbar latestPostAt={latestPostAt} showLinks={SHOW_PUBLIC_NAV_LINKS} />;
}
