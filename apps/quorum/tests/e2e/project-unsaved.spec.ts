import { expect, test } from '@playwright/test';

test('sincroniza dos sesiones, combina conflictos de forma explícita y conserva la versión elegida', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/gestion');
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await expect.poll(() => page.locator('.project-editor-layout').evaluate((element) => element.hasAttribute('inert'))).toBe(false);
  const title = page.locator('#project-info').getByLabel('Título', { exact: true });
  await expect(title).toBeEnabled();
  const original = await title.inputValue();
  const second = await page.context().newPage();
  try {
    await second.goto('/gestion');
    await second.getByRole('button', { name: 'Proyectos', exact: true }).click();
    await expect.poll(() => second.locator('.project-editor-layout').evaluate((element) => element.hasAttribute('inert'))).toBe(false);
    const secondTitle = second.locator('#project-info').getByLabel('Título', { exact: true });
    await expect(secondTitle).toBeEnabled();

    const localValue = `${original} - sesión actual ${Date.now()}`;
    await title.fill(localValue);
    const remoteValue = `${original} - sesión remota ${Date.now()}`;
    await secondTitle.fill(remoteValue);
    const secondSave = second.locator('.project-editor-toolbar').getByRole('button', { name: 'Guardar', exact: true });
    await secondSave.click();
    await expect(secondSave).toBeDisabled();

    const firstSave = page.locator('.project-editor-toolbar').getByRole('button', { name: 'Guardar', exact: true });
    await page.bringToFront();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const conflict = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: 'Este proyecto cambió en otra sesión' }) });
    await expect(conflict).toBeVisible();
    await conflict.getByRole('button', { name: 'Conservar esta sesión' }).click();
    await expect(conflict).not.toBeVisible();
    await firstSave.click();
    await expect(firstSave).toBeDisabled();

    await second.reload();
    await second.getByRole('button', { name: 'Proyectos', exact: true }).click();
    await expect.poll(() => second.locator('.project-editor-layout').evaluate((element) => element.hasAttribute('inert'))).toBe(false);
    const refreshedTitle = second.locator('#project-info').getByLabel('Título', { exact: true });
    await expect(refreshedTitle).toHaveValue(localValue);
    await refreshedTitle.fill(original);
    const restore = second.locator('.project-editor-toolbar').getByRole('button', { name: 'Guardar', exact: true });
    await restore.click();
    await expect(restore).toBeDisabled();
  } finally {
    await second.close();
  }
});

test('recupera cambios locales al abrir otra sesión y mantiene copias independientes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/gestion');
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await expect.poll(() => page.locator('.project-editor-layout').evaluate((element) => element.hasAttribute('inert'))).toBe(false);
  const title = page.locator('#project-info').getByLabel('Título', { exact: true });
  const original = await title.inputValue();
  const draftTitle = `${original} - copia de recuperación ${Date.now()}`;
  await title.fill(draftTitle);

  const originalRecoveryKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('quorum:project-editor:v2:')));
  expect(originalRecoveryKeys).toHaveLength(1);

  const recoveredPage = await page.context().newPage();
  try {
    await recoveredPage.goto('/gestion');
    await recoveredPage.getByRole('button', { name: 'Proyectos', exact: true }).click();
    await expect.poll(() => recoveredPage.locator('.project-editor-layout').evaluate((element) => element.hasAttribute('inert'))).toBe(false);
    const recoveredTitle = recoveredPage.locator('#project-info').getByLabel('Título', { exact: true });
    await expect(recoveredPage.getByRole('status').filter({ hasText: 'Recuperamos cambios locales' })).toBeVisible();
    await expect(recoveredTitle).toHaveValue(draftTitle);
    await expect.poll(() => recoveredPage.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('quorum:project-editor:v2:')).length)).toBeGreaterThanOrEqual(2);
    await expect.poll(() => recoveredPage.evaluate((key) => localStorage.getItem(key) !== null, originalRecoveryKeys[0])).toBe(true);

    const save = recoveredPage.locator('.project-editor-toolbar').getByRole('button', { name: 'Guardar', exact: true });
    await save.click();
    await expect(save).toBeDisabled();

    // Leave the shared test store in its original state.
    await recoveredTitle.fill(original);
    await save.click();
    await expect(save).toBeDisabled();
  } finally {
    await recoveredPage.close();
  }
});

