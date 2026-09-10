import { expect, test } from '@playwright/test';

const apiBase = `http://localhost:${process.env.QUORUM_E2E_API_PORT || 8890}`;
const photoUrl = 'https://example.com/portrait.png';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=', 'base64');

test.beforeEach(async ({ page }) => {
  await page.route('https://example.com/**', (route) => route.fulfill({ contentType: 'image/png', body: png }));
});

test('foto de declaración persiste, se bloquea y sólo se elimina con confirmación', async ({ page, request }, info) => {
  const title = `Prueba fotos ${info.project.name}`;
  const row = { id: 'voice', name: 'Persona de prueba', stance: 'for', role: 'Diputada', quote: 'Declaración de prueba.', sourceLabel: '', sourceUrl: '', date: null };
  const response = await request.post(`${apiBase}/v1/manage/projects`, { data: {
    title, slug: `fotos-${info.project.name}`, workflowId: 'legislativo-nacional-v1', workflowVersion: 1, currentStageId: 'mesa-de-entrada', positions: [row],
  } });
  expect(response.ok()).toBeTruthy();
  const project = (await response.json()).item;
  await page.goto('/gestion');
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await page.locator('.admin-list > button:not(.button)').filter({ hasText: title }).click();
  const section = page.locator('#project-positions');
  const name = section.getByLabel('Nombre', { exact: true });
  await expect(name).toBeDisabled();
  await section.getByRole('button', { name: 'Editar declaración de Persona de prueba' }).click();
  await expect(name).toBeEnabled();
  await section.getByLabel('URL de la foto').fill(photoUrl);
  await section.getByRole('button', { name: 'Guardar declaración', exact: true }).click();
  await expect(name).toBeDisabled();
  await expect(section.locator('.person-photo img')).toHaveAttribute('src', photoUrl);
  await expect(section.getByLabel('O subir una imagen')).toBeDisabled();
  await expect(section.getByRole('button', { name: 'Quitar foto' })).toBeDisabled();
  await section.screenshot({ path: info.outputPath('locked-declaration.png') });
  const stored = (await (await request.get(`${apiBase}/v1/manage/bootstrap`)).json()).projects.find((item: { id: string }) => item.id === project.id);
  expect(stored.positions[0].photoUrl).toBe(photoUrl);
  await section.getByRole('button', { name: 'Eliminar declaración' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Quitar esta declaración?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(name).toBeVisible();
  await section.getByRole('button', { name: 'Eliminar declaración' }).click();
  await dialog.getByRole('button', { name: 'Sí, quitar declaración' }).click();
  await expect(name).toHaveCount(0);
  await section.getByRole('button', { name: 'Deshacer' }).click();
  await expect(name).toBeDisabled();
});

test('perfil guarda foto por URL y por subida; un error conserva la foto anterior', async ({ page, request }, info) => {
  const fullName = `Perfil fotos ${info.project.name}`;
  const created = await request.post(`${apiBase}/v1/manage/legislators`, { data: { fullName, slug: `perfil-fotos-${info.project.name}`, office: 'senador' } });
  expect(created.ok()).toBeTruthy();
  const id = (await created.json()).item.id;
  await page.goto('/gestion');
  await page.getByRole('button', { name: 'Legisladores', exact: true }).click();
  await page.locator('.profiles-panel').getByLabel('Buscar').fill(fullName);
  await page.getByRole('button', { name: `Editar perfil de ${fullName}` }).click();
  const editor = page.locator('.legislator-profile-editor');
  const url = editor.getByLabel('URL de la foto');
  const save = editor.getByRole('button', { name: 'Guardar cambios', exact: true });
  await url.fill(photoUrl);
  await save.click();
  await expect(save).toBeDisabled();
  // Storage is mocked here; API persistence still uses the isolated test backend.
  await page.route('**/v1/manage/media/images', (route) => route.fulfill({ status: 500, json: { error: { message: 'Subida no disponible' } } }));
  await editor.getByLabel('O subir una imagen').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: png });
  await expect(editor.getByRole('alert')).toContainText('Subida no disponible');
  await expect(url).toHaveValue(photoUrl);
  await page.unroute('**/v1/manage/media/images');
  const uploaded = 'https://example.com/uploaded.png';
  await page.route('**/v1/manage/media/images', (route) => route.fulfill({ json: { item: { url: uploaded } } }));
  await editor.getByLabel('O subir una imagen').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: png });
  await expect(url).toHaveValue(uploaded);
  await save.click();
  await expect(save).toBeDisabled();
  const stored = (await (await request.get(`${apiBase}/v1/manage/bootstrap`)).json()).legislators.find((item: { id: string }) => item.id === id);
  expect(stored.photoUrl).toBe(uploaded);
});
