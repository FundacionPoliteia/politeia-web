'use client';

import { useEffect, useState, type MouseEvent } from 'react';

type TocItem = {
  id: string;
  label: string;
};

const headingSelector = '.content-block > h2';

export default function ProjectTableOfContents({ contentId }: { contentId: string }) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const content = document.getElementById(contentId);
    if (!content) return;

    let headings: HTMLHeadingElement[] = [];
    let frame = 0;
    // The private preview scrolls inside a panel rather than the window.
    let scrollRoot: HTMLElement | null = content.parentElement;
    while (scrollRoot && !/(auto|scroll)/.test(getComputedStyle(scrollRoot).overflowY)) scrollRoot = scrollRoot.parentElement;

    const refresh = () => {
      const usedIds = new Set<string>();
      const nextHeadings = Array.from(content.querySelectorAll<HTMLHeadingElement>(headingSelector));
      const nextItems = nextHeadings.map((heading, index) => {
        const label = heading.textContent?.trim() || `Sección ${index + 1}`;
        const baseId = heading.id || slugify(label) || `seccion-${index + 1}`;
        let id = baseId;
        let suffix = 2;
        while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
        usedIds.add(id);
        heading.id = id;
        return { id, label };
      });

      headings = nextHeadings;
      setItems(nextItems);
      setActiveId((current) => nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id || '');
    };

    const updateActive = () => {
      const top = scrollRoot?.getBoundingClientRect().top || 0;
      const height = scrollRoot?.clientHeight || window.innerHeight;
      const marker = top + Math.min(180, Math.max(112, height * 0.22));
      let current = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= marker) current = heading;
        else break;
      }
      // Short final sections may never reach the reading marker before scroll ends.
      if (headings.length && headings[0].getBoundingClientRect().top < marker && content.getBoundingClientRect().bottom <= top + height) current = headings[headings.length - 1];
      if (current?.id) setActiveId(current.id);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; updateActive(); });
    };

    refresh();
    updateActive();
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);
    const observer = new MutationObserver(() => { refresh(); onScroll(); });
    observer.observe(content, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(onScroll);
    resizeObserver.observe(content);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [contentId]);

  function navigate(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const heading = Array.from(document.getElementById(contentId)?.querySelectorAll<HTMLHeadingElement>(headingSelector) || []).find((item) => item.id === id);
    if (!heading) return;
    event.preventDefault();
    heading.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    // Scope focus to this article: the editor can show another copy in preview.
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  if (!items.length) return null;

  return <aside className="project-toc" aria-label="Tabla de contenidos">
    <div className="project-toc-inner">
      <p className="project-toc-label">En esta ficha</p>
      <nav>
        <ol>
          {items.map((item) => <li key={item.id}>
            <a className={item.id === activeId ? 'is-active' : ''} href={`#${item.id}`} onClick={(event) => navigate(event, item.id)} aria-current={item.id === activeId ? 'location' : undefined}>
              <span aria-hidden="true" />
              {item.label}
            </a>
          </li>)}
        </ol>
      </nav>
    </div>
  </aside>;
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
