import { test, expect, type Page } from '@playwright/test';
import { E2E_SKIP_REASON, cleanup, createCatalogAndEvent, hasE2eCredentials, login } from './helpers';

test.skip(!hasE2eCredentials, E2E_SKIP_REASON);

// The bottom tab bar (`<nav>`) is `position: fixed; bottom: 0`, so the app
// shell reserves bottom padding for it. These tests prove the last row of a
// scrolling view is NOT hidden behind that translucent bar — the regression
// fixed in "fix(layout): keep last row clear of the bottom tab bar".

// Use a short, phone-sized viewport so the views actually overflow and the
// fixed bar would overlap the bottom-most content without the reserved gap.
test.use({ viewport: { width: 390, height: 640 } });

/** Logs in, creates a throwaway catalog + event, runs `body`, then cleans up. */
async function withActiveEvent(page: Page, body: () => Promise<void>) {
  const label = `E2E ${Date.now()}`;
  await login(page);
  try {
    await createCatalogAndEvent(page, label);
    await body();
  } finally {
    await cleanup(page, label);
  }
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
  await withActiveEvent(page, async () => {
    await page.getByRole('button', { name: 'Caisse' }).click();

    // The "Écart" SummaryLine is the last row of the last (Bilan) section.
    const ecartRow = page.getByText('Écart', { exact: true }).locator('..');
    await expect(ecartRow).toBeVisible();

    // Must not be hidden behind the bar, and must keep the comfortable gap the
    // shell reserves (tab height + safe-area inset + 24px).
    expect(await gapAboveTabBar(page, ecartRow)).toBeGreaterThanOrEqual(16);
  });
});

test('Caisse: the last row still clears the bar with an iOS safe-area inset', async ({ page }) => {
  // Simulate an iOS home-indicator inset. Both the bar and the reserved
  // padding key off `--safe-bottom`.
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = ':root { --safe-bottom: 34px !important; }';
    document.documentElement.appendChild(style);
  });

  await withActiveEvent(page, async () => {
    await page.getByRole('button', { name: 'Caisse' }).click();
    const ecartRow = page.getByText('Écart', { exact: true }).locator('..');
    await expect(ecartRow).toBeVisible();
    expect(await gapAboveTabBar(page, ecartRow)).toBeGreaterThanOrEqual(16);
  });
});
