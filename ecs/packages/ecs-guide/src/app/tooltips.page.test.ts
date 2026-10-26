// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Browser } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { numbered } from "../content/guide.js";
import { codeOf, launch, open, replaceCode, settled, statusOf, tooltipContrasts } from "./page.test-helper.js";

let browser: Browser;
beforeAll(async () => {
    browser = await launch();
});
afterAll(async () => {
    await browser.close();
});

const systems = numbered(3);

it.each(["dark", "light"] as const)("shows TypeScript's and the ECS build's problems in the editor's tooltips legibly, at 4.5:1, in the %s scheme", async scheme => {
    if (systems === undefined) throw new Error("no chapter 3");
    const { page } = await open(browser, `${inject("guide")}#${systems.slug}`, scheme);
    try {
        const before = await statusOf(page);
        const original = await codeOf(page);
        await replaceCode(page, original
            .replace("}, (row, { resources }) => {\n    // Values", "}, async (row, { resources }) => {\n    // Values")
            .replace("export const main = async", "const wrong: number = \"text\";\nexport const main = async"));
        // The edit's check and build land before the pointer rests, so it hovers what they marked.
        expect(await settled(page, before)).toMatch(/rejected/);
        await page.locator("guide-editor .cm-problem-typescript").first().waitFor();
        for (const kind of ["typescript", "build"] as const) {
            const mark = page.locator(`guide-editor .cm-problem-${kind}`).first();
            await mark.waitFor();
            await mark.scrollIntoViewIfNeeded();
            await page.mouse.move(0, 0);
            await mark.hover();
            await page.locator("guide-editor .cm-tooltip-lint").waitFor();
            const contrasts = await tooltipContrasts(page);
            expect(contrasts.length, kind).toBeGreaterThan(0);
            for (const { text, ratio } of contrasts) expect(ratio, `${kind}: "${text}"`).toBeGreaterThanOrEqual(4.5);
        }
    } finally {
        await page.close();
    }
});

it("keeps a problem's tooltip shown, in one shape, as checks and builds mark the problems again under the resting pointer", async () => {
    if (systems === undefined) throw new Error("no chapter 3");
    const { page } = await open(browser, `${inject("guide")}#${systems.slug}`);
    try {
        const before = await statusOf(page);
        const original = await codeOf(page);
        await replaceCode(page, original.replace("export const main = async", "const wrong: number = \"text\";\nexport const main = async"));
        await settled(page, before);
        const mark = page.locator("guide-editor .cm-problem-typescript").first();
        await mark.waitFor();
        await mark.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await mark.hover();
        await page.locator("guide-editor .cm-tooltip-lint").waitFor();
        // The same problems marked again, as each check and build does, and then one more: the tooltip comes back.
        await page.evaluate(() => {
            const editor = document.querySelector("guide-editor");
            if (editor !== null) editor.problems = [...editor.problems];
        });
        await page.waitForTimeout(800);
        expect(await page.locator("guide-editor .cm-tooltip-lint").count()).toBe(1);
        await page.evaluate(() => {
            const editor = document.querySelector("guide-editor");
            const [first] = editor?.problems ?? [];
            if (editor !== null && first !== undefined) editor.problems = [...editor.problems, { ...first, kind: "build", message: "another" }];
        });
        await page.locator("guide-editor .cm-tooltip-lint li:nth-child(2)").waitFor();
        // One tooltip, holding the problems, and the type of what's there above them.
        expect(await page.locator("guide-editor .cm-tooltip").count()).toBe(1);
        expect(await page.locator("guide-editor .cm-tooltip .cm-diagnostic").count()).toBe(2);
    } finally {
        await page.close();
    }
});
