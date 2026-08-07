import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('la portada es modular, accesible y no publica borradores', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Entendé qué se debate');
  await expect(page.locator('.kinetic-advance')).toHaveText('avanza.');
  await expect(page.locator('.kinetic-advance-canvas')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByText('El contenido público está en preparación')).toBeVisible();
  const footer = page.locator('.site-footer');
  const quorumFooterNavigation = footer.getByRole('navigation', { name: 'Secciones de Quórum' });
  await expect(quorumFooterNavigation).toBeVisible();
  await expect(quorumFooterNavigation.getByRole('link', { name: 'Proyectos', exact: true })).toBeVisible();
  await expect(quorumFooterNavigation.getByRole('link', { name: 'Glosario' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Sumate' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact || ''))).toEqual([]);
});

test('los filtros de proyectos se despliegan en mobile y permanecen visibles en desktop', async ({ page }) => {
  await page.goto('/#proyectos');
  const toggle = page.getByRole('button', { name: /Filtros/ });
  const filters = page.locator('#project-filters');
  if ((page.viewportSize()?.width || 1280) <= 620) {
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filters).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(filters).toBeVisible();
    await toggle.click();
    await expect(filters).toBeHidden();
  } else {
    await expect(toggle).toBeHidden();
    await expect(filters).toBeVisible();
  }
});

test('el glosario contextual abre la definición completa en un modal scrolleable', async ({ page, request }, testInfo) => {
  const apiBase = `http://localhost:${process.env.QUORUM_E2E_API_PORT || 8890}`;
  const marker = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const slug = `modal-glosario-${marker}`;
  const term = `Debate federal ${marker}`;
  const definition = Array.from({ length: 70 }, (_, index) => `Párrafo ${index + 1}: explicación completa y trazable del término legislativo.`).join('\n\n');
  const createdTerm = await request.post(`${apiBase}/v1/manage/glossary`, { data: {
    term, slug: `termino-${marker}`, shortDefinition: 'Definición breve para la exploración contextual.', definition,
    aliases: [], inlineEnabled: true, published: true,
    references: [{ id: `reference-${marker}`, label: 'Referencia oficial', url: 'https://example.com/referencia', publishedAt: null }],
  } });
  const createdTermBody = await createdTerm.json();
  expect(createdTerm.ok(), JSON.stringify(createdTermBody)).toBeTruthy();
  const legislatorName = `Alejandra Modal ${marker}`;
  const createdLegislator = await request.post(`${apiBase}/v1/manage/legislators`, { data: {
    fullName: legislatorName, slug: `alejandra-modal-${marker}`, party: 'Partido de Prueba', bloc: 'Bloque Federal', district: 'Córdoba', office: 'diputado',
    mandateStart: null, mandateEnd: null, academicTitle: '', bio: '', attendance: null, published: false,
  } });
  const createdLegislatorBody = await createdLegislator.json();
  expect(createdLegislator.ok(), JSON.stringify(createdLegislatorBody)).toBeTruthy();
  const signatoryIds: string[] = [];
  for (let index = 1; index <= 8; index += 1) {
    const response = await request.post(`${apiBase}/v1/manage/legislators`, { data: {
      fullName: `Firmante ${index} ${marker}`, slug: `firmante-${index}-${marker}`, party: `Partido ${index}`, bloc: index % 2 ? 'Bloque Federal' : 'Bloque Democrático', district: index % 2 ? 'Córdoba' : 'Santa Fe', office: 'diputado',
      mandateStart: null, mandateEnd: null, academicTitle: '', bio: '', attendance: null, published: false,
    } });
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBeTruthy();
    signatoryIds.push(body.item.id);
  }
  const createdProject = await request.post(`${apiBase}/v1/manage/projects`, { data: {
    title: `Proyecto modal ${marker}`, slug, workflowId: 'legislativo-nacional-v1', workflowVersion: 1, currentStageId: 'mesa-de-entrada',
    docketNumber: `9000-${marker}`, entryDate: '2026-08-06', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
    summary: `Este proyecto analiza el ${term} dentro del Congreso argentino.`, impact: 'La ciudadanía podrá comprender el alcance de la propuesta mediante información pública completa.',
    authorLegislatorId: createdLegislatorBody.item.id, signatoryIds, glossaryTermIds: [], documents: [], sources: [], updates: [], featured: false, order: 99,
  } });
  const createdProjectBody = await createdProject.json();
  expect(createdProject.ok(), JSON.stringify(createdProjectBody)).toBeTruthy();
  const projectId = createdProjectBody.item.id;
  const published = await request.post(`${apiBase}/v1/manage/projects/${projectId}/publish`, { data: { notifyFollowers: false } });
  expect(published.ok(), await published.text()).toBeTruthy();

  await page.goto(`/proyectos/${slug}`);
  const trigger = page.getByRole('button', { name: term });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const modal = page.getByRole('dialog', { name: term });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(definition.slice(0, 80));
  await expect(modal.getByRole('link', { name: 'Referencia oficial' })).toBeVisible();
  expect(await modal.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const results = await new AxeBuilder({ page }).include('.glossary-modal').analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact || ''))).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(trigger).toBeFocused();

  const legislatorTrigger = page.locator('.author-card');
  await expect(legislatorTrigger).toContainText(legislatorName);
  await legislatorTrigger.click();
  const legislatorModal = page.getByRole('dialog', { name: legislatorName });
  await expect(legislatorModal).toBeVisible();
  await expect(legislatorModal).toContainText('Diputado/a');
  await expect(legislatorModal).toContainText('Córdoba');
  await expect(legislatorModal).toContainText('Partido de Prueba');
  await expect(legislatorModal).toContainText('Bloque Federal');
  await expect(legislatorModal).toContainText('Perfil ampliado en preparación');
  const legislatorAxe = await new AxeBuilder({ page }).include('.legislator-modal').analyze();
  expect(legislatorAxe.violations.filter((item) => ['critical', 'serious'].includes(item.impact || ''))).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(legislatorModal).toBeHidden();
  await expect(legislatorTrigger).toBeFocused();

  const signatories = page.locator('.project-people-group').filter({ hasText: 'Firmantes' });
  await expect(signatories.locator('.person-chip')).toHaveCount(6);
  const showAllSignatories = signatories.getByRole('button', { name: 'Ver los 8 firmantes' });
  await showAllSignatories.click();
  const signatoriesModal = page.getByRole('dialog', { name: 'Todos los firmantes' });
  await expect(signatoriesModal).toBeVisible();
  await expect(signatoriesModal.locator('.person-chip')).toHaveCount(8);
  await signatoriesModal.getByLabel('Buscar dentro de los firmantes').fill(`Firmante 8 ${marker}`);
  await expect(signatoriesModal.locator('.person-chip')).toHaveCount(1);
  await expect(signatoriesModal).toContainText(`Firmante 8 ${marker}`);
  await page.keyboard.press('Escape');
  await expect(signatoriesModal).toBeHidden();
  await expect(showAllSignatories).toBeFocused();

  await page.goto('/gestion');
  await page.getByRole('button', { name: 'Glosario' }).click();
  let glossaryListPanel = page.locator('.glossary-admin > .admin-panel').first();
  await glossaryListPanel.getByLabel('Buscar').fill(term);
  const editTerm = glossaryListPanel.getByRole('button', { name: `Editar término ${term}` });
  await expect(editTerm).toHaveText('Editar');
  await editTerm.click();
  await expect(editTerm).toHaveText('Editando');
  const glossaryEditor = page.locator('.glossary-admin > .editor-form');
  await expect(glossaryEditor.getByRole('heading', { name: `Editar ${term}` })).toBeVisible();
  await expect(glossaryEditor.getByLabel('Término', { exact: true })).toHaveValue(term);
  const updatedShortDefinition = `Definición editada y persistida ${marker}.`;
  const updatedDefinition = `Desarrollo editorial ${marker} con formato avanzado y trazabilidad.`;
  await glossaryEditor.getByLabel(/Definición breve/).fill(updatedShortDefinition);
  await glossaryEditor.getByLabel('Editor de contenido avanzado').fill(updatedDefinition);
  await expect(glossaryEditor.getByRole('button', { name: 'Subir imagen interna' })).toBeVisible();
  await expect(glossaryEditor.getByRole('button', { name: 'Herramientas de tabla' })).toBeVisible();
  const saveTerm = glossaryEditor.getByRole('button', { name: 'Guardar término' });
  await expect(saveTerm).toBeEnabled();
  await saveTerm.click();
  await expect(glossaryEditor.getByRole('status')).toHaveText('Término actualizado y guardado correctamente.');
  await expect(saveTerm).toBeDisabled();

  const bootstrap = await request.get(`${apiBase}/v1/manage/bootstrap`);
  const storedTerm = (await bootstrap.json()).glossary.find((item: { id: string }) => item.id === createdTermBody.item.id);
  expect(storedTerm.shortDefinition).toBe(updatedShortDefinition);
  expect(storedTerm).toMatchObject({ definition: updatedDefinition, definitionFormat: 'markdown' });

  await page.reload();
  await page.getByRole('button', { name: 'Glosario' }).click();
  glossaryListPanel = page.locator('.glossary-admin > .admin-panel').first();
  await glossaryListPanel.getByLabel('Buscar').fill(term);
  await glossaryListPanel.getByRole('button', { name: `Editar término ${term}` }).click();
  await expect(page.locator('.glossary-admin > .editor-form').getByLabel(/Definición breve/)).toHaveValue(updatedShortDefinition);
  await expect(page.locator('.glossary-admin > .editor-form').getByLabel('Editor de contenido avanzado')).toContainText('Desarrollo editorial');
});

