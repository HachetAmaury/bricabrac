import { test, expect } from '@playwright/test';

test('happy path: create item, create event, sell, recap, validate, report', async ({ page, context }) => {
  await context.clearCookies();
  await page.addInitScript(() => localStorage.clear());

  await page.goto('/');

  // Catalog tab → create item "Mug" at 5,00
  await page.getByRole('button', { name: 'Catalogue' }).click();
  await page.getByRole('button', { name: '+ Nouvel article' }).click();
  await page.getByLabel('Nom').fill('Mug');
  await page.getByLabel('Prix (€)').fill('5,00');
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByText('Mug')).toBeVisible();

  // Events tab → create event and select it as active
  await page.getByRole('button', { name: 'Événements' }).click();
  await page.getByRole('button', { name: '+ Nouvel événement' }).click();
  await page.getByLabel('Nom').fill('Bric-à-brac test');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByText('Bric-à-brac test')).toBeVisible();
  // Click the event row button to make it the active event
  await page.getByRole('button', { name: /Bric-à-brac test/ }).first().click();

  // Catalog tab → enable Mug in active event
  await page.getByRole('button', { name: 'Catalogue' }).click();
  await page.getByLabel('Actif').check();

  // Sell tab → tap the Mug button twice, validate
  await page.getByRole('button', { name: 'Vente' }).click();
  await page.getByRole('button', { name: 'Mug', exact: true }).click();
  await page.getByRole('button', { name: 'Mug', exact: true }).click();
  await expect(page.getByText('10,00 €')).toBeVisible();
  await page.getByRole('button', { name: 'Valider' }).click();

  // Recap step → confirm with the customer, then go to payment
  await expect(page.getByText('Récapitulatif')).toBeVisible();
  await page.getByRole('button', { name: 'Encaisser' }).click();

  // Payment → enter cash, confirm
  await page.getByLabel('Montant reçu (optionnel)').fill('20,00');
  await expect(page.getByText('À rendre :')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmer' }).click();

  // Report tab → verify total
  await page.getByRole('button', { name: 'Rapport' }).click();
  await expect(page.getByText('10,00 €').first()).toBeVisible();
  await expect(page.getByText('1 vente(s)')).toBeVisible();
});
