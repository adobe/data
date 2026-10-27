// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { chapters } from "../content/guide.js";
import { codeOf, launch, open, replaceCode, statusOf } from "./page.test-helper.js";

let browser: Browser;
beforeAll(async () => {
    browser = await launch();
});
afterAll(async () => {
    await browser.close();
});

const slugOf = (prefix: string): string => {
    const found = chapters.find(chapter => chapter.slug.startsWith(prefix));
    if (found === undefined) throw new Error(`no chapter ${prefix}`);
    return found.slug;
};

/**
 * Each lens in the editor: its chip's text and label, and the code line it stands above. The editor draws only the lines
 * in view, so it's scrolled from top to bottom to read every one.
 */
const lensesOf = (page: Page): Promise<readonly { readonly text: string; readonly label: string; readonly line: string; readonly stale: boolean }[]> =>
    page.evaluate(async () => {
        const root = document.querySelector("guide-editor")?.shadowRoot;
        const scroller = root?.querySelector(".cm-scroller");
        if (!(scroller instanceof HTMLElement)) return [];
        const found = new Map<string, { readonly text: string; readonly label: string; readonly line: string; readonly stale: boolean }>();
        for (let top = 0; ; top += scroller.clientHeight / 2) {
            scroller.scrollTop = top;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            for (const lens of root?.querySelectorAll(".cm-system-lens") ?? []) {
                const chip = lens.querySelector("button");
                const line = lens.nextElementSibling?.textContent ?? "";
                found.set(line, { text: chip?.textContent ?? "", label: chip?.getAttribute("aria-label") ?? "", line, stale: chip?.classList.contains("cm-system-stale") ?? false });
            }
            if (top + scroller.clientHeight >= scroller.scrollHeight) break;
        }
        scroller.scrollTop = 0;
        return [...found.values()];
    });

/** Waits for the editor's lenses to read `texts`, and gives them. */
const lensesReading = async (page: Page, texts: readonly string[]): ReturnType<typeof lensesOf> => {
    for (;;) {
        const lenses = await lensesOf(page);
        if (JSON.stringify(lenses.map(lens => lens.text)) === JSON.stringify(texts)) return lenses;
        await page.waitForTimeout(100);
    }
};

/** A lens's chip, by the name it opens, scrolled into view. */
const chipOf = async (page: Page, name: string) => {
    for (;;) {
        const chip = page.locator(`guide-editor .cm-system-chip[aria-label^="${name}:"]`);
        if (await chip.count() > 0) {
            await chip.scrollIntoViewIfNeeded();
            return chip;
        }
        await page.locator("guide-editor .cm-scroller").evaluate(scroller => { scroller.scrollTop += scroller.clientHeight / 2; });
        await page.waitForTimeout(50);
    }
};

/** The Compiled tab's expanded systems: each one's name, the backend its tabs show, and what its panel says. */
const expandedOf = (page: Page): Promise<readonly { readonly name: string; readonly backend: string; readonly note: string; readonly code: string }[]> =>
    page.evaluate(() => [...document.querySelector("guide-compiled")?.shadowRoot?.querySelectorAll("li:has(.details)") ?? []].map(item => ({
        name: item.querySelector(".name")?.textContent ?? "",
        backend: item.querySelector("[role=tab][aria-selected=true]")?.getAttribute("data-backend") ?? "",
        note: item.querySelector(".note")?.textContent ?? "",
        code: item.querySelector(".cm-content")?.textContent ?? "",
    })));

const chipLabels = ["JS · WASM · WGSL", "JS · WASM · WGSL", "as written · WGSL", "as written", "as written"];

