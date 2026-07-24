'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { HelpTooltip } from './AdminHelp';
import { IMAGE_UPLOAD_ACCEPT } from '../lib/media';

const TOOLBAR_GROUPS = [
  [
    { icon: 'notes', label: 'P', title: 'Parrafo', action: (editor) => editor.chain().focus().setParagraph().run(), active: (editor) => editor.isActive('paragraph') },
    { label: 'H2', title: 'Titulo 2', action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: (editor) => editor.isActive('heading', { level: 2 }) },
    { label: 'H3', title: 'Titulo 3', action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: (editor) => editor.isActive('heading', { level: 3 }) },
  ],
  [
    { icon: 'format_bold', label: 'B', title: 'Negrita', action: (editor) => editor.chain().focus().toggleBold().run(), active: (editor) => editor.isActive('bold') },
    { icon: 'format_italic', label: 'I', title: 'Cursiva', action: (editor) => editor.chain().focus().toggleItalic().run(), active: (editor) => editor.isActive('italic') },
    { icon: 'format_quote', label: '"', title: 'Cita', action: (editor) => editor.chain().focus().toggleBlockquote().run(), active: (editor) => editor.isActive('blockquote') },
  ],
  [
    { icon: 'format_list_bulleted', label: 'UL', title: 'Lista', action: (editor) => editor.chain().focus().toggleBulletList().run(), active: (editor) => editor.isActive('bulletList') },
    { icon: 'format_list_numbered', label: 'OL', title: 'Lista numerada', action: (editor) => editor.chain().focus().toggleOrderedList().run(), active: (editor) => editor.isActive('orderedList') },
    { icon: 'horizontal_rule', label: 'Linea', title: 'Separador horizontal', action: (editor) => editor.chain().focus().setHorizontalRule().run() },
  ],
  [
    { icon: 'undo', label: '<-', title: 'Deshacer', action: (editor) => editor.chain().focus().undo().run(), enabled: (editor) => editor.can().undo() },
    { icon: 'redo', label: '->', title: 'Rehacer', action: (editor) => editor.chain().focus().redo().run(), enabled: (editor) => editor.can().redo() },
  ],
];

const TABLE_TOOLS = [
  { icon: 'add', label: 'Insertar tabla', title: 'Insertar tabla', action: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { icon: 'view_column', label: 'Agregar columna', title: 'Agregar columna', action: (editor) => editor.chain().focus().addColumnAfter().run(), enabled: (editor) => editor.can().addColumnAfter() },
  { icon: 'table_rows', label: 'Agregar fila', title: 'Agregar fila', action: (editor) => editor.chain().focus().addRowAfter().run(), enabled: (editor) => editor.can().addRowAfter() },
  { icon: 'delete', label: 'Eliminar columna', title: 'Eliminar columna', action: (editor) => editor.chain().focus().deleteColumn().run(), enabled: (editor) => editor.can().deleteColumn() },
  { icon: 'delete', label: 'Eliminar fila', title: 'Eliminar fila', action: (editor) => editor.chain().focus().deleteRow().run(), enabled: (editor) => editor.can().deleteRow() },
  { icon: 'delete', label: 'Eliminar tabla', title: 'Eliminar tabla', action: (editor) => editor.chain().focus().deleteTable().run(), enabled: (editor) => editor.can().deleteTable() },
];

const ReviewComment = Mark.create({
  name: 'reviewComment',
  inclusive: false,
  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-review-comment-id'),
        renderHTML: (attributes) => {
          if (!attributes.commentId) return {};
          return { 'data-review-comment-id': attributes.commentId };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-review-comment-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'review-comment-mark' }), 0];
  },
});

