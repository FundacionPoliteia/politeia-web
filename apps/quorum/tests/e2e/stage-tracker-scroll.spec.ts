import { expect, test } from '@playwright/test';

test('en mobile la ficha abre la cronología de etapas sobre el estado vigente', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'El desplazamiento inicial sólo se aplica en mobile.');

  const apiBase = `http://localhost:${process.env.QUORUM_E2E_API_PORT || 8890}`;
  const marker = `${testInfo.project.name}-${Date.now()}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const slug = `cronologia-actual-${marker}`;
  const created = await request.post(`${apiBase}/v1/manage/projects`, { data: {
    title: `Cronología actual ${marker}`,
    slug,
    workflowId: 'legislativo-nacional-v1',
    workflowVersion: 1,
    currentStageId: 'media-sancion',
    docketNumber: `CR-${marker}`,
    entryDate: '2026-10-08',
    originChamberId: 'diputados',
    initiativeTypeId: 'poder-legislativo',
    summary: 'Proyecto de prueba para verificar la posición inicial de la cronología de etapas.',
    impact: 'Permite verificar que el nodo vigente se muestre al ingresar desde un teléfono.',
    authorLegislatorId: null,
    signatoryIds: [],
    glossaryTermIds: [],
    documents: [],
    sources: [],
    updates: [],
    featured: false,
    order: 99,
  } });
  const createdBody = await created.json();
  expect(created.ok(), JSON.stringify(createdBody)).toBeTruthy();

  const published = await request.post(`${apiBase}/v1/manage/projects/${createdBody.item.id}/publish`, { data: { notifyFollowers: false } });
  expect(published.ok(), await published.text()).toBeTruthy();

  await page.goto(`/proyectos/${slug}`);
  const tracker = page.locator('.tracker-scroll');
  await expect(tracker).toBeVisible();

  await expect.poll(async () => tracker.evaluate((element) => (element as HTMLElement).scrollLeft)).toBeGreaterThan(0);
  const position = await tracker.evaluate((element) => {
    const trackerElement = element as HTMLElement;
    const current = trackerElement.querySelector('.track-stage.current') as HTMLElement;
    const trackerBounds = trackerElement.getBoundingClientRect();
    const currentBounds = current.getBoundingClientRect();
    return {
      maxScrollLeft: trackerElement.scrollWidth - trackerElement.clientWidth,
      scrollLeft: trackerElement.scrollLeft,
      currentCenter: currentBounds.left + currentBounds.width / 2,
      viewportCenter: trackerBounds.left + trackerElement.clientWidth / 2,
    };
  });

  expect(position.maxScrollLeft).toBeGreaterThan(0);
  expect(position.scrollLeft).toBeLessThan(position.maxScrollLeft);
  expect(Math.abs(position.currentCenter - position.viewportCenter)).toBeLessThanOrEqual(2);
});
