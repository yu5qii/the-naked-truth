import { test, expect } from '@playwright/test';
import payloads from '../fixtures/malicious_payloads.json';

test.describe('XSS & Input Sanitization Security Suite', () => {
  test('React escaping prevents XSS execution from adversarial scraped headlines and facts', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Set up window sentinel to detect any unauthorized script execution
    await page.evaluate(() => {
      window['__xss_vulnerable'] = false;
    });

    for (const xssPayload of payloads.xss_payloads) {
      // Inject adversarial payload into custom article in Zustand store
      await page.evaluate((payload) => {
        if (window.__nakedTruthStore) {
          window.__nakedTruthStore.getState().setCurrentArticle({
            id: 'xss-test-article',
            category: payload,
            region: payload,
            timestamp: 'Just now',
            publishedDate: 'November 20, 2026',
            readTime: '2 min',
            headline: payload,
            excerpt: payload,
            sourceCount: 2,
            aiOverview: {
              summary: payload,
              consensusFacts: [payload, payload],
              confidenceScore: 99.0,
              modelInfo: {
                model: 'TinyLlama-1.1B',
                quantization: '4-bit',
                latencyMs: 150,
              },
            },
            leftPerspective: {
              sources: [payload],
              headline: payload,
              framing: payload,
              highlightedFacts: [payload],
              omittedFacts: [payload],
            },
            rightPerspective: {
              sources: [payload],
              headline: payload,
              framing: payload,
              highlightedFacts: [payload],
              omittedFacts: [payload],
            },
          });
        }
      }, xssPayload);

      // Verify that the XSS sentinel was not triggered
      const isVulnerable = await page.evaluate(() => window['__xss_vulnerable']);
      expect(isVulnerable).toBe(false);

      // Verify that raw script tags were not injected into DOM as executable scripts
      const injectedScript = await page.evaluate((payload) => {
        const scripts = Array.from(document.querySelectorAll('script'));
        return scripts.some((s) => s.textContent?.includes('XSS_') || s.src?.includes('javascript:'));
      }, xssPayload);
      expect(injectedScript).toBe(false);
    }
  });

  test('URL input form safely escapes malicious input strings without executing code', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Open URL modal
    await page.locator('button:has-text("Analyze URL")').click();
    const input = page.locator('input[type="url"]');
    await expect(input).toBeVisible();

    const maliciousInput = payloads.xss_payloads[0];
    await input.fill(maliciousInput);

    // Verify input value is treated as literal string
    const value = await input.inputValue();
    expect(value).toBe(maliciousInput);

    const isVulnerable = await page.evaluate(() => window['__xss_vulnerable']);
    expect(isVulnerable).toBeFalsy();
  });
});
