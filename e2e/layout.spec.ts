import { test, expect, type Page } from '@playwright/test';

// The bottom tab bar (`<nav>`) is `position: fixed; bottom: 0`, so the app
// shell reserves bottom padding for it. These tests prove the last row of a
// scrolling view is NOT hidden behind that translucent bar — the regression
// fixed in "fix(layout): keep last row clear of the bottom tab bar".

// Use a short, phone-sized viewport so the views actually overflow and the
// fixed bar would overlap the bottom-most content without the reserved gap.
test.use({ viewport: { width: 390, height: 640 } });

async function createActiveEvent(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Événements' }).click();
  await page.getByRole('button', { name: 'Nouvel événement' }).click();
  await page.getByLabel('Nom').fill('Layout test');
  await page.getByRole('button', { name: 'Créer' }).click();
  // Tap the event row to make it the active event.
  await page.getByRole('button', { name: /Layout test/ }).first().click();
}

/**
 * Returns `navTop - rowBottom`: how far the row's bottom edge sits above the
 * top of the tab bar. Positive = clear of the bar; <= 0 = overlapped/hidden.
 */
async function gapAboveTabBar(page: Page, row: ReturnType<Page['getByText']>) {
  // Scroll the document fully down — the worst case, where the fixed bar would
  // overlap the bottom-most content if the shell reserved no room for it.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const rowBox = await row.boundingBox();
  const navBox = await page.locator('nav').boundingBox();
  expect(rowBox, 'target row should be laid out').not.toBeNull();
  expect(navBox, 'tab bar should be laid out').not.toBeNull();
  return navBox!.y - (rowBox!.y + rowBox!.height);
}

test('Caisse: the "Écart" line clears the bottom tab bar', async ({ page }) => {
  await createActiveEvent(page);
  await page.getByRole('button', { name: 'Caisse' }).click();

  // The "Écart" SummaryLine is the last row of the last (Bilan) section.
  const ecartRow = page.getByText('Écart', { exact: true }).locator('..');
  await expect(ecartRow).toBeVisible();

  const gap = await gapAboveTabBar(page, ecartRow);
  // Must not be hidden behind the bar, and must keep the comfortable gap the
  // shell reserves (tab height + safe-area inset + 24px) rather than sitting
  // flush against it.
  expect(gap).toBeGreaterThanOrEqual(16);
});

test('Caisse: the last row still clears the bar with an iOS safe-area inset', async ({ page }) => {
  // Simulate an iOS home-indicator inset. Both the bar and the reserved
  // padding key off `--safe-bottom`, so the clearance must survive a non-zero
  // inset too.
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = ':root { --safe-bottom: 34px !important; }';
    document.documentElement.appendChild(style);
  });

  await createActiveEvent(page);
  await page.getByRole('button', { name: 'Caisse' }).click();

  const ecartRow = page.getByText('Écart', { exact: true }).locator('..');
  await expect(ecartRow).toBeVisible();

  const gap = await gapAboveTabBar(page, ecartRow);
  expect(gap).toBeGreaterThanOrEqual(16);
});
