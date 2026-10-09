import { expect, test } from '@playwright/test';

test('keeps the new-session button pinned to the right of a scrolling tab strip', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto('/e2e/harness/index.html?scenario=session-search');
  await expect(page.locator('.session-item').first()).toBeVisible();

  // The harness clears storage on the first load for a scenario, so seed the
  // open tabs and reload to have the webview pick them up.
  await page.evaluate(() => {
    window.localStorage.setItem(
      'loomery.openSessionTabs',
      JSON.stringify(['session-search-alpha', 'session-search-beta', 'session-search-gamma'])
    );
  });
  await page.reload();
  await page.locator('.session-item').filter({ hasText: 'Alpha release checklist' }).click();

  const strip = page.locator('.session-tabs');
  const button = page.locator('.session-tabs-new');
  await expect(strip).toBeVisible();
  await expect(button).toBeVisible();
  await expect(page.locator('.session-tab')).toHaveCount(3);

  const measure = () =>
    page.evaluate(() => {
      const stripEl = document.querySelector<HTMLElement>('.session-tabs');
      const buttonEl = document.querySelector<HTMLElement>('.session-tabs-new');
      if (!stripEl || !buttonEl) throw new Error('Session tab strip is incomplete');
      const stripBox = stripEl.getBoundingClientRect();
      const buttonBox = buttonEl.getBoundingClientRect();
      return {
        overflow: stripEl.scrollWidth - stripEl.clientWidth,
        scrollLeft: stripEl.scrollLeft,
        stripLeft: stripBox.left,
        stripRight: stripBox.right,
        buttonLeft: buttonBox.left,
        buttonRight: buttonBox.right,
      };
    });

  const initial = await measure();
  expect(initial.overflow).toBeGreaterThan(0);
  expect(Math.abs(initial.buttonRight - initial.stripRight)).toBeLessThanOrEqual(1);

  await strip.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  const scrolled = await measure();
  expect(scrolled.scrollLeft).toBeGreaterThan(0);
  expect(Math.abs(scrolled.buttonRight - scrolled.stripRight)).toBeLessThanOrEqual(1);
  expect(scrolled.buttonLeft).toBeGreaterThanOrEqual(scrolled.stripLeft);
  await expect(button.getByRole('button', { name: 'New chat' })).toBeInViewport();
});
