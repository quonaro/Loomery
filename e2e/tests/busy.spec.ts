import { expect, test } from '@playwright/test';

test('busy composer queues follow-ups with a single send button', async ({ page }) => {
  await page.goto('/e2e/harness/index.html?scenario=busy-stop-send');

  const composer = page.locator('[role="textbox"][aria-multiline="true"]').first();
  await composer.fill('Queue this follow-up while busy.');

  await expect(page.getByLabel('More send options')).toHaveCount(0);
  const queueButton = page.getByLabel('Add to queue (Enter)', { exact: true });
  await expect(queueButton).toBeVisible();
  await queueButton.click();

  await expect(page.locator('.chat-queue-container').first()).toContainText(
    'Queue this follow-up while busy.'
  );
  await expect(composer).toHaveText('');
});

test('restores the active busy session after webview reload', async ({ page }) => {
  await page.goto('/e2e/harness/index.html?scenario=busy-stop-send');

  await expect(
    page.getByText('Still working through the requested refactor steps.', { exact: true })
  ).toBeVisible();

  await page.reload();

  await expect(page.locator('.chat-header-title-text').first()).toHaveText('Busy stop and send');
  await expect(
    page.getByText('Still working through the requested refactor steps.', { exact: true })
  ).toBeVisible();

  const composer = page.locator('[role="textbox"][aria-multiline="true"]').first();
  await composer.fill('Queue this after reload.');
  await expect(page.getByLabel('More send options')).toHaveCount(0);
  await page.getByLabel('Add to queue (Enter)', { exact: true }).click();

  await expect(page.locator('.chat-queue-container').first()).toContainText(
    'Queue this after reload.'
  );
});
