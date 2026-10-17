import { test, expect } from '@playwright/test';
import { E2E_SKIP_REASON, cleanup, createCatalogAndEvent, hasE2eCredentials, login } from './helpers';

test.skip(!hasE2eCredentials, E2E_SKIP_REASON);

test('happy path: login, catalog, event, sell, recap, validate, report', async ({ page }) => {
  const label = `E2E ${Date.now()}`;
  await login(page);
  try {
    await createCatalogAndEvent(page, label);

    // Catalog tab → create item "Mug" at 5,00
    await page.getByRole('button', { name: 'Catalogue' }).click();
    await page.getByRole('button', { name: 'Nouvel article' }).click();
    await page.getByLabel('Nom').fill('Mug');
    await page.getByLabel('Prix (€)').fill('5,00');
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByText('Mug')).toBeVisible();

    // Enable Mug in the active event
    await page.getByRole('switch', { name: 'Activer Mug' }).click();

    // Sell tab → two Mugs, validate
    await page.getByRole('button', { name: 'Vente' }).click();
    await page.getByRole('button', { name: 'Mug', exact: true }).click();
    await page.getByRole('button', { name: 'Mug', exact: true }).click();
    await expect(page.getByText('10,00 €').first()).toBeVisible();
    await page.getByRole('button', { name: 'Valider' }).click();

    // Recap → pay
    await expect(page.getByText('Récapitulatif')).toBeVisible();
    await page.getByRole('button', { name: 'Encaisser' }).click();
    await page.getByLabel('Montant reçu (optionnel)').fill('20,00');
    await expect(page.getByText('À rendre :')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer' }).click();

    // Report: total and a single seller section
    await page.getByRole('button', { name: 'Rapport' }).click();
    await expect(page.getByText('10,00 €').first()).toBeVisible();
    await expect(page.getByText(/1 vente\(s\) · 10,00 €/)).toHaveCount(1);
  } finally {
    await cleanup(page, label);
  }
});