it("marks each of chapter 14's systems above its call with what it compiles to, its tooltip saying why a backend gives none", async () => {
    const { page, errors } = await open(browser, `${inject("guide")}#${slugOf("14-")}`, "dark");
    try {
        await statusOf(page);
        const lenses = await lensesReading(page, chipLabels);
        expect(lenses.map(lens => lens.line.trim().slice(0, 30))).toEqual([
            "const move = System.create({ c", "const drift = System.create({ ", "const slow = System.create({ k", "const read = System.create({ o", "const spawn = System.create(({",
        ]);
        expect(lenses[0]?.label).toBe("move: JS compiled, WASM compiled, WGSL if declared kernel: \"gpu\". Show what it compiles to.");
        await (await chipOf(page, "spawn")).hover();
        const tip = page.locator("guide-editor .cm-system-tip");
        await tip.waitFor();
        expect(await tip.textContent()).toContain("JS: not compiled — per-run systems run as written; only row systems compile");
        expect(await tip.getAttribute("role")).toBe("tooltip");
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("opens a system in the Compiled tab from its mark, by click or by keyboard, at its WASM, and shows a per-run system's reason", async () => {
    const { page, errors } = await open(browser, `${inject("guide")}#${slugOf("14-")}`);
    try {
        await statusOf(page);
        await lensesReading(page, chipLabels);
        await (await chipOf(page, "move")).click();
        await page.waitForFunction(() => document.querySelector("guide-tabs")?.selected === "compiled");
        await page.waitForFunction(() => document.querySelector("guide-compiled")?.shadowRoot?.querySelector(".cm-content")?.textContent?.includes("(func $run") === true);
        expect(await expandedOf(page)).toEqual([expect.objectContaining({ name: "move", backend: "wasm", note: "" })]);
        expect((await expandedOf(page))[0]?.code).toContain("(param $start i32)");
        // The keyboard reaches a mark, and Enter opens it.
        await (await chipOf(page, "spawn")).focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelector("guide-compiled")?.shadowRoot?.querySelectorAll("li:has(.details)").length === 2);
        expect((await expandedOf(page)).find(item => item.name === "spawn")).toMatchObject({ backend: "js", note: "per-run systems run as written; only row systems compile", code: "" });
        // A system's line link shows it in the editor.
        await page.locator("guide-compiled li[data-key$='#drift'] .line").click();
        await page.waitForFunction(() => {
            const view = document.querySelector("guide-editor")?.shadowRoot?.querySelector(".cm-activeLine");
            return view?.textContent?.startsWith("const drift = System.create(") === true;
        });
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("marks an edit that adds kernel: false as written, with its reason, and keeps the last marks stale while an edit doesn't compile", async () => {
    const { page, errors } = await open(browser, `${inject("guide")}#${slugOf("14-")}`);
    try {
        await statusOf(page);
        await lensesReading(page, chipLabels);
        const original = await codeOf(page);
        await replaceCode(page, original.replace("const move = System.create({ components:", "const move = System.create({ kernel: false, components:"));
        await lensesReading(page, ["as written · WGSL", ...chipLabels.slice(1)]);
        await (await chipOf(page, "move")).click();
        await page.waitForFunction(() => document.querySelector("guide-compiled")?.shadowRoot?.querySelector(".note") !== null);
        expect((await expandedOf(page))[0]).toMatchObject({ name: "move", backend: "wgsl", note: expect.stringContaining("With `kernel: \"gpu\"`") });
        await page.locator("guide-compiled li[data-key$='#move'] [role=tab][data-backend=js]").click();
        await page.waitForFunction(() => document.querySelector("guide-compiled")?.shadowRoot?.querySelector(".note")?.textContent === "as written, because `kernel: false`");
        await replaceCode(page, original.replace("}, (row, { resources }) => {", "}, async (row, { resources }) => {"));
        await page.waitForFunction(() => document.querySelector("guide-editor")?.shadowRoot?.querySelector(".cm-system-stale") !== null);
        expect((await lensesOf(page)).every(lens => lens.stale)).toBe(true);
        expect(await page.locator("guide-compiled .stale").isVisible()).toBe(true);
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("opens chapter 16's GPU kernel at its WGSL", async () => {
    const { page, errors } = await open(browser, `${inject("guide")}#${slugOf("16-")}`);
    try {
        await statusOf(page);
        await lensesReading(page, ["JS · WASM · WGSL", "as written", "as written", "as written"]);
        await (await chipOf(page, "move")).click();
        await page.waitForFunction(() => document.querySelector("guide-compiled")?.shadowRoot?.querySelector(".cm-content")?.textContent?.includes("@group(0) @binding(0) var<storage, read_write> memory") === true);
        expect((await expandedOf(page))[0]).toMatchObject({ name: "move", backend: "wgsl", note: "" });
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("selects a system's backend by its badge, which expands a collapsed row at it, the tabs taking arrows, each controlling its panel", async () => {
    const { page, errors } = await open(browser, `${inject("guide")}#${slugOf("14-")}`);
    try {
        await statusOf(page);
        await lensesReading(page, chipLabels);
        await page.locator("guide-tabs sp-tab[value=compiled]").click();
        const drift = page.locator("guide-compiled li[data-key$='#drift']");
        await drift.locator("[role=tab][data-backend=wgsl]").click();
        await page.waitForFunction(() => document.querySelector("guide-compiled")?.shadowRoot?.querySelector("li[data-key$='#drift'] .details") !== null);
        expect((await expandedOf(page))[0]).toMatchObject({ name: "drift", backend: "wgsl", note: expect.stringContaining("With `kernel: \"gpu\"`") });
        const tabs = await drift.locator("[role=tab]").evaluateAll(items => items.map(item => [item.getAttribute("aria-selected"), item.getAttribute("tabindex"), item.getAttribute("aria-controls")]));
        const panel = await drift.locator("[role=tabpanel]").getAttribute("id");
        expect(tabs).toEqual([["false", "-1", panel], ["false", "-1", panel], ["true", "0", panel]]);
        expect(await drift.locator("[role=tabpanel]").getAttribute("aria-labelledby")).toBe(await drift.locator("[role=tab][data-backend=wgsl]").getAttribute("id"));
        await page.keyboard.press("ArrowLeft");
        await page.waitForFunction(() => document.querySelector("guide-compiled")?.shadowRoot?.querySelector("li[data-key$='#drift'] [aria-selected=true]")?.getAttribute("data-backend") === "wasm");
        expect(await page.evaluate(() => document.querySelector("guide-compiled")?.shadowRoot?.activeElement?.getAttribute("data-backend"))).toBe("wasm");
        // A collapsed row's badges are its status, none selected.
        expect(await page.locator("guide-compiled li[data-key$='#move'] [role=tab][aria-selected=true]").count()).toBe(0);
        // Each badge's tab lines up with the code it controls: there's no other row of tabs.
        expect(await page.locator("guide-compiled sp-tabs").count()).toBe(0);
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("keeps each lens above its line through an edit replacing the whole text, until the edit's build places it again", async () => {
    const { page } = await open(browser, `${inject("guide")}#${slugOf("14-")}`);
    try {
        await statusOf(page);
        const before = await lensesReading(page, chipLabels);
        const original = await codeOf(page);
        // Selecting it all and typing it again with a line more at its end replaces every line.
        await replaceCode(page, `${original}// One more line.\n`);
        const during = await lensesOf(page);
        expect(during.map(lens => lens.line)).toEqual(before.map(lens => lens.line));
    } finally {
        await page.close();
    }
});

it("shows chapter 20's kernel reading a shared component taking its archetype's value as a parameter of each call", async () => {
    const { page, errors } = await open(browser, `${inject("guide")}#${slugOf("20-")}`);
    try {
        await statusOf(page);
        await (await chipOf(page, "place")).click();
        await page.waitForFunction(() => document.querySelector("guide-compiled")?.shadowRoot?.querySelector(".cm-content")?.textContent?.includes("(func $run") === true);
        const [place] = await expandedOf(page);
        expect(place).toMatchObject({ name: "place", backend: "wasm", note: "" });
        expect(place?.code).toContain("(param $shared0_0 f64)");
        expect(place?.code).toContain("(param $shared0_1 f64)");
        await page.locator("guide-compiled li[data-key$='#place'] [role=tab][data-backend=js]").click();
        await page.waitForFunction(() => document.querySelector("guide-compiled")?.shadowRoot?.querySelector(".cm-content")?.textContent?.includes("shared[0]") === true);
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("compiles and marks a chapter's systems where the guide's service worker can't register, saying the host can't run it", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // A host that answers the service worker's script with a redirect, as a private Pages site does.
    await context.route(/service-worker/, route => route.fulfill({ status: 302, headers: { location: `${route.request().url()}?redirected` } }));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
        await page.goto(`${inject("guide")}#${slugOf("14-")}`);
        expect(await statusOf(page, /Compiled|Finished|Failed|rejected|failed/)).toBe("Compiled: this host can't run examples");
        await lensesReading(page, chipLabels);
        expect(errors).toEqual([]);
    } finally {
        await context.close();
    }
});
