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
  for (const view of ['launches', 'timeline', 'recovery', 'supply', 'software', 'issues', 'testlab', 'activity', 'sources']) {
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

test('issues: a customer-reported critical shows its origin, log, routing and committed fix date', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/#/app/issues');
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.getByRole('link', { name: 'No sound over eARC with soundbars from two brands' }).click();
  const drawer = page.getByRole('dialog', { name: 'NWV-4211 details' });
  await expect(drawer).toContainText('1,240 TVs used "Report this issue"');
  await expect(drawer.locator('.tvlog .hit')).toContainText('capability handshake timeout');
  await expect(drawer).toContainText('committed to a fix in a release build by 9 Oct');
  await expect(drawer.getByRole('region', { name: 'Timeline' }).locator('li')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('test lab charts render with a hover tooltip, and suites link to their issues', async ({ page }) => {
  await page.goto('/#/app/testlab');
  await expect(page.getByRole('img', { name: 'Test hours per day by result' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Daily pass rate by platform' })).toBeVisible();
  await page.getByRole('img', { name: 'Test hours per day by result' }).locator('g[tabindex]').nth(3).focus();
  await expect(page.locator('.chart-tip')).toContainText('Passed:');
  await page.locator('table.data tbody tr').filter({ hasText: 'USB media playback soak' }).getByRole('link').click();
  await expect(page).toHaveURL(/#\/app\/issues\?.*suite=TS-USB-MEDIA/);
  await expect(page.locator('table.data tbody tr').first()).toBeVisible();
});

test('a delayed shipment shows the supplier notice in its tracking and keeps the disruption', async ({ page }) => {
  await page.goto('/#/app/supply?w=eyJzIjpbInVzYkRlbGF5Il19');
  await page.locator('table.data tbody tr').filter({ hasText: 'DL-UC3-01' }).click();
  const drawer = page.getByRole('dialog', { name: 'DL-UC3-01 shipment details' });
  await expect(drawer).toContainText('Supplier notice');
  await expect(drawer).toContainText('arrives 10 Dec (planned 6 Nov)');
  await expect(page).toHaveURL(/w=/);
});

test('data sources run each adapter on its sample payload', async ({ page }) => {
  await page.goto('/#/app/sources');
  const jira = page.locator('article').filter({ hasText: 'Issue tracker' });
  await jira.getByRole('button', { name: /Run the adapter on a sample/ }).click();
  await expect(jira.locator('pre.json').nth(1)).toContainText('"severity": "critical"');
});
