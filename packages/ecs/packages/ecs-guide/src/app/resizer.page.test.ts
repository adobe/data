// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { launch, statusOf } from "./page.test-helper.js";

let browser: Browser;
beforeAll(async () => {
    browser = await launch();
});
afterAll(async () => {
    await browser.close();
});

/** The splitter between the prose and the example: its place, attributes, and the widths of both sides. */
const splitterOf = (page: Page) => page.evaluate(() => {
    const columns = document.querySelector("sp-split-view.columns");
    const splitter = columns?.shadowRoot?.querySelector("#splitter");
    const box = splitter?.getBoundingClientRect();
    return {
        x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2, width: box?.width ?? 0,
        role: splitter?.getAttribute("role") ?? null, orientation: splitter?.getAttribute("aria-orientation") ?? null,
        value: splitter?.getAttribute("aria-valuenow") ?? null, tabindex: splitter?.getAttribute("tabindex") ?? null,
        prose: document.querySelector("guide-prose")?.getBoundingClientRect().width ?? 0,
        example: document.querySelector(".example")?.getBoundingClientRect().width ?? 0,
    };
});

const drag = async (page: Page, by: number): Promise<void> => {
    const { x, y } = await splitterOf(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + by / 2, y, { steps: 4 });
    await page.mouse.move(x + by, y, { steps: 4 });
    await page.mouse.up();
};

it("resizes the prose beside the example by dragging and keying its splitter, within each side's least width, and keeps it for the reader", async () => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    try {
        await page.goto(`${inject("guide")}#14-kernels`);
        await statusOf(page);
        const start = await splitterOf(page);
        expect(start).toMatchObject({ role: "separator", orientation: "vertical", tabindex: "0" });
        expect(Number(start.value)).toBeGreaterThan(30);
        await drag(page, -150);
        const dragged = await splitterOf(page);
        // The pointer moves the splitter by as much, give or take where on it the drag took hold.
        expect(Math.abs(dragged.prose - (start.prose - 150))).toBeLessThan(12);
        expect(Math.abs(dragged.example - (start.example + 150))).toBeLessThan(12);
        expect(Number(dragged.value)).toBeLessThan(Number(start.value));
        // The keyboard moves it too, once it has the focus.
        await page.locator("sp-split-view.columns").evaluate(element => {
            const splitter = element.shadowRoot?.querySelector("#splitter");
            if (splitter instanceof HTMLElement) splitter.focus();
        });
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.waitForFunction(width => (document.querySelector("guide-prose")?.getBoundingClientRect().width ?? 0) > width + 5, dragged.prose);
        // Neither side goes below its least width, less the gutter its half of the splitter takes.
        await drag(page, -2000);
        expect((await splitterOf(page)).prose).toBeGreaterThanOrEqual(320 - 16);
        await drag(page, 2000);
        const widest = await splitterOf(page);
        expect(widest.example).toBeGreaterThanOrEqual(440 - 16);
        // The editor measures itself again: its lines fill its new width.
        expect(await page.locator("guide-editor .cm-content").evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(200);
        await page.reload();
        await statusOf(page);
        expect(Math.abs((await splitterOf(page)).prose - widest.prose)).toBeLessThan(2);
    } finally {
        await page.close();
    }
});

it("has no splitter to resize while the page stacks the prose above the example", async () => {
    const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
    try {
        await page.goto(`${inject("guide")}#14-kernels`);
        await statusOf(page);
        await page.waitForFunction(() => document.querySelector("sp-split-view.columns")?.hasAttribute("resizable") === false);
        const stacked = await splitterOf(page);
        expect([stacked.tabindex, stacked.width]).toEqual([null, 0]);
        expect(stacked.prose).toBeGreaterThan(900);
        expect(stacked.example).toBeGreaterThan(900);
    } finally {
        await page.close();
    }
});
