// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Browser, Locator, Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { launch, statusOf } from "./page.test-helper.js";

let browser: Browser;
beforeAll(async () => {
    browser = await launch();
});
afterAll(async () => {
    await browser.close();
});

/** How far a tab strip's selection underline sits from its selected tab, in pixels, once it's settled. */
const offsetOf = async (page: Page, strip: Locator, tab: Locator): Promise<{ readonly left: number; readonly width: number }> => {
    await tab.click();
    await page.waitForTimeout(400);
    const underline = await strip.locator("#selection-indicator").boundingBox();
    const label = await tab.boundingBox();
    if (underline === null || label === null) throw new Error("the tab or its underline isn't shown");
    // `|| 0` reads a rounded -0 as 0.
    return { left: Math.round(underline.x - label.x) || 0, width: Math.round(underline.width - label.width) || 0 };
};

it("underlines each of the run window's tabs exactly under its label", async () => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    try {
        await page.goto(`${inject("guide")}#3-systems`);
        await statusOf(page);
        const strip = page.locator("guide-tabs sp-tabs");
        for (const tab of ["console", "output", "problems", "compiled"]) {
            expect(await offsetOf(page, strip, strip.locator(`sp-tab[value=${tab}]`)), tab).toEqual({ left: 0, width: 0 });
        }
    } finally {
        await page.close();
    }
});

it("underlines each of an example's file tabs exactly under its name", async () => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    try {
        await page.goto(`${inject("guide")}#11-traits-within-and-references`);
        await statusOf(page);
        const strip = page.locator("guide-files sp-tabs");
        const tabs = strip.locator("sp-tab");
        const count = await tabs.count();
        expect(count).toBeGreaterThan(1);
        for (let index = 0; index < count; index++) {
            expect(await offsetOf(page, strip, tabs.nth(index)), `file ${index}`).toEqual({ left: 0, width: 0 });
        }
    } finally {
        await page.close();
    }
});
