import { test, expect } from '@playwright/test';
import manifest from '../runtime_guards/integrity_manifest.json';

test.describe('DOM-to-Canvas State Bridge Suite', () => {
  test('DOM interaction updates Zustand store and propagates to Canvas state', async ({ page }) => {
    await page.goto('/article/clean-energy-accord', { waitUntil: 'networkidle' });

    const canvas = page.locator(manifest.critical_selectors.canvas_webgl);
    await expect(canvas).toBeAttached();

    // 1. Initial State Check
    await expect(canvas).toHaveAttribute('data-active-tab', 'overview');
    await expect(canvas).toHaveAttribute('data-canvas-state', 'idle');

    // 2. Trigger Perspective Change via Zustand State Bridge
    await page.evaluate(() => {
      if (window.__nakedTruthStore) {
        window.__nakedTruthStore.getState().setActiveTab('left');
      }
    });

    // 3. Verify Canvas synchronized with new perspective state
    await expect(canvas).toHaveAttribute('data-active-tab', 'left');

    // 4. Trigger Analysis State in Zustand
    await page.evaluate(() => {
      if (window.__nakedTruthStore) {
        window.__nakedTruthStore.setState({ isAnalyzing: true });
      }
    });

    // 5. Verify Canvas entered 'analyzing' state
    await expect(canvas).toHaveAttribute('data-canvas-state', 'analyzing');

    // 6. Reset Analysis State
    await page.evaluate(() => {
      if (window.__nakedTruthStore) {
        window.__nakedTruthStore.setState({ isAnalyzing: false });
      }
    });
    await expect(canvas).toHaveAttribute('data-canvas-state', 'idle');
  });

  test('Clicking Analyze URL button in header bridges state to modal and canvas', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const analyzeBtn = page.locator(manifest.critical_selectors.analyze_url_button);
    await expect(analyzeBtn).toBeVisible();

    // Click Analyze URL button
    await analyzeBtn.click();

    // Verify modal mounts in response to state change
    await expect(page.locator('h2:has-text("Inspect Any News URL")')).toBeVisible();

    // Verify store reflects open modal
    const isModalOpen = await page.evaluate(() => {
      return window.__nakedTruthStore?.getState().isUrlModalOpen;
    });
    expect(isModalOpen).toBe(true);
  });
});
