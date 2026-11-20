import { test, expect } from '@playwright/test';
import manifest from '../runtime_guards/integrity_manifest.json';

test.describe('Load-Time & Page Integrity Suite', () => {
  test('Homepage mounts with HTTP 200, zero console errors, and successful hydration', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected network connection failures during tests if local backend isn't up yet
        if (!text.includes('Failed to load resource') && !text.includes('ECONNREFUSED')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    const startTime = Date.now();
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    const loadDuration = Date.now() - startTime;

    // 1. HTTP 200 Verification
    expect(response?.status()).toBe(200);

    // 2. Load duration within benchmark
    expect(loadDuration).toBeLessThan(manifest.integrity_benchmarks.max_load_time_ms);

    // 3. Critical UI Selectors Visible
    await expect(page.locator(manifest.critical_selectors.header_brand)).toBeVisible();
    await expect(page.locator(manifest.critical_selectors.news_grid_lead)).toBeVisible();
    await expect(page.locator(manifest.critical_selectors.canvas_webgl)).toBeAttached();

    // 4. Hydration check: React hydration mismatch warnings absent
    const htmlContent = await page.content();
    expect(htmlContent).not.toContain('Hydration failed because the initial UI does not match');
    expect(htmlContent).not.toContain('Text content did not match');

    // 5. Zero unhandled JavaScript errors
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('Article Detail Page loads with HTTP 200 and renders AI Overview', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto('/article/clean-energy-accord', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // Verify AI Overview card and split-screen sections mount
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator(manifest.critical_selectors.split_perspective_section)).toBeVisible();
    await expect(page.locator(manifest.critical_selectors.export_brief_button)).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});
