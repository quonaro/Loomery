import { expect, test } from '@playwright/test';

test('starter wordmark sits under the logo and replaces the hint list', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto('/e2e/harness/index.html?scenario=blank');

  const logo = page.locator('.chat-empty-logo');
  const wordmark = page.locator('.chat-empty-wordmark');
  await expect(logo).toBeVisible();
  await expect(logo).toHaveCSS('opacity', '0.8');
  await expect(logo).toHaveCSS('filter', 'drop-shadow(rgba(0, 0, 0, 0.28) 0px 1px 1px)');
  await expect(wordmark).toHaveText('LOOMERY');
  await expect(wordmark).toHaveCSS('color', 'rgb(32, 39, 41)');
  await expect(wordmark).toHaveCSS('opacity', '0.8');
  await expect(page.locator('.chat-empty-hints')).toHaveCount(0);
  await expect(page.locator('.chat-empty-hint')).toHaveCount(0);

  for (const width of [480, 280, 240]) {
    await page.setViewportSize({ width, height: 800 });
    const logoBox = await logo.boundingBox();
    const wordmarkBox = await wordmark.boundingBox();
    expect(wordmarkBox!.y - (logoBox!.y + logoBox!.height)).toBeCloseTo(40, 0);
    expect(wordmarkBox!.x + wordmarkBox!.width / 2).toBeCloseTo(
      logoBox!.x + logoBox!.width / 2,
      0
    );
    expect(wordmarkBox!.x + wordmarkBox!.width).toBeLessThanOrEqual(width);
  }
});

for (const theme of ['vscode-light', 'vscode-high-contrast-light', 'vscode-dark']) {
  test(`starter logo and wordmark share the same ink in ${theme}`, async ({ page }) => {
    await page.goto('/e2e/harness/index.html?scenario=blank');
    const logo = page.locator('.chat-empty-logo');
    const wordmark = page.locator('.chat-empty-wordmark');
    await expect(logo).toBeVisible();
    const originalSource = await logo.getAttribute('src');

    await page.locator('body').evaluate((element, nextTheme) => {
      element.classList.remove(
        'vscode-dark',
        'vscode-high-contrast',
        'vscode-light',
        'vscode-high-contrast-light'
      );
      element.classList.add(nextTheme);
    }, theme);

    await expect(logo).toHaveCSS('opacity', '0.8');
    await expect(logo).toHaveCSS('filter', 'drop-shadow(rgba(0, 0, 0, 0.28) 0px 1px 1px)');
    await expect(wordmark).toHaveCSS('opacity', '0.8');
    await expect(wordmark).toHaveCSS('color', 'rgb(32, 39, 41)');
    expect(await logo.getAttribute('src')).toBe(originalSource);
  });
}

test('starter logo shadow follows the VS Code keybinding shadow theme color', async ({ page }) => {
  await page.goto('/e2e/harness/index.html?scenario=blank');
  const emptyState = page.locator('.chat-empty-state');
  await expect(page.locator('.chat-empty-wordmark')).toBeVisible();

  for (const shadow of ['rgb(17, 17, 17)', 'rgb(170, 170, 170)']) {
    await emptyState.evaluate((element, color) => {
      element.style.setProperty('--vscode-keybindingLabel-shadow', color);
    }, shadow);
    await expect(page.locator('.chat-empty-logo')).toHaveCSS(
      'filter',
      `drop-shadow(${shadow} 0px 1px 1px)`
    );
  }
});
