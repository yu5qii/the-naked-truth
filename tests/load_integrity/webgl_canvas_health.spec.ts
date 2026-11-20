import { test, expect } from '@playwright/test';
import manifest from '../runtime_guards/integrity_manifest.json';

test.describe('WebGL Canvas & 3D Health Suite', () => {
  test('R3F WebGL Canvas mounts, initializes active context, and operates without GPU crash', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Verify canvas element is attached to DOM
    const canvasLocator = page.locator(manifest.critical_selectors.canvas_webgl);
    await expect(canvasLocator).toBeAttached();

    // 2. Query WebGL context health from browser runtime
    const webglHealth = await page.evaluate(() => {
      const canvas = document.querySelector('canvas#r3f-canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        return { found: false, hasContext: false, isLost: true, glVersion: 'none', errorCode: -1 };
      }

      const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
      if (!gl) {
        return { found: true, hasContext: false, isLost: true, glVersion: 'none', errorCode: -1 };
      }

      return {
        found: true,
        hasContext: true,
        isLost: gl.isContextLost(),
        glVersion: gl instanceof WebGL2RenderingContext ? 'WebGL 2.0' : 'WebGL 1.0',
        errorCode: gl.getError(),
      };
    });

    expect(webglHealth.found).toBe(true);
    expect(webglHealth.hasContext).toBe(true);
    expect(webglHealth.isLost).toBe(false);
    expect(webglHealth.errorCode).toBe(0); // GL_NO_ERROR

    // 3. Verify window.__canvasHealth telemetry
    const canvasTelemetry = await page.evaluate(() => window.__canvasHealth);
    if (canvasTelemetry) {
      expect(canvasTelemetry.mounted).toBe(true);
      expect(canvasTelemetry.contextActive).toBe(true);
      expect(canvasTelemetry.contextLost).toBe(false);
    }
  });

  test('Canvas handles WebGL context loss gracefully without crashing page runtime', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Trigger synthetic context lost event
    const contextLossHandled = await page.evaluate(() => {
      const canvas = document.querySelector('canvas#r3f-canvas') as HTMLCanvasElement;
      if (!canvas) return false;

      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return false;

      // Dispatch webglcontextlost event
      const event = new Event('webglcontextlost', { cancelable: true });
      canvas.dispatchEvent(event);
      return true;
    });

    expect(contextLossHandled).toBe(true);
    // Page must remain operational with zero unhandled crash exceptions
    expect(pageErrors).toEqual([]);
    await expect(page.locator('header a[href="/"]')).toBeVisible();
  });
});
