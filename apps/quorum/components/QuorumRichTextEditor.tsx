'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

type Props = { value: string; onChange: (markdown: string) => void; onUploadImage: (file: File) => Promise<string>; placeholder?: string; ariaLabel?: string; disabled?: boolean };
type Tool = { label: string; title: string; action: (editor: NonNullable<ReturnType<typeof useEditor>>) => void; active?: (editor: NonNullable<ReturnType<typeof useEditor>>) => boolean; enabled?: (editor: NonNullable<ReturnType<typeof useEditor>>) => boolean };

const groups: Tool[][] = [
  [{ label: 'P', title: 'Párrafo', action: (e) => e.chain().focus().setParagraph().run(), active: (e) => e.isActive('paragraph') }, { label: 'H2', title: 'Título 2', action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive('heading', { level: 2 }) }, { label: 'H3', title: 'Título 3', action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive('heading', { level: 3 }) }],
  [{ label: 'B', title: 'Negrita', action: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') }, { label: 'I', title: 'Cursiva', action: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') }, { label: '“”', title: 'Cita', action: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive('blockquote') }],
  [{ label: '• Lista', title: 'Lista', action: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') }, { label: '1. Lista', title: 'Lista numerada', action: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') }, { label: '—', title: 'Separador horizontal', action: (e) => e.chain().focus().setHorizontalRule().run() }],
  [{ label: '↶', title: 'Deshacer', action: (e) => e.chain().focus().undo().run(), enabled: (e) => e.can().undo() }, { label: '↷', title: 'Rehacer', action: (e) => e.chain().focus().redo().run(), enabled: (e) => e.can().redo() }],
];

export default function QuorumRichTextEditor({ value, onChange, onUploadImage, placeholder = 'Escribí el contenido…', ariaLabel = 'Editor de contenido avanzado', disabled = false }: Props) {
  const [uploading, setUploading] = useState(false); const [tableOpen, setTableOpen] = useState(false); const [error, setError] = useState(''); const fileRef = useRef<HTMLInputElement>(null);
  const lastValue = useRef(value || ''); const turndown = useMemo(createTurndown, []);
  const editor = useEditor({ immediatelyRender: false, editable: !disabled, editorProps: { attributes: { 'aria-label': ariaLabel } }, extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: false }), Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }), Image.configure({ allowBase64: false, HTMLAttributes: { loading: 'lazy' } }), Table.configure({ resizable: true, HTMLAttributes: { class: 'content-table' } }), TableRow, TableHeader, TableCell, Placeholder.configure({ placeholder })], content: markdownToHtml(value), onUpdate: ({ editor: current }) => { const markdown = turndown.turndown(current.getHTML()).replace(/\n{3,}/g, '\n\n').trim(); lastValue.current = markdown; onChange(markdown); } });
  useEffect(() => { editor?.setEditable(!disabled); }, [disabled, editor]);
  useEffect(() => { if (!editor || value === lastValue.current) return; lastValue.current = value || ''; editor.commands.setContent(markdownToHtml(value), { emitUpdate: false }); }, [editor, value]);
  function setLink() { if (!editor) return; const previous = editor.getAttributes('link').href || ''; const url = window.prompt('URL del enlace', previous); if (url === null) return; if (!url.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run(); else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run(); }
  async function upload(file?: File) { if (!file || !editor) return; setUploading(true); setError(''); try { const url = await onUploadImage(file); if (url) editor.chain().focus().setImage({ src: url, alt: '' }).run(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos subir la imagen.'); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; } }
  const tableTools: Tool[] = [{ label: 'Insertar tabla', title: 'Insertar tabla', action: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() }, { label: 'Agregar columna', title: 'Agregar columna', action: (e) => e.chain().focus().addColumnAfter().run(), enabled: (e) => e.can().addColumnAfter() }, { label: 'Agregar fila', title: 'Agregar fila', action: (e) => e.chain().focus().addRowAfter().run(), enabled: (e) => e.can().addRowAfter() }, { label: 'Eliminar columna', title: 'Eliminar columna', action: (e) => e.chain().focus().deleteColumn().run(), enabled: (e) => e.can().deleteColumn() }, { label: 'Eliminar fila', title: 'Eliminar fila', action: (e) => e.chain().focus().deleteRow().run(), enabled: (e) => e.can().deleteRow() }, { label: 'Eliminar tabla', title: 'Eliminar tabla', action: (e) => e.chain().focus().deleteTable().run(), enabled: (e) => e.can().deleteTable() }];
  return <div className={`quorum-rich-editor${disabled ? ' disabled' : ''}`}>
    <div className="quorum-rich-toolbar" aria-label="Herramientas de edición">{groups.map((group, index) => <div className="quorum-rich-toolbar-group" key={index}>{group.map((tool) => <button type="button" title={tool.title} aria-label={tool.title} aria-pressed={Boolean(editor && tool.active?.(editor))} className={editor && tool.active?.(editor) ? 'active' : ''} disabled={!editor || disabled || tool.enabled?.(editor) === false} onClick={() => editor && tool.action(editor)} key={tool.title}>{tool.label}</button>)}</div>)}<div className="quorum-rich-toolbar-group"><button type="button" aria-label="Enlace" disabled={!editor || disabled} onClick={setLink}>Enlace</button><button type="button" aria-label="Subir imagen interna" disabled={!editor || disabled || uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Subiendo…' : 'Imagen'}</button></div><div className="quorum-rich-dropdown"><button type="button" aria-label="Herramientas de tabla" aria-expanded={tableOpen} disabled={!editor || disabled} onClick={() => setTableOpen((open) => !open)}>Tabla</button>{tableOpen && <div className="quorum-rich-dropdown-menu">{tableTools.map((tool) => <button type="button" disabled={!editor || tool.enabled?.(editor) === false} onClick={() => { if (editor) tool.action(editor); setTableOpen(false); }} key={tool.title}>{tool.label}</button>)}</div>}</div><input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void upload(event.target.files?.[0])} /></div>
    {editor && <BubbleMenu className="quorum-rich-bubble" editor={editor} options={{ placement: 'top' }} shouldShow={({ from, to }) => !disabled && from !== to}><button type="button" aria-label="Negrita" onClick={() => editor.chain().focus().toggleBold().run()}>B</button><button type="button" aria-label="Cursiva" onClick={() => editor.chain().focus().toggleItalic().run()}>I</button><button type="button" aria-label="Enlace" onClick={setLink}>Enlace</button></BubbleMenu>}
    <EditorContent className="quorum-rich-content" editor={editor} />{error && <p className="message error" role="alert">{error}</p>}
  </div>;
}

function markdownToHtml(markdown = '') { return marked.parse(markdown || '', { async: false, gfm: true }); }
function createTurndown() { const service = new TurndownService({ bulletListMarker: '-', codeBlockStyle: 'fenced', headingStyle: 'atx' }); service.use(gfm); service.addRule('horizontalRule', { filter: 'hr', replacement: () => '\n\n---\n\n' }); return service; }