export default function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  onCreateComment,
  showCommentTools = true,
  placeholder = 'Escribi o importa el contenido de la nota...',
  activeCommentId = '',
  activeCommentNonce = 0,
  disabled = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(null);
  const fileInputRef = useRef(null);
  const lastAppliedMarkdown = useRef(value || '');
  const turndown = useMemo(() => createTurndown(), []);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: {
          loading: 'lazy',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'content-table',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      ReviewComment,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: markdownToHtml(value),
    onUpdate: ({ editor }) => {
      const markdown = htmlToMarkdown(editor.getHTML(), turndown);
      lastAppliedMarkdown.current = markdown;
      onChange(markdown);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const nextValue = value || '';
    if (nextValue === lastAppliedMarkdown.current) return;
    lastAppliedMarkdown.current = nextValue;
    editor.commands.setContent(markdownToHtml(nextValue), false);
  }, [editor, value]);

  useEffect(() => {
    if (!editor || !activeCommentId) return;
    const range = findCommentRange(editor, activeCommentId);
    if (!range) return;
    editor.chain().focus().setTextSelection(range).run();
    window.setTimeout(() => {
      const element = document.querySelector(`[data-review-comment-id="${CSS.escape(activeCommentId)}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  }, [editor, activeCommentId, activeCommentNonce]);

  async function uploadInlineImage(file) {
    if (!file || !onUploadImage || !editor) return;
    try {
      setUploading(true);
      const url = await onUploadImage(file);
      if (url) editor.chain().focus().setImage({ src: url, alt: '' }).run();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href || '';
    const url = window.prompt('URL del enlace', previousUrl);
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  async function addReviewComment() {
    if (!editor || !onCreateComment) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    if (selectionHasReviewComment(editor)) return;
    const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
    setCommentDraft({ from, to, selectedText, body: '' });
  }

  async function submitReviewComment() {
    if (!editor || !commentDraft || !commentDraft.body.trim() || commentSubmitting) return;

    const previousMarkdown = htmlToMarkdown(editor.getHTML(), turndown);
    const commentId = createReviewCommentId();
    setCommentSubmitting(true);

    try {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: commentDraft.from, to: commentDraft.to })
        .setMark('reviewComment', { commentId })
        .run();
      const markdown = htmlToMarkdown(editor.getHTML(), turndown);

      const comment = await onCreateComment({
        body: commentDraft.body.trim(),
        selectedText: commentDraft.selectedText,
        commentId,
        contentMarkdown: markdown,
      });
      if (!comment?.id) {
        lastAppliedMarkdown.current = previousMarkdown;
        editor.commands.setContent(markdownToHtml(previousMarkdown), false);
        onChange(previousMarkdown);
        return;
      }

      lastAppliedMarkdown.current = markdown;
      onChange(markdown);
      setCommentDraft(null);
    } finally {
      setCommentSubmitting(false);
    }
  }

  return (
    <div className={`rich-editor ${disabled ? 'disabled' : ''}`}>
      <div className="rich-toolbar" aria-label="Herramientas de edicion">
        {TOOLBAR_GROUPS.map((group, index) => (
          <div className="rich-toolbar-group" key={index}>
            {group.map((tool) => (
              <HelpTooltip key={tool.title} text={tool.title}>
                <button
                  aria-label={tool.title}
                  aria-pressed={editor ? Boolean(tool.active?.(editor)) : false}
                  className={editor && tool.active?.(editor) ? 'active' : ''}
                  disabled={disabled || !editor || tool.enabled?.(editor) === false}
                  onClick={() => tool.action(editor)}
                  type="button"
                >
                  <ToolbarLabel tool={tool} />
                </button>
              </HelpTooltip>
            ))}
          </div>
        ))}

        <div className="rich-toolbar-group">
          {showCommentTools && (
            <HelpTooltip text="Comentar seleccion">
            <button
              aria-label="Comentar seleccion"
              disabled={disabled || !editor || !onCreateComment || editor.state.selection.empty || selectionHasReviewComment(editor)}
              onClick={addReviewComment}
              type="button"
            >
              <Icon name="add_comment" />
            </button>
            </HelpTooltip>
          )}
          <HelpTooltip text="Enlace">
            <button aria-label="Enlace" disabled={disabled || !editor} onClick={setLink} type="button">
              <Icon name="link" />
            </button>
          </HelpTooltip>
          <HelpTooltip text="Subir imagen interna">
          <button
            aria-label="Subir imagen interna"
            disabled={disabled || uploading || !editor}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Icon name={uploading ? 'hourglass_top' : 'add_photo_alternate'} />
          </button>
          </HelpTooltip>
        </div>

        <div className="rich-toolbar-group rich-dropdown">
          <HelpTooltip text="Herramientas de tabla">
          <button
            aria-expanded={tableMenuOpen}
            aria-label="Herramientas de tabla"
            disabled={disabled || !editor}
            onClick={() => setTableMenuOpen((open) => !open)}
            type="button"
          >
            <Icon name="table_chart" />
          </button>
          </HelpTooltip>
          {tableMenuOpen && (
            <div className="rich-dropdown-menu">
              {TABLE_TOOLS.map((tool) => (
                <button
                  aria-label={tool.title}
                  disabled={disabled || !editor || tool.enabled?.(editor) === false}
                  key={tool.title}
                  onClick={() => {
                    tool.action(editor);
                    setTableMenuOpen(false);
                  }}
                  type="button"
                >
                  <Icon name={tool.icon} />
                  <span>{tool.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          accept={IMAGE_UPLOAD_ACCEPT}
          hidden
          onChange={(event) => uploadInlineImage(event.target.files?.[0])}
          ref={fileInputRef}
          type="file"
        />
      </div>

      {editor && (
        <BubbleMenu
          className="rich-bubble-menu"
          editor={editor}
          options={{ placement: 'top' }}
          shouldShow={({ editor, from, to }) => !disabled && editor.isEditable && from !== to}
        >
          <button
            aria-label="Negrita"
            aria-pressed={editor.isActive('bold')}
            className={editor.isActive('bold') ? 'active' : ''}
            data-tooltip="Negrita"
            onClick={() => editor.chain().focus().toggleBold().run()}
            type="button"
          >
            <Icon name="format_bold" />
          </button>
          <button
            aria-label="Cursiva"
            aria-pressed={editor.isActive('italic')}
            className={editor.isActive('italic') ? 'active' : ''}
            data-tooltip="Cursiva"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            type="button"
          >
            <Icon name="format_italic" />
          </button>
          <button
            aria-label="Enlace"
            aria-pressed={editor.isActive('link')}
            className={editor.isActive('link') ? 'active' : ''}
            data-tooltip="Enlace"
            onClick={setLink}
            type="button"
          >
            <Icon name="link" />
          </button>
          <button
            aria-label="Cita"
            aria-pressed={editor.isActive('blockquote')}
            className={editor.isActive('blockquote') ? 'active' : ''}
            data-tooltip="Cita"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            type="button"
          >
            <Icon name="format_quote" />
          </button>
          <button
            aria-label="Separador horizontal"
            data-tooltip="Separador horizontal"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            type="button"
          >
            <Icon name="horizontal_rule" />
          </button>
          {showCommentTools && (
            <button
              aria-label="Comentar seleccion"
              data-tooltip="Comentar seleccion"
              disabled={!onCreateComment || selectionHasReviewComment(editor)}
              onClick={addReviewComment}
              type="button"
            >
              <Icon name="add_comment" />
            </button>
          )}
        </BubbleMenu>
      )}

      <EditorContent className="rich-editor-content" editor={editor} />

      {commentDraft && (
        <div className="admin-modal-backdrop" role="presentation">
          <div aria-modal="true" className="admin-modal rich-comment-modal" role="dialog">
            <h3>Comentario de revision</h3>
            <p>Este comentario quedará asociado al texto seleccionado.</p>
            {commentDraft.selectedText && <q>{commentDraft.selectedText}</q>}
            <label>
              Comentario
              <textarea
                autoFocus
                onChange={(event) => setCommentDraft((current) => ({ ...current, body: event.target.value }))}
                placeholder="Escribi la observacion para el autor..."
                rows="5"
                value={commentDraft.body}
              />
            </label>
            <div className="admin-modal-actions">
              <button className="btn btn-ghost" disabled={commentSubmitting} onClick={() => setCommentDraft(null)} type="button">
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={commentSubmitting || !commentDraft.body.trim()} onClick={submitReviewComment} type="button">
                {commentSubmitting ? 'Agregando...' : 'Agregar comentario'}
                {commentSubmitting && <span className="admin-button-spinner" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarLabel({ tool }) {
  return tool.icon ? <Icon name={tool.icon} /> : tool.label;
}

function Icon({ name }) {
  return <span aria-hidden="true" className="material-symbols-outlined">{name}</span>;
}

function markdownToHtml(markdown = '') {
  return marked.parse(stripImageAlt(markdown || ''), { async: false, gfm: true });
}

function stripImageAlt(markdown = '') {
  return markdown.replace(/!\[[^\]]*]\(([^)]+)\)/g, '![]($1)');
}

function htmlToMarkdown(html, turndown) {
  return turndown
    .turndown(html)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createTurndown() {
  const turndown = new TurndownService({
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    headingStyle: 'atx',
  });
  turndown.use(gfm);

  turndown.addRule('horizontalRule', {
    filter: 'hr',
    replacement: () => '\n\n---\n\n',
  });
  turndown.addRule('reviewComment', {
    filter: (node) => node.nodeName === 'SPAN' && node.hasAttribute('data-review-comment-id'),
    replacement: (_content, node) => node.outerHTML,
  });
  addHtmlTableRule(turndown);

  return turndown;
}

function addHtmlTableRule(turndown) {
  turndown.addRule('htmlTable', {
    filter: 'table',
    replacement: (_content, node) => `\n\n${node.outerHTML}\n\n`,
  });
}

function findCommentRange(editor, commentId) {
  let range = null;
  editor.state.doc.descendants((node, pos) => {
    if (range || !node.isText) return;
    const mark = node.marks.find((item) => item.type.name === 'reviewComment' && item.attrs.commentId === commentId);
    if (mark) range = { from: pos, to: pos + node.nodeSize };
  });
  return range;
}

function selectionHasReviewComment(editor) {
  if (!editor || editor.state.selection.empty) return false;
  const { from, to } = editor.state.selection;
  let found = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (found || !node.isText) return;
    found = node.marks.some((item) => item.type.name === 'reviewComment');
  });
  return found;
}

function createReviewCommentId() {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `comment-${random.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
