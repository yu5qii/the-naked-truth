import { test, expect } from '@playwright/test';
import manifest from '../runtime_guards/integrity_manifest.json';

test.describe('HTTP Security Headers & CSP Enforcement Suite', () => {
  test('Responses enforce mandatory security headers on all core routes', async ({ request }) => {
    for (const route of manifest.critical_routes) {
      const response = await request.get(route.path);
      expect(response.status()).toBe(200);

      const headers = response.headers();

      // 1. Content Security Policy (CSP)
      expect(headers['content-security-policy']).toBeDefined();
      expect(headers['content-security-policy']).toContain("default-src 'self'");
      expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");

      // 2. Clickjacking Defense: X-Frame-Options
      expect(headers['x-frame-options']).toBe('DENY');

      // 3. MIME Sniffing Defense: X-Content-Type-Options
      expect(headers['x-content-type-options']).toBe('nosniff');

      // 4. Strict Transport Security (HSTS)
      expect(headers['strict-transport-security']).toBeDefined();
      expect(headers['strict-transport-security']).toContain('max-age=');

      // 5. Referrer Policy
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

      // 6. Permissions Policy
      expect(headers['permissions-policy']).toBeDefined();
      expect(headers['permissions-policy']).toContain('camera=()');
    }
  });

  test('Inline frame injection is blocked by frame-ancestors CSP directive', async ({ page }) => {
    // Attempt to load application inside an iframe in an adversarial context
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    const xFrameOptions = response?.headers()['x-frame-options'];
    expect(xFrameOptions).toBe('DENY');

    const csp = response?.headers()['content-security-policy'];
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
