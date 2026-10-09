/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- SAFETY: These E2E callbacks update protocol-shaped busy state owned by the controlled harness fixture. */
import { expect, test } from '@playwright/test';
import { getE2EState } from './helpers';

test('busy send menu supports stop-and-send for follow-up instructions', async ({ page }) => {
  await page.goto('/e2e/harness/index.html?scenario=busy-stop-send');

  const composer = page.locator('[role="textbox"][aria-multiline="true"]').first();
  await composer.fill('Stop and send this follow-up now.');
  await page.getByLabel('More send options').click();
  await expect(page.getByText('Stop and Send', { exact: true })).toBeVisible();
  await page.getByText('Stop and Send', { exact: true }).click();

  await expect(page.locator('.chat-turn-user').last()).toContainText(
    'Stop and send this follow-up now.'
  );

  const requests = await getE2EState(page, () => {
    const value = (
      window as Window & {
        __loomeryE2E?: { requests: Array<{ method: string; path: string }> };
      }
    ).__loomeryE2E;
    return value?.requests || [];
  });

  expect(
    requests.filter((request) => {
      const url = new URL(request.path, 'http://loomery.test');
      return (
        url.pathname.endsWith('/abort') && url.searchParams.get('directory') === '/workspace/loomery'
      );
    })
  ).toHaveLength(1);
  expect(
    requests.filter((request) =>
      new URL(request.path, 'http://loomery.test').pathname.endsWith('/prompt_async')
    )
  ).toHaveLength(1);
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
  await composer.fill('Stop and send this after reload.');
  await page.getByLabel('More send options').click();
  await expect(page.getByText('Stop and Send', { exact: true })).toBeVisible();
  await page.getByText('Stop and Send', { exact: true }).click();

  await expect(page.locator('.chat-turn-user').last()).toContainText(
    'Stop and send this after reload.'
  );

  const requests = await getE2EState(page, () => {
    const value = (
      window as Window & {
        __loomeryE2E?: { requests: Array<{ method: string; path: string }> };
      }
    ).__loomeryE2E;
    return value?.requests || [];
  });

  expect(
    requests.filter((request) => {
      const url = new URL(request.path, 'http://loomery.test');
      return (
        url.pathname.endsWith('/abort') && url.searchParams.get('directory') === '/workspace/loomery'
      );
    })
  ).toHaveLength(1);
  expect(
    requests.filter((request) =>
      new URL(request.path, 'http://loomery.test').pathname.endsWith('/prompt_async')
    )
  ).toHaveLength(1);
});