test('protege todos los destinos, permite revertir y confirma el guardado completo antes de salir', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.goto('/gestion');
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
  const title = page.locator('#project-info').getByLabel('Título', { exact: true });
  const original = await title.inputValue();
  const modal = page.getByRole('dialog', { name: '¿Querés salir de este proyecto?' });
  const nav = page.locator('.management-nav');
  // A change and its exact undo do not leave a sticky dirty flag.
  await title.fill(original + ' temporal');
  await title.fill(original);
  await nav.getByRole('button', { name: 'Tablero', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await nav.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await title.fill(original + ' revisado');
  for (const leave of [
    () => page.locator('.admin-list > button').nth(2).click(),
    () => page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click(),
    () => nav.getByRole('button', { name: 'Glosario', exact: true }).click(),
    () => nav.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(),
  ]) {
    await leave(); await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(title).toHaveValue(original + ' revisado');
  }
  await page.evaluate(() => history.back());
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(title).toHaveValue(original + ' revisado');
  // Failed or incomplete acknowledgements must not allow navigation.
  await page.route('**/v1/manage/projects/*', async route => {
    if (route.request().method() === 'PATCH') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Fallo de prueba' } }) });
    else await route.continue();
  });
  await nav.getByRole('button', { name: 'Tablero', exact: true }).click();
  await modal.getByRole('button', { name: 'Guardar y cambiar' }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(title).toHaveValue(original + ' revisado');
  await page.unroute('**/v1/manage/projects/*');
  await modal.getByRole('button', { name: 'Guardar y cambiar' }).click();
  await expect(modal).not.toBeVisible();
  await nav.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await expect(title).toHaveValue(original + ' revisado');
  // A nested field, a boolean, and preparation state survive a save/reload.
  await page.locator('#project-info').getByLabel('Estado inicial del proyecto').selectOption('en-preparacion');
  const glossaryToggle = page.locator('#project-glossary .project-glossary-settings').getByLabel('Mostrar glosario contextual en este proyecto');
  await page.locator('#project-glossary .project-glossary-settings summary').click();
  const glossaryEnabled = !(await glossaryToggle.isChecked());
  await glossaryToggle.setChecked(glossaryEnabled);
  await page.locator('#project-sources').getByRole('button', { name: /Agregar/ }).click();
  const addedSource = page.locator('#project-sources .nested-row').last();
  const sourceLabel = `Fuente E2E ${Date.now()}`;
  await addedSource.getByLabel('Nombre').fill(sourceLabel);
  await addedSource.getByLabel('URL').fill('https://example.com/borrador');
  await nav.getByRole('button', { name: 'Tablero', exact: true }).click();
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Guardar y cambiar' }).click();
  await expect(modal).not.toBeVisible();
  await page.reload();
  await nav.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await expect(page.locator('#project-info').getByLabel('Estado inicial del proyecto')).toHaveValue('en-preparacion');
  const reloadedGlossaryToggle = page.locator('#project-glossary .project-glossary-settings').getByLabel('Mostrar glosario contextual en este proyecto');
  await page.locator('#project-glossary .project-glossary-settings summary').click();
  await expect(reloadedGlossaryToggle).toBeChecked({ checked: glossaryEnabled });
  await expect(page.locator('#project-sources .nested-row').last().getByLabel('Nombre')).toHaveValue(sourceLabel);
  // Unincorporated PDF fields are also protected, and cannot be silently "saved".
  await page.locator('.pdf-upload input[name=title]').fill('Documento pendiente');
  await nav.getByRole('button', { name: 'Tablero', exact: true }).click();
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Guardar y cambiar' }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await modal.getByRole('button', { name: 'Descartar y cambiar' }).click();
  await expect(modal).not.toBeVisible();
  await nav.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await expect.poll(() => page.locator('.project-editor-layout').evaluate((element) => element.hasAttribute('inert'))).toBe(false);
  await page.locator('#project-sources').getByRole('button', { name: 'Agregar fuente' }).click();
  await page.locator('.project-editor-toolbar').getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Revisá estos campos antes de guardar:' })).toContainText(/Fuentes · n.º \d+ · Nombre/);
  await page.locator('#project-sources .nested-row').last().getByRole('button', { name: 'Quitar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Revisá estos campos antes de guardar:' })).not.toBeVisible();
});
