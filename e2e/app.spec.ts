import { expect, test, type Page } from '@playwright/test';

const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
};

test('baseline plan: 12 ready, 4 at risk, no console errors', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/#/app/launches');
  await expect(page.getByRole('heading', { name: 'Launches', level: 2 })).toBeVisible();
  await expect(page.locator('.kpi').nth(0)).toContainText('12');
  await expect(page.locator('.kpi').nth(1)).toContainText('4');
  await expect(page.locator('table.data tbody tr')).toHaveCount(16);
  expect(errors).toEqual([]);
});

test('a USB delay hits Halo 77" and the drawer explains the chain', async ({ page }) => {
  await page.goto('/#/app/launches');
  await page.keyboard.press('s');
  const dialog = page.getByRole('dialog', { name: 'Simulate a disruption' });
  await dialog.getByLabel('USB controller delay').check();
  await dialog.getByRole('button', { name: 'Done' }).click();

  const banner = page.getByRole('region', { name: 'Impact of the current disruption' });
  await expect(banner).toContainText('1 launch hit: Halo 77"');
  const first = page.locator('table.data tbody tr').first();
  await expect(first).toContainText('Halo 77"');
  await expect(first).toContainText('Test boards late');

  await first.click();
  const drawer = page.getByRole('dialog', { name: 'Halo 77" details' });
  await expect(drawer).toContainText('testing starts 26 days late');
  await expect(drawer.locator('.chain-step.first-break')).toContainText('Test boards');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('approving the recommended recovery restores the plan; undo brings the risk back', async ({ page }) => {
  await page.goto('/#/app/launches');
  await page.keyboard.press('s');
  await page.getByLabel('USB controller delay').check();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('link', { name: 'See recovery options' }).click();

  await expect(page.getByRole('heading', { name: '1 launch needs a recovery decision' })).toBeVisible();
  const recommended = page.locator('article').filter({ hasText: 'Recommended' });
  await expect(recommended).toContainText('Borrow 20 USB 3.2 controllers from the Rhine-L order');
  await recommended.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Every launch is back to its original plan.')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: '1 launch needs a recovery decision' })).toBeVisible();
});

test('the URL carries the workspace, so a shared link reopens the same state', async ({ page, context }) => {
  await page.goto('/#/app/launches');
  await page.keyboard.press('s');
  await page.getByLabel('Two launches, one part').check();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/w=/);

  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByRole('region', { name: 'Impact of the current disruption' })).toContainText('Zenith');
});

test('command palette jumps to a launch', async ({ page }) => {
  await page.goto('/#/app/timeline');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder('Search launches, views and actions…').fill('Lumen 65');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/app\/launches\/LUM-65/);
  await expect(page.getByRole('dialog', { name: 'Lumen 65" details' })).toBeVisible();
});

test('every view renders without errors', async ({ page }) => {
  const errors = errorsOf(page);
  for (const view of ['launches', 'timeline', 'recovery', 'supply', 'software', 'activity']) {
    await page.goto(`/#/app/${view}`);
    await expect(page.locator('main h2').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('story page: the guess reveals Halo 77" and the CTA opens the app with the delay applied', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A supplier slips by 34 days');
  await page.getByRole('group', { name: 'Pick a launch' }).getByRole('button', { name: /None of them/ }).click();
  await expect(page.getByText(/Not quite: it's Halo 77"/)).toBeVisible();
  await page.getByRole('link', { name: 'See the delay in the app' }).click();
  await expect(page.getByRole('region', { name: 'Impact of the current disruption' })).toContainText('Halo 77"');
  expect(errors).toEqual([]);
});
