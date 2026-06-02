'use client';
import { useState } from 'react';

export default function NewsletterForm() {
  const [enviado, setEnviado] = useState(false);
  const [email, setEmail] = useState('');

  function onSubmit(e) {
    e.preventDefault();
    // Por ahora solo confirma visualmente. Cuando quieras enviar mails de verdad,
    // acá se conecta el servicio de email (ver guía).
    setEnviado(true);
    setEmail('');
  }

  return (
    <form className="news-form" onSubmit={onSubmit}>
      <input
        type="email"
        placeholder="tu@email.com"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit">{enviado ? '¡Listo! ✓' : 'Suscribirme'}</button>
    </form>
  );
}