test('el gestor local muestra los borradores iniciales y sus módulos', async ({ page }) => {
  await page.goto('/gestion');
  await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible();
  await page.getByRole('button', { name: 'Proyectos' }).click();
  expect(await page.locator('.admin-list > button:not(.button)').count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByRole('button', { name: 'Previsualizar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar revisión' })).toBeVisible();

  const globalSave = page.getByRole('button', { name: 'Guardar', exact: true });
  const title = page.locator('.editor-form input').first();
  const originalTitle = await title.inputValue();
  await expect(globalSave).toBeDisabled();
  await title.fill(`${originalTitle} editado`);
  await expect(globalSave).toBeEnabled();
  await title.fill(originalTitle);
  await expect(globalSave).toBeDisabled();

  const chronologySave = page.getByRole('button', { name: 'Guardar cronología' });
  await expect(chronologySave).toBeDisabled();
  const summary = page.getByLabel('Resumen en lenguaje claro');
  const originalSummary = await summary.inputValue();
  const pendingSummary = 'Contenido manual pendiente que no puede perderse al guardar la cronología.';
  await summary.fill(pendingSummary);
  await expect(globalSave).toBeEnabled();
  await page.getByRole('button', { name: 'Agregar actualización' }).click();
  const update = page.locator('.chronology-card').last();
  await update.getByRole('button', { name: 'Quitar' }).click();
  await expect(page.getByRole('heading', { name: '¿Quitar esta actualización?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(update).toBeVisible();
  await update.locator('input').nth(1).fill('Novedad editorial');
  await update.locator('textarea').fill('Explicación pública de la actualización legislativa.');
  await expect(chronologySave).toBeEnabled();
  await chronologySave.click();
  await expect(chronologySave).toBeDisabled();
  await expect(summary).toHaveValue(pendingSummary);
  await expect(globalSave).toBeEnabled();
  await expect(page.getByText('Cronología guardada en el borrador.')).toBeVisible();
  await summary.fill(originalSummary);
  await expect(globalSave).toBeDisabled();

  await title.fill(`${originalTitle} con cambios pendientes`);
  const projects = page.locator('.admin-list > button:not(.button)');
  await projects.nth(1).click();
  await expect(page.getByRole('heading', { name: '¿Querés salir de este proyecto?' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(title).toHaveValue(`${originalTitle} con cambios pendientes`);

  await projects.nth(1).click();
  await page.getByRole('button', { name: 'Descartar y cambiar' }).click();
  await expect(projects.nth(1)).toHaveClass(/selected/);
  await projects.nth(0).click();
  await expect(page.locator('.editor-form input').first()).toHaveValue(originalTitle);
});

test('publicar ofrece guardar primero y conserva los cambios antes de continuar', async ({ page, request }, testInfo) => {
  const apiBase = `http://localhost:${process.env.QUORUM_E2E_API_PORT || 8890}`;
  const marker = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const title = `Proyecto para guardar y publicar ${marker}`;
  const created = await request.post(`${apiBase}/v1/manage/projects`, { data: {
    title, slug: `guardar-y-publicar-${marker}`, workflowId: 'legislativo-nacional-v1', workflowVersion: 1, currentStageId: 'mesa-de-entrada',
    docketNumber: `8000-${marker}`, entryDate: '2026-08-06', originChamberId: 'diputados', initiativeTypeId: 'poder-legislativo',
    summary: 'Resumen inicial completo para comprobar el flujo editorial.', impact: 'Impacto inicial suficientemente descriptivo para habilitar la publicación.',
    authorLegislatorId: null, signatoryIds: [], glossaryTermIds: [], documents: [], sources: [], updates: [], featured: false, order: 101,
  } });
  const createdBody = await created.json();
  expect(created.ok(), JSON.stringify(createdBody)).toBeTruthy();

  await page.goto('/gestion');
  await page.getByRole('button', { name: 'Proyectos' }).click();
  await page.locator('.admin-list > button:not(.button)').filter({ hasText: title }).click();
  const editor = page.locator('.editor-form');
  const summary = editor.getByLabel('Resumen en lenguaje claro');
  const updatedSummary = `Resumen modificado ${marker} que debe guardarse antes de abrir la publicación.`;
  await summary.fill(updatedSummary);
  const summaryField = editor.locator('.advanced-editor-field').filter({ hasText: 'Resumen en lenguaje claro' });
  await summaryField.getByRole('button', { name: 'Modo avanzado' }).click();
  const advancedSummary = summaryField.getByLabel('Resumen en lenguaje claro');
  await expect(advancedSummary).toContainText(updatedSummary);
  await expect(summaryField.getByRole('button', { name: 'Subir imagen interna' })).toBeVisible();
  await expect(summaryField.getByRole('button', { name: 'Herramientas de tabla' })).toBeVisible();
  await editor.getByRole('button', { name: 'Previsualizar' }).click();
  const preview = page.getByRole('dialog', { name: 'Así se verá la ficha pública' });
  await expect(preview).toBeVisible();
  await expect(preview.locator('.site-header')).toBeVisible();
  await expect(preview.locator('.detail-hero').getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(preview.locator('.content-block').filter({ hasText: 'Resumen del proyecto' })).toContainText(updatedSummary);
  await expect(preview.locator('.tracker')).toBeVisible();
  await expect(preview.locator('.sidebar-card')).toBeVisible();
  await expect(preview.locator('.site-footer')).toBeVisible();
  await preview.getByRole('button', { name: 'Cerrar vista previa' }).click();
  await expect(preview).toBeHidden();
  await expect(advancedSummary).toContainText(updatedSummary);
  const publishButton = editor.getByRole('button', { name: 'Publicar revisión' });
  await expect(publishButton).toBeEnabled();
  await publishButton.click();
  let saveGate = page.getByRole('alertdialog', { name: '¿Guardar y preparar la publicación?' });
  await expect(saveGate).toBeVisible();
  await saveGate.getByRole('button', { name: 'Cancelar' }).click();
  await expect(saveGate).toBeHidden();
  await expect(advancedSummary).toContainText(updatedSummary);

  await publishButton.click();
  saveGate = page.getByRole('alertdialog', { name: '¿Guardar y preparar la publicación?' });
  await saveGate.getByRole('button', { name: 'Guardar y publicar' }).click();
  const publishDialog = page.getByRole('dialog', { name: `Publicar ${title}` });
  await expect(publishDialog).toBeVisible();
  const bootstrap = await request.get(`${apiBase}/v1/manage/bootstrap`);
  const stored = (await bootstrap.json()).projects.find((item: { id: string }) => item.id === createdBody.item.id);
  expect(stored).toMatchObject({ summary: updatedSummary, summaryFormat: 'markdown' });
  await publishDialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(editor.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
});

test('los perfiles guardados pueden editar, agregar y quitar datos', async ({ page, request }, testInfo) => {
  const apiBase = `http://localhost:${process.env.QUORUM_E2E_API_PORT || 8890}`;
  const marker = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const fullName = `Perfil editable ${marker}`;
  const created = await request.post(`${apiBase}/v1/manage/legislators`, { data: {
    fullName, slug: `perfil-editable-${marker}`, party: 'Partido a quitar', bloc: 'Bloque Inicial', district: 'Córdoba', office: 'diputado',
    mandateStart: null, mandateEnd: null, academicTitle: '', bio: 'Biografía inicial.', attendance: null, published: false,
  } });
  const createdBody = await created.json();
  expect(created.ok(), JSON.stringify(createdBody)).toBeTruthy();

  await page.goto('/gestion');
  await page.getByRole('button', { name: 'Legisladores' }).click();
  const profiles = page.locator('.profiles-panel');
  await profiles.getByLabel('Buscar').fill(fullName);
  const edit = profiles.getByRole('button', { name: `Editar perfil de ${fullName}` });
  await expect(edit).toBeVisible();
  await edit.click();
  const editor = page.locator('.legislator-profile-editor');
  await expect(editor.getByRole('heading', { name: `Editar ${fullName}` })).toBeVisible();
  const save = editor.getByRole('button', { name: 'Guardar cambios' });
  await expect(save).toBeDisabled();
  await editor.getByLabel('Distrito').fill('Santa Fe');
  await editor.getByLabel('Partido').fill('');
  await editor.getByLabel('Formación o título académico').fill('Abogada');
  await editor.getByLabel('Asistencia registrada (%)').fill('92.5');
  await expect(save).toBeDisabled();
  await expect(editor.getByRole('alert')).toContainText('Completá porcentaje, fecha de corte y fuente');
  await editor.getByLabel('Fecha de corte').fill('2026-08-06');
  await editor.getByLabel('Fuente de la asistencia').fill('https://example.com/asistencia');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(editor.getByRole('status')).toHaveText('Cambios guardados correctamente.');
  await expect(save).toBeDisabled();

  const bootstrap = await request.get(`${apiBase}/v1/manage/bootstrap`);
  const stored = (await bootstrap.json()).legislators.find((item: { id: string }) => item.id === createdBody.item.id);
  expect(stored).toMatchObject({ district: 'Santa Fe', party: '', academicTitle: 'Abogada', attendance: { value: 92.5, asOf: '2026-08-06', sourceUrl: 'https://example.com/asistencia' } });
});

test('los firmantes usan filtros compatibles y permiten seleccionar visibles o bloques completos', async ({ page, request }, testInfo) => {
  const apiBase = `http://localhost:${process.env.QUORUM_E2E_API_PORT || 8890}`;
  const marker = testInfo.project.name;
  const district = `Catamarca ${marker}`;
  const party = `Libertad ${marker}`;
  const bloc = `Bloque Libertad ${marker}`;
  const people = [
    { fullName: `Ana Federal ${marker}`, slug: `ana-federal-${marker}`, party: `Frente ${marker}`, bloc: `Bloque Federal ${marker}`, district, office: 'diputado' },
    { fullName: `Bruno Libertad ${marker}`, slug: `bruno-libertad-${marker}`, party, bloc, district: `Cordoba ${marker}`, office: 'diputado' },
    { fullName: `Carla Libertad ${marker}`, slug: `carla-libertad-${marker}`, party, bloc, district: `Mendoza ${marker}`, office: 'senador' },
  ];
  for (const person of people) {
    const response = await request.post(`${apiBase}/v1/manage/legislators`, { data: { ...person, mandateStart: null, mandateEnd: null, academicTitle: '', bio: '', attendance: null, published: false } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  await page.goto('/gestion');
  await page.getByRole('button', { name: 'Proyectos' }).click();
  const picker = page.locator('.legislator-relation-picker');
  await picker.getByLabel('Distrito').selectOption(district);
  await expect(picker.getByLabel('Partido').locator(`option[value="${party}"]`)).toHaveAttribute('disabled', '');
  await expect(picker.getByRole('button', { name: 'Seleccionar todos los visibles (1)' })).toBeEnabled();
  await picker.getByRole('button', { name: 'Seleccionar todos los visibles (1)' }).click();
  await expect(picker.locator('.legislator-picker-summary')).toContainText('1 seleccionados');

  await picker.getByRole('button', { name: 'Limpiar filtros' }).click();
  await picker.locator('.legislator-filter-controls select').last().selectOption(bloc);
  await expect(picker.getByRole('button', { name: 'Seleccionar bloque completo (2)' })).toBeEnabled();
  await picker.getByRole('button', { name: 'Seleccionar bloque completo (2)' }).click();
  await expect(picker.locator('.legislator-picker-summary')).toContainText('3 seleccionados');
});
