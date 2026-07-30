import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import PublicNewsletterNudge from '../../components/PublicNewsletterNudge';

export default function PublicLayout({ children }) {
  return (
    <>
      <Nav />
      {children}
      <PublicNewsletterNudge />
      <Footer />
    </>
  );
}
