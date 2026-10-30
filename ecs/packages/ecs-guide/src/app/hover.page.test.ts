// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { readFileSync } from "node:fs";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { codeOf, hoverWord, launch, open, replaceCode, settled, statusOf, tooltipContrasts } from "./page.test-helper.js";

let browser: Browser;
beforeAll(async () => {
    browser = await launch();
});
afterAll(async () => {
    await browser.close();
});

/** What the hover tooltip shows once it's up: its signature and its documentation, as text. */
const hovered = async (page: Page): Promise<{ readonly signature: string; readonly documentation: string; readonly tags: string }> => {
    await page.locator("guide-editor .cm-quick-info").waitFor();
    return page.locator("guide-editor .cm-quick-info").evaluate(element => ({
        signature: element.querySelector(".cm-quick-signature")?.textContent ?? "",
        documentation: element.querySelector(".cm-quick-doc")?.textContent ?? "",
        tags: [...element.querySelectorAll(".cm-quick-tag")].map(tag => tag.textContent).join("\n"),
    }));
};

/** Moves the pointer off the editor, so its hover tooltip goes. */
const away = async (page: Page): Promise<void> => {
    await page.mouse.move(0, 0);
    await page.locator("guide-editor .cm-quick-info").waitFor({ state: "detached" });
};

/** The TSDoc of the declaration that `signature` starts in a source of the package, as text: what its reference publishes. */
const tsdocOf = (file: string, signature: string): string => {
    const source = readFileSync(new URL(`../../../ecs/src/${file}`, import.meta.url), "utf8");
    const end = source.lastIndexOf("*/", source.indexOf(signature));
    const start = source.lastIndexOf("/**", end);
    return source.slice(start + 3, end).split("\n").map(line => line.replace(/^\s*\* ?/, "")).join("\n");
};
/** Text as it reads, whatever its markup: without markdown's list marks and code ticks, and its spaces as one. */
const reads = (text: string): string => text.replace(/^\s*- /gm, "").replace(/`/g, "").replace(/\s+/g, " ").trim();

it.each(["dark", "light"] as const)("shows the types of what's hovered, System.create's TSDoc as its reference publishes it, legibly in the %s scheme", async scheme => {
    const { page, errors } = await open(browser, `${inject("guide")}#14-kernels`, scheme);
    try {
        await statusOf(page);
        await hoverWord(page, "const move = System.create", "create");
        const create = await hovered(page);
        expect(create.signature).toMatch(/^function create</);
        expect(reads(create.documentation)).toBe(reads(tsdocOf("interface/system/create.ts", "export function create<const D extends Declaration")));
        for (const { ratio, text } of await tooltipContrasts(page, ".cm-tooltip")) expect(ratio, text).toBeGreaterThanOrEqual(4.5);
        await away(page);
        await hoverWord(page, "const position = Symbol()", "position");
        expect((await hovered(page)).signature).toBe("const position: typeof position");
        await away(page);
        await hoverWord(page, "const moved: string[]", "moved");
        expect((await hovered(page)).signature).toBe("const moved: string[]");
        await away(page);
        await hoverWord(page, "await using world = World.create()", "create");
        const world = await hovered(page);
        expect(world.signature).toMatch(/^const create: /);
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("shows only what's under the pointer last, a reply for an earlier place dropped", async () => {
    const { page } = await open(browser, `${inject("guide")}#14-kernels`);
    try {
        await statusOf(page);
        await hoverWord(page, "const position = Symbol()", "position");
        await page.waitForTimeout(320);
        await hoverWord(page, "const velocity = Symbol()", "velocity");
        await page.waitForTimeout(800);
        expect(await page.locator("guide-editor .cm-quick-info").count()).toBe(1);
        expect((await hovered(page)).signature).toBe("const velocity: typeof velocity");
    } finally {
        await page.close();
    }
});

it("shows a problem and the type of what's under the pointer together, and shows both at the cursor by keyboard", async () => {
    const { page } = await open(browser, `${inject("guide")}#14-kernels`);
    try {
        await statusOf(page);
        const original = await codeOf(page);
        await replaceCode(page, original.replace("const moved: string[] = [];", "const moved: string[] = [];\nconst count: number = moved;"));
        // Once the edit's build lands, so its marks don't move the lines under the pointer.
        await settled(page, "Finished");
        const mark = page.locator("guide-editor .cm-problem-typescript").first();
        await mark.waitFor();
        await mark.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await mark.hover();
        await page.locator("guide-editor .cm-tooltip-lint").waitFor();
        await page.locator("guide-editor .cm-quick-info").waitFor();
        // One tooltip holds both, one above the other.
        const boxes = await page.evaluate(() => {
            const root = document.querySelector("guide-editor")?.shadowRoot;
            const [info, lint] = [root?.querySelector(".cm-quick-info"), root?.querySelector(".cm-tooltip-lint")].map(element => element?.getBoundingClientRect());
            return { overlap: info !== undefined && lint !== undefined && info.bottom > lint.top + 1 && lint.bottom > info.top + 1, tooltips: root?.querySelectorAll(".cm-tooltip").length ?? 0 };
        });
        expect(boxes).toEqual({ overlap: false, tooltips: 1 });
        await page.mouse.move(0, 0);
        // The keyboard shows what's at the cursor: Ctrl or Cmd+K, then I.
        await page.locator("guide-editor .cm-content").click();
        await page.evaluate(() => {
            const editor = document.querySelector("guide-editor");
            if (editor !== null) editor.revealed = { from: 1, to: 1, column: 1, serial: 99 };
        });
        await hoverWord(page, "const position = Symbol()", "position");
        await page.mouse.down();
        await page.mouse.up();
        await page.mouse.move(0, 0);
        await page.keyboard.press("ControlOrMeta+K");
        await page.keyboard.press("ControlOrMeta+I");
        await page.locator("guide-editor .cm-quick-keyboard").waitFor();
        expect(await page.locator("guide-editor .cm-quick-keyboard .cm-quick-signature").textContent()).toBe("const position: typeof position");
        await page.keyboard.press("Escape");
        await page.locator("guide-editor .cm-quick-keyboard").waitFor({ state: "detached" });
    } finally {
        await page.close();
    }
});

it("re-resolves a hover once a build's lens moves the lines under the resting pointer, never leaving a stale one", async () => {
    const { page } = await open(browser, `${inject("guide")}#14-kernels`);
    try {
        await statusOf(page);
        await page.waitForFunction(() => (document.querySelector("guide-editor")?.systems.length ?? 0) > 0);
        await hoverWord(page, "const velocity = Symbol()", "velocity");
        expect((await hovered(page)).signature).toBe("const velocity: typeof velocity");
        // A build lands with a system at the pointer's line, whose lens moves the line down from under the pointer.
        await page.evaluate(() => {
            const editor = document.querySelector("guide-editor");
            if (editor === null) return;
            const none = { kind: "none", reason: "per-run systems run as written; only row systems compile" } as const;
            editor.systems = [...editor.systems, { start: 0, line: 5, column: 1, binding: "extra", runs: "Its body as written", js: none, wasm: none, wgsl: none }];
        });
        // What the tooltip shows is what's under the pointer now: the new lens, which has no type, so none.
        await page.waitForTimeout(800);
        const shown = await page.locator("guide-editor .cm-quick-info .cm-quick-signature").allTextContents();
        expect(shown).not.toContain("const velocity: typeof velocity");
        await hoverWord(page, "const velocity = Symbol()", "velocity");
        expect((await hovered(page)).signature).toBe("const velocity: typeof velocity");
    } finally {
        await page.close();
    }
});
