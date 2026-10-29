import { expect, test } from '@playwright/test';

test('phone layout: no horizontal scroll, menu opens', async ({ page }) => {
  await page.goto('/#/app/launches');
  await expect(page.locator('table.data')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Timeline' }).click();
  await expect(page).toHaveURL(/#\/app\/timeline/);
});
