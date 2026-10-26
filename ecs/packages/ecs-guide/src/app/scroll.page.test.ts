// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { chapters } from "../content/guide.js";
import { launch, statusOf } from "./page.test-helper.js";

let browser: Browser;
beforeAll(async () => {
    browser = await launch();
});
afterAll(async () => {
    await browser.close();
});

const last = chapters.at(-1);
/** The chapter with the most prose, which overflows its panel on every desktop size. */
const longest = chapters.reduce((most, chapter) => chapter.prose.length > most.prose.length ? chapter : most);

/** How far an element of the page is scrolled, and how far it can be. */
const scrolled = (page: Page, selector: string): Promise<{ readonly top: number; readonly max: number }> =>
    page.locator(selector).evaluate(element => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight }));

/** Scrolls the wheel over an element until it stops moving, and gives how far it went. */
const wheelToEnd = async (page: Page, selector: string): Promise<{ readonly top: number; readonly max: number }> => {
    const box = await page.locator(selector).boundingBox();
    if (box === null) throw new Error(`${selector} isn't shown`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let previous = -1; ;) {
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(60);
        const { top } = await scrolled(page, selector);
        if (top === previous) break;
        previous = top;
    }
    return scrolled(page, selector);
};

/** Sizes of the desktop layout, tall and short, and of the stacked one below 1100 wide, in each scheme. */
const viewports = [[1400, 900], [1280, 600], [1024, 600]] as const;
const cases = viewports.flatMap(([width, height]) => (["dark", "light"] as const).map(scheme => [width, height, scheme] as const));

it.each(cases)("scrolls the navigation and the prose to their ends by the wheel at %ix%i, %s: each in its own panel on the desktop, the page itself still", async (width, height, scheme) => {
    if (last === undefined) throw new Error("no chapters");
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme });
    const stacked = width < 1100;
    try {
        await page.goto(`${inject("guide")}#${longest.slug}`);
        await statusOf(page);
        const nav = await wheelToEnd(page, "guide-nav");
        expect(nav.max).toBeGreaterThan(0);
        expect(nav.top).toBeGreaterThanOrEqual(nav.max - 1);
        const item = page.locator(`guide-nav sp-sidenav-item[value="${last.slug}"]`);
        // Stacked, the wheel goes on to scroll the page once the navigation is at its end.
        if (stacked) await item.scrollIntoViewIfNeeded();
        expect(await item.evaluate(element => {
            const box = element.getBoundingClientRect();
            const root = element.getRootNode();
            const target = (root instanceof ShadowRoot ? root : document).elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return target !== null && (element === target || element.contains(target) || target.contains(element));
        })).toBe(true);
        // Stacked, the prose is as tall as it is, and the page scrolls to its end.
        const prose = stacked ? null : await wheelToEnd(page, "guide-prose");
        if (prose !== null) {
            expect(prose.max).toBeGreaterThan(0);
            expect(prose.top).toBeGreaterThanOrEqual(prose.max - 1);
            expect(await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) - innerHeight)).toBeLessThanOrEqual(0);
        }
        else await page.locator("guide-prose").evaluate(element => element.scrollIntoView({ block: "end" }));
        // The prose's last line is in view, inside its panel.
        expect(await page.locator("guide-prose").evaluate(element => {
            const end = [...element.shadowRoot?.querySelectorAll("*") ?? []].reduce((bottom, child) => Math.max(bottom, child.getBoundingClientRect().bottom), 0);
            return end > 0 && end <= Math.min(element.getBoundingClientRect().bottom, innerHeight) + 1;
        })).toBe(true);
        await item.scrollIntoViewIfNeeded();
        // On its title, which is its link.
        await item.click({ position: { x: 24, y: 12 } });
        await page.waitForFunction(slug => location.hash === `#${slug}`, last.slug);
    } finally {
        await page.close();
    }
});

it("scrolls the prose by keyboard, with Page Down once it has the focus", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
    try {
        await page.goto(`${inject("guide")}#3-systems`);
        await statusOf(page);
        await page.locator("guide-prose").click({ position: { x: 20, y: 20 } });
        await page.keyboard.press("PageDown");
        await page.waitForFunction(() => (document.querySelector("guide-prose")?.scrollTop ?? 0) > 100);
        expect((await scrolled(page, "guide-prose")).top).toBeGreaterThan(100);
    } finally {
        await page.close();
    }
});
