import { expect, type Page } from '@playwright/test';

export const E2E_SKIP_REASON = 'E2E_EMAIL / E2E_PASSWORD non définis';
export const hasE2eCredentials = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

export async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? '');
  await page.getByLabel('Mot de passe').fill(process.env.E2E_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Événements' })).toBeVisible({ timeout: 20_000 });
}

async function openAdmin(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await page.getByText('Administration', { exact: true }).last().click();
}

/** Creates a catalog then an event bound to it (both named `label`), and selects the event. */
export async function createCatalogAndEvent(page: Page, label: string) {
  page.on('dialog', (d) => {
    if (d.type() === 'prompt') void d.accept(label);
    else void d.accept();
  });

  await openAdmin(page);
  await page.getByRole('button', { name: 'Nouveau catalogue' }).click();
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retour' }).first().click();

  await page.getByRole('button', { name: 'Événements' }).click();
  await page.getByRole('button', { name: 'Nouvel événement' }).click();
  await page.getByLabel('Nom').fill(label);
  await page.getByLabel('Catalogue').selectOption({ label });
  await page.getByRole('button', { name: 'Créer' }).click();
  await page.getByRole('button', { name: new RegExp(label) }).first().click();
}

/** Best effort: removes the event then the catalog created by `createCatalogAndEvent`. */
export async function cleanup(page: Page, label: string) {
  try {
    page.on('dialog', (d) => void d.accept().catch(() => undefined));
    await page.getByRole('button', { name: 'Événements' }).click();
    const section = page.locator('section, div').filter({ hasText: label }).filter({
      has: page.getByRole('button', { name: 'Suppr.' })
    });
    await section.last().getByRole('button', { name: 'Suppr.' }).click({ timeout: 5_000 });
    await expect(page.getByText(label, { exact: true })).toHaveCount(0, { timeout: 5_000 });

    await openAdmin(page);
    await page.getByRole('button', { name: `Supprimer ${label}` }).click({ timeout: 5_000 });
  } catch {
    // best effort only
  }
}
