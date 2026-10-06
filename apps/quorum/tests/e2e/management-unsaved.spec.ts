import { expect, test } from '@playwright/test';

test('advierte antes de abandonar formularios pendientes de cualquier sección de gestión', async ({ page }) => {
  await page.goto('/gestion');
  const nav = page.locator('.management-nav');
  let settingsCheckboxBefore = false;

  const cases = [
    {
      tab: 'Legisladores', next: 'Glosario',
      change: async () => page.getByLabel('Nombre completo', { exact: true }).fill('Perfil temporal sin guardar'),
      verify: async () => expect(page.getByLabel('Nombre completo', { exact: true })).toHaveValue('Perfil temporal sin guardar'),
    },
    {
      tab: 'Glosario', next: 'Etapas y catálogos',
      change: async () => page.getByLabel('Término', { exact: true }).fill('Término temporal'),
      verify: async () => expect(page.getByLabel('Término', { exact: true })).toHaveValue('Término temporal'),
    },
    {
      tab: 'Etapas y catálogos', next: 'Configuración',
      change: async () => page.getByLabel('Etiqueta', { exact: true }).fill('Cámara temporal'),
      verify: async () => expect(page.getByLabel('Etiqueta', { exact: true })).toHaveValue('Cámara temporal'),
    },
    {
      tab: 'Configuración', next: 'Usuarios',
      change: async () => {
        const checkbox = page.getByRole('checkbox').first();
        settingsCheckboxBefore = await checkbox.isChecked();
        await checkbox.setChecked(!settingsCheckboxBefore);
      },
      verify: async () => expect(page.getByRole('checkbox').first()).toBeChecked({ checked: !settingsCheckboxBefore }),
    },
    {
      tab: 'Usuarios', next: 'Nosotros',
      change: async () => page.getByLabel('Email', { exact: true }).fill('pendiente@example.com'),
      verify: async () => expect(page.getByLabel('Email', { exact: true })).toHaveValue('pendiente@example.com'),
    },
    {
      tab: 'Nosotros', next: 'Tablero',
      change: async () => page.getByLabel('Nombre completo', { exact: true }).fill('Integrante temporal'),
      verify: async () => expect(page.getByLabel('Nombre completo', { exact: true })).toHaveValue('Integrante temporal'),
    },
  ];

  for (const item of cases) {
    await nav.getByRole('button', { name: item.tab, exact: true }).click();
    await item.change();
    await nav.getByRole('button', { name: item.next, exact: true }).click();
    const modal = page.getByRole('dialog', { name: `¿Salir de ${item.tab}?` });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Seguir editando' }).click();
    await item.verify();
    await nav.getByRole('button', { name: item.next, exact: true }).click();
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Descartar y continuar' }).click();
    await expect(page.getByRole('heading', { name: item.next, exact: true })).toBeVisible();
  }

  await nav.getByRole('button', { name: 'Configuración', exact: true }).click();
  const setting = page.getByRole('checkbox').first();
  const initial = await setting.isChecked();
  await setting.setChecked(!initial);
  await expect(setting).toBeChecked({ checked: !initial });
  await expect.poll(() => page.evaluate(() => Boolean(history.state?.quorumManagementGuard))).toBe(true);
  await page.evaluate(() => history.back());
  const backDialog = page.getByRole('dialog', { name: '¿Salir de Configuración?' });
  await expect(backDialog).toBeVisible();
  await backDialog.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(setting).toBeChecked({ checked: !initial });
});
