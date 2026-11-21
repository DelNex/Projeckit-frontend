import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = ['/login', '/register'];
const viewports = [
  { name: 'small phone', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
];

const themes = ['light', 'dark'] as const;

for (const route of routes) {
  for (const viewport of viewports) {
    for (const theme of themes) {
      test(`${route} fits the ${viewport.name} viewport (${viewport.width}px) in ${theme} mode`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(route);
        await page.evaluate((mode) => document.documentElement.classList.toggle('dark', mode === 'dark'), theme);
  
        const main = page.locator('main.pk-auth');
        await expect(main).toBeVisible();
        await expect(main.locator('form')).toBeVisible();
  
        const layout = await page.evaluate(() => {
          const viewportWidth = window.innerWidth;
          const elements = [
            ...document.querySelectorAll('main.pk-auth, main.pk-auth section, main.pk-auth input, main.pk-auth button'),
          ];
          return {
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth,
            elementsOutsideViewport: elements
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  tag: element.tagName,
                  left: Math.round(rect.left * 100) / 100,
                  right: Math.round(rect.right * 100) / 100,
                };
              })
              .filter((rect) => rect.left < -1 || rect.right > viewportWidth + 1),
            inputFontSizes: [...document.querySelectorAll('main.pk-auth input:not([type="checkbox"]):not([type="radio"])')]
              .map((input) => Number.parseFloat(getComputedStyle(input).fontSize)),
            buttonHeights: [...document.querySelectorAll('main.pk-auth button')]
              .map((button) => button.getBoundingClientRect().height),
          };
        });
  
        expect(layout.documentWidth, 'page must not create horizontal document overflow').toBeLessThanOrEqual(viewport.width + 1);
        expect(layout.elementsOutsideViewport, 'form controls and card must stay inside the viewport').toEqual([]);
        if (viewport.width < 640) {
          expect(layout.inputFontSizes.every((size) => size >= 16), 'mobile fields must avoid iOS auto-zoom').toBe(true);
          expect(layout.buttonHeights.every((height) => height >= 40), 'mobile buttons must have touch-safe targets').toBe(true);
        } else {
          expect(layout.buttonHeights.every((height) => height >= 36), 'desktop buttons must keep a consistent minimum target').toBe(true);
        }
  
        const accessibility = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(
          accessibility.violations.map(({ id, impact, description, nodes }) => ({
            id, impact, description, affected: nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
          })),
          'authentication page should have no automated WCAG A/AA violations',
        ).toEqual([]);
      });
    }
  }
}