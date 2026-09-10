import { expect, test } from '@playwright/test';

test('publicación compara campos y secciones, conserva historial y exige revisar cambios concurrentes', async ({ page, request }, info) => {
  const api = `http://localhost:${process.env.QUORUM_E2E_API_PORT || 8890}`;
  const title = `Proyecto comparación ${info.project.name}`;
  const first = { id: 'one', name: 'Anaa', stance: 'for', quote: 'Esta es la primera declaración.' };
  const created = await request.post(api + '/v1/manage/projects', { data: {
    title, slug: `comparacion-${info.project.name}`, workflowId: 'legislativo-nacional-v1', workflowVersion: 1, currentStageId: 'mesa-de-entrada',
    docketNumber: '1234-D-2026', entryDate: '2026-09-10', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
    summary: 'Resumen suficientemente descriptivo para el proyecto legislativo de prueba.',
    impact: 'Impacto suficientemente descriptivo para la ciudadanía y el proyecto.', positions: [first],
  } });
  expect(created.ok()).toBeTruthy();
  const project = (await created.json()).item;
  const path = api + '/v1/manage/projects/' + project.id;
  expect((await request.post(path + '/publish', { data: {} })).ok()).toBeTruthy();
  expect((await request.patch(path, { data: {
    positions: [{ ...first, name: 'Ana' }, { ...first, id: 'two', name: 'Beto' }, { ...first, id: 'three', name: 'Carla', stance: 'against' }],
    votingResults: [{ id: 'vote', chamber: 'deputies', date: '2026-09-10', subject: 'Votación en general', type: 'general', method: 'aggregate', outcome: 'approved', counts: { yes: 140, no: 100, abstention: 0, absent: 17, notVoting: 0 }, sourceUrl: '', notes: '', blocks: [], nominal: [] }],
  } })).ok()).toBeTruthy();
  await page.goto('/gestion');
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await page.locator('.admin-list > button:not(.button)').filter({ hasText: title }).click();
  await page.getByRole('button', { name: 'Publicar revisión', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Publicar ${title}` });
  await expect(dialog.getByText('Cambios respecto de lo publicado')).toBeVisible();
  await expect(dialog.getByText('Resultado de votaciones', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel(/Notificar a seguidores/)).toHaveCount(0);
  const positions = dialog.locator('details').filter({ hasText: 'A favor / En contra' });
  await positions.locator('summary').click();
  await expect(positions).toContainText('Declaraciones · Ana · Nombre');
  await expect(positions.locator('pre').getByText('Anaa', { exact: true })).toBeVisible();
  await expect(positions.locator('pre').getByText('Ana', { exact: true })).toBeVisible();
  await expect(positions).toContainText('Beto');
  await expect(positions).toContainText('Carla');
  await page.screenshot({ path: info.outputPath('publication-comparison.png') });
  await dialog.getByRole('button', { name: 'Revisar publicación' }).click();
  expect((await request.patch(path, { data: { impact: 'Otro editor actualizó este impacto mientras se revisaba la publicación.' } })).ok()).toBeTruthy();
  await dialog.getByRole('button', { name: 'Sí, publicar revisión' }).click();
  await expect(dialog.getByRole('alert')).toContainText('cambió después de revisar');
  await dialog.getByRole('button', { name: 'Actualizar comparación' }).click();
  await expect(dialog.getByText('¿Cómo me afecta?', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Revisar publicación' }).click();
  await dialog.getByRole('button', { name: 'Sí, publicar revisión' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  const history = page.locator('.history-list article').filter({ hasText: title }).filter({ hasText: 'Revisión 2' });
  await expect(history).toContainText('Secciones modificadas: ¿Cómo me afecta? · Resultado de votaciones · A favor / En contra');
  const review = await request.get(path + '/publication-review');
  expect((await review.json()).report.fields).toEqual([]);
});
