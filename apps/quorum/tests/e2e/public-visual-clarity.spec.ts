import { expect, test } from '@playwright/test';

test('la ficha conserva legibles votos y declaraciones en desktop y mobile', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const apiBase = 'http://localhost:' + (process.env.QUORUM_E2E_API_PORT || 8890);
  const marker = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const quote254 = 'a'.repeat(254);
  const quote255 = 'b'.repeat(255);

  async function createPublishedProject(options: {
    key: string;
    initialStage: string;
    nextStage?: string;
    includeDetail?: boolean;
  }) {
    const slug = 'claridad-visual-' + options.key + '-' + marker;
    const title = 'Proyecto claridad ' + options.key + ' ' + marker;
    const created = await request.post(apiBase + '/v1/manage/projects', { data: {
      title, slug, workflowId: 'legislativo-nacional-v1', workflowVersion: 1, currentStageId: options.initialStage,
      docketNumber: 'CV-' + options.key + '-' + marker, entryDate: '2026-09-01', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
      summary: 'Resumen de prueba suficientemente completo para publicar este proyecto de verificación visual.',
      impact: 'Impacto de prueba suficientemente completo para publicar este proyecto de verificación visual.',
      authorLegislatorId: null, signatoryIds: [], glossaryTermIds: [], documents: [], sources: [],
      updates: options.nextStage ? [{ id: 'cambio-' + options.key, date: '2026-09-20', title: 'Cambio de etapa', body: 'El proyecto cambió de etapa para probar el indicador.', stageId: options.nextStage, sources: [] }] : [],
      positions: options.includeDetail ? [
        { id: 'quote-254', stance: 'for', name: 'Declaración límite 254', role: '', quote: quote254, sourceLabel: '', sourceUrl: '', date: null },
        { id: 'quote-255', stance: 'against', name: 'Declaración límite 255', role: '', quote: quote255, sourceLabel: '', sourceUrl: '', date: null },
      ] : [],
      votingResults: options.includeDetail ? [{
        id: 'vote-' + marker, chamber: 'deputies', date: '2026-09-14', subject: 'Prueba de legibilidad de recuentos', type: 'general', method: 'aggregate', outcome: 'approved',
        counts: { yes: 130, no: 0, abstention: 1000, absent: 0, notVoting: 0 }, sourceUrl: '', notes: '', blocks: [], nominal: [],
      }] : [],
      featured: false, order: 99,
    } });
    const createdBody = await created.json();
    expect(created.ok(), JSON.stringify(createdBody)).toBeTruthy();
    const published = await request.post(apiBase + '/v1/manage/projects/' + createdBody.item.id + '/publish', { data: { notifyFollowers: false } });
    expect(published.ok(), await published.text()).toBeTruthy();
    return { slug, title };
  }

  const backward = await createPublishedProject({ key: 'retroceso', initialStage: 'comisiones', nextStage: 'mesa-de-entrada', includeDetail: true });
  await page.goto('/proyectos/' + backward.slug);
  const shortDeclaration = page.locator('article[class*="statement"]').filter({ hasText: 'Declaración límite 254' });
  await expect(shortDeclaration.locator('details')).toHaveCount(0);
  await expect(shortDeclaration.locator('blockquote')).toHaveText(quote254);

  const longDeclaration = page.locator('article[class*="statement"]').filter({ hasText: 'Declaración límite 255' });
  const declarationDetails = longDeclaration.locator('details');
  await expect(declarationDetails).toHaveCount(1);
  await expect(declarationDetails.locator('summary')).toContainText('Leer declaración completa');
  await expect(declarationDetails.locator('blockquote')).toBeHidden();
  await declarationDetails.locator('summary').evaluate((element) => (element as HTMLElement).click());
  await expect(declarationDetails.locator('summary')).toContainText('Cerrar declaración');
  await expect(declarationDetails.locator('blockquote')).toBeVisible();
  await expect(declarationDetails.locator('blockquote')).toHaveText(quote255);
  await declarationDetails.locator('summary').evaluate((element) => (element as HTMLElement).click());
  await expect(declarationDetails.locator('blockquote')).toBeHidden();

  const chart = page.locator('.vote-chart').first();
  for (const [rowClass, expected] of [['vote-yes', '130'], ['vote-no', '0'], ['vote-abstention', '1000']]) {
    const row = chart.locator('.' + rowClass);
    const count = row.locator('strong');
    await expect(count).toHaveText(expected);
    const layout = await row.evaluate((element) => {
      const track = element.querySelector('.vote-track')!.getBoundingClientRect();
      const value = element.querySelector('strong')!;
      const bounds = value.getBoundingClientRect();
      return { whiteSpace: getComputedStyle(value).whiteSpace, gap: bounds.left - track.right, height: bounds.height, lineHeight: parseFloat(getComputedStyle(value).lineHeight) };
    });
    expect(layout.whiteSpace).toBe('nowrap');
    expect(layout.gap).toBeGreaterThanOrEqual(0);
    expect(layout.height).toBeLessThanOrEqual(layout.lineHeight + 1);
  }
});
