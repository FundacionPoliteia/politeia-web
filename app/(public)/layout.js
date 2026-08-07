import Nav from '../../components/Nav';
import Footer from '../../components/Footer';

export default function PublicLayout({ children }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  );
}
