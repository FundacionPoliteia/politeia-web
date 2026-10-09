import { expect, test } from '@playwright/test';

const apiBase = `http://localhost:${process.env.QUORUM_E2E_API_PORT || 8890}`;

test('la grilla compacta sólo cambia la vista mobile de las fichas', async ({ page, request }, info) => {
  const suffix = info.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const title = `Proyecto vista compacta ${suffix}`;
  const slug = `proyecto-vista-compacta-${suffix}`;
  async function createProject(options: { title: string; slug: string; publicDebate: boolean }) {
    const created = await request.post(`${apiBase}/v1/manage/projects`, { data: {
      title: options.title,
      slug: options.slug,
      workflowId: 'legislativo-nacional-v1',
      workflowVersion: 1,
      currentStageId: 'mesa-de-entrada',
      docketNumber: `VC-${options.slug}`,
      entryDate: '2026-09-01',
      originChamberId: 'diputados',
      initiativeTypeId: 'poder-legislativo',
      publicDebate: options.publicDebate,
      summary: 'Un resumen visible en la vista de lista para verificar que la grilla compacta priorice el panorama general y permita detectar más proyectos al mismo tiempo.',
      impact: 'La visualización compacta permite comparar más iniciativas de un vistazo desde teléfonos sin reducir la legibilidad de sus títulos principales.',
      authorLegislatorId: null,
      signatoryIds: [],
      glossaryTermIds: [],
      documents: [],
      sources: [],
      updates: [],
      positions: [],
      votingResults: [],
      featured: false,
      order: 99,
    } });
    const createdBody = await created.json();
    expect(created.ok(), JSON.stringify(createdBody)).toBeTruthy();
    const published = await request.post(`${apiBase}/v1/manage/projects/${createdBody.item.id}/publish`, { data: { notifyFollowers: false } });
    expect(published.ok(), await published.text()).toBeTruthy();
  }
  const regularSlug = `proyecto-sin-debate-${suffix}`;
  await createProject({ title, slug, publicDebate: true });
  await createProject({ title: `Proyecto sin debate ${suffix}`, slug: regularSlug, publicDebate: false });

  await page.goto('/?situacion=debate-publico#proyectos');
  await expect(page.locator(`.project-card[href="/proyectos/${slug}"]`)).toBeVisible();
  await expect(page.locator(`.project-card[href="/proyectos/${regularSlug}"]`)).toHaveCount(0);
  await page.goto('/#proyectos');
  const toggle = page.getByRole('group', { name: 'Vista de proyectos' });
  const grid = page.locator('.project-grid');
  const card = page.locator(`.project-card[href="/proyectos/${slug}"]`);

  if ((page.viewportSize()?.width || 1280) <= 620) {
    await expect(toggle).toBeVisible();
    const title = page.getByRole('heading', { name: 'Todos los proyectos.' });
    const [titleBounds, toggleBounds] = await Promise.all([title.boundingBox(), toggle.boundingBox()]);
    expect(titleBounds).not.toBeNull();
    expect(toggleBounds).not.toBeNull();
    expect(toggleBounds!.x).toBeGreaterThanOrEqual(titleBounds!.x + titleBounds!.width);
    await expect(card.locator('p')).toBeVisible();
    await toggle.getByRole('button', { name: 'Vista en grilla' }).click();
    await expect(grid).toHaveAttribute('data-mobile-view', 'grid');
    await expect(card.locator('p')).toBeHidden();
    expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)).toBe(2);

    await toggle.getByRole('button', { name: 'Vista en lista' }).click();
    await expect(grid).toHaveAttribute('data-mobile-view', 'list');
    await expect(card.locator('p')).toBeVisible();
    expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)).toBe(1);
    await grid.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 120));
    await expect.poll(() => page.evaluate(() => {
      const header = document.querySelector('.site-header')?.getBoundingClientRect();
      const viewToggle = document.querySelector('.project-view-toggle--sticky')?.getBoundingClientRect();
      if (!header || !viewToggle) return Number.POSITIVE_INFINITY;
      return Math.abs((header.top + header.height / 2) - (viewToggle.top + viewToggle.height / 2));
    })).toBeLessThanOrEqual(1);
  } else {
    await expect(toggle).toBeHidden();
    expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)).toBe(3);
    await expect(card.locator('p')).toBeVisible();
  }
});
