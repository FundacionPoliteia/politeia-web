'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PublicProject, Subscription } from '@politeia/quorum-contracts';
import { publicApiBase } from '@/lib/api';

type Mode = 'confirm' | 'preferences';

export default function SubscriptionManager({ mode, token, projects }: { mode: Mode; token: string; projects: PublicProject[] }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [manageToken, setManageToken] = useState(mode === 'preferences' ? token : '');
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'saved' | 'deleted' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const run = async () => {
      try {
        if (mode === 'confirm') {
          const response = await fetch(`${publicApiBase}/v1/public/follows/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ token }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.message || 'No pudimos confirmar el enlace.');
          setSubscription(data.subscription); setSelected(data.subscription.projectIds); setManageToken(data.manageToken); setState('ready');
        } else {
          const response = await fetch(`${publicApiBase}/v1/public/follows/preferences?token=${encodeURIComponent(token)}`, { credentials: 'include' });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.message || 'No pudimos abrir tus preferencias.');
          setSubscription(data.item); setSelected(data.item.projectIds); setState('ready');
        }
      } catch (error) { setMessage(error instanceof Error ? error.message : 'El enlace no es válido.'); setState('error'); }
    };
    void run();
  }, [mode, token]);

  async function save() {
    setState('loading');
    const response = await fetch(`${publicApiBase}/v1/public/follows/preferences`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ token: manageToken, projectIds: selected }) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error?.message || 'No pudimos guardar los cambios.'); setState('error'); return; }
    setSubscription(data.item); setState('saved');
  }

  async function remove() {
    if (!window.confirm('¿Querés borrar tu email y todas tus preferencias de Quórum?')) return;
    setState('loading');
    const response = await fetch(`${publicApiBase}/v1/public/follows/preferences`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ token: manageToken }) });
    if (!response.ok) { const data = await response.json(); setMessage(data.error?.message || 'No pudimos borrar los datos.'); setState('error'); return; }
    setState('deleted');
  }

  async function exportData() {
    const response = await fetch(`${publicApiBase}/v1/public/follows/export?token=${encodeURIComponent(manageToken)}`, { credentials: 'include' });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error?.message || 'No pudimos exportar los datos.'); setState('error'); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = href; anchor.download = 'quorum-mis-datos.json'; anchor.click(); URL.revokeObjectURL(href);
  }

  if (state === 'loading') return <p className="message" role="status">Validando el enlace…</p>;
  if (state === 'error') return <div className="empty-state"><strong>No pudimos abrir este enlace</strong><p>{message}</p><Link className="button ghost" href="/">Volver a Quórum</Link></div>;
  if (state === 'deleted') return <div className="empty-state"><strong>Tus datos fueron borrados</strong><p>El email fue anonimizado y ya no recibirás avisos.</p><Link className="button ghost" href="/">Volver a Quórum</Link></div>;

  return <div className="preference-panel"><p>{mode === 'confirm' ? 'Tu email quedó confirmado. Elegí qué proyectos querés seguir.' : `Preferencias de ${subscription?.email || 'tu suscripción'}`}</p><fieldset><legend className="sr-only">Proyectos seguidos</legend>{projects.map((project) => <label className="check-card" key={project.id}><input type="checkbox" checked={selected.includes(project.id)} onChange={(event) => setSelected((items) => event.target.checked ? [...new Set([...items, project.id])] : items.filter((id) => id !== project.id))} /><span><strong>{project.title}</strong><small>{project.chamber?.label || 'Proyecto legislativo'}</small></span></label>)}</fieldset>{state === 'saved' && <p className="message" role="status">Preferencias guardadas.</p>}<div className="dialog-actions"><button className="button danger" type="button" onClick={remove}>Borrar mis datos</button><button className="button ghost" type="button" onClick={exportData}>Exportar mis datos</button><button className="button primary" type="button" onClick={save}>Guardar preferencias</button></div></div>;
}
