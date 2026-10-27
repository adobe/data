// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Browser } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { chapters, numbered } from "../content/guide.js";
import { codeOf, consoleOf, launch, open, replaceCode, statusOf, unversioned } from "./page.test-helper.js";

let browser: Browser;
beforeAll(async () => {
    browser = await launch();
});
afterAll(async () => {
    await browser.close();
});

const chapter = (number: number) => {
    const found = numbered(number);
    if (found === undefined) throw new Error(`no chapter ${number}`);
    return found;
};

it.each(chapters.filter(chapter => chapter.files.length > 0).map(item => [item.slug, item.files.length, item.expected, item.part === "UI"]))("shows %s, and runs its program in a frame that's cross-origin isolated, printing what the guide shows", async (slug, files, expected, animates) => {
    const { page, errors } = await open(browser, `${inject("guide")}#${slug}`);
    try {
        await page.waitForFunction(lines => document.querySelector("guide-console")?.logged.entries.length === lines, expected.split("\n").length - 1);
        // An animation runs until its frame goes.
        expect(await statusOf(page, /Finished|Running|Failed/)).toBe(animates ? "Running…" : "Finished");
        expect(unversioned(await consoleOf(page))).toBe(unversioned(expected));
        expect(await page.evaluate(() => document.querySelector("guide-tabs")?.selected)).toBe(animates ? "output" : "console");
        expect(await page.locator("guide-problems li").count()).toBe(0);
        expect(await page.locator("guide-nav sp-sidenav-item[selected]").getAttribute("value")).toBe(slug);
        expect(await page.locator("guide-files sp-tab").count()).toBe(files);
        expect(await page.locator("guide-files").isVisible()).toBe(files > 1);
        const frame = page.frames().find(item => item !== page.mainFrame());
        expect(await frame?.evaluate(() => crossOriginIsolated)).toBe(true);
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("runs an edit again as it's typed, with what it prints now, and resets it to the guide's", async () => {
    const systems = chapter(3);
    const { page, errors } = await open(browser, `${inject("guide")}#${systems.slug}`);
    try {
        expect(await statusOf(page)).toBe("Finished");
        const original = await codeOf(page);
        await replaceCode(page, original.replace(`console.log("at", places.sort((a, b) => a - b));`, `console.log("went to", places.sort((a, b) => a - b));`));
        await page.waitForFunction(() => document.querySelector("guide-console")?.logged.entries[0]?.text.startsWith("went to") === true);
        expect(await statusOf(page)).toBe("Finished");
        expect((await consoleOf(page)).split("\n")[0]).toBe("went to [ 0, 1, 5 ]");
        expect(await page.locator("guide-reset sp-button").getAttribute("disabled")).toBeNull();
        await page.locator("guide-reset sp-button").click();
        await page.waitForFunction(() => document.querySelector("guide-console")?.logged.entries[0]?.text.startsWith("at ") === true);
        expect(unversioned(await consoleOf(page))).toBe(unversioned(systems.expected));
        expect(await codeOf(page)).toBe(original);
        expect(await page.locator("guide-reset sp-button").getAttribute("disabled")).not.toBeNull();
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it("shows a run left unawaited that rejects as an error nothing caught, marked in the console, and fails the run", async () => {
    const systems = chapter(3);
    const { page } = await open(browser, `${inject("guide")}#${systems.slug}`);
    try {
        await statusOf(page);
        const code = (await codeOf(page)).replace("await world.run(countThenFail).catch((error: unknown) => console.log(String(error)));", "void world.run(countThenFail);");
        await replaceCode(page, code);
        expect(await statusOf(page, /Failed/)).toBe("Failed: see Console");
        const uncaught = await page.evaluate(() => document.querySelector("guide-console")?.logged.entries.filter(entry => entry.level === "uncaught").map(entry => entry.text));
        expect(uncaught).toEqual([expect.stringMatching(/^Uncaught \(in promise\) Error: System "fail" .*failed: broken$/)]);
        expect(await page.locator("guide-console").evaluate(element => element.shadowRoot?.querySelectorAll("li.level-uncaught").length)).toBe(1);
    } finally {
        await page.close();
    }
});

it("counts on the Console's tab what's logged while another tab shows, marking errors, until the Console shows again", async () => {
    const systems = chapter(3);
    const { page, errors } = await open(browser, `${inject("guide")}#${systems.slug}`);
    const consoleBadge = (): Promise<unknown> => page.evaluate(() => {
        const badge = document.querySelector("guide-tabs")?.shadowRoot?.querySelector("#tab-console sp-badge");
        return badge instanceof HTMLElement && !badge.hidden ? { text: badge.textContent, variant: badge.getAttribute("variant") } : null;
    });
    try {
        await statusOf(page);
        expect(await consoleBadge()).toBeNull();
        await page.locator("guide-tabs sp-tab[value=output]").click();
        await page.waitForFunction(() => document.querySelector("guide-tabs")?.selected === "output");
        const original = await codeOf(page);
        await replaceCode(page, original.replace(`console.log("at", places.sort((a, b) => a - b));`, `console.log("went to", places.sort((a, b) => a - b));`));
        await page.waitForFunction(() => document.querySelector("guide-console")?.logged.entries[0]?.text.startsWith("went to") === true);
        await statusOf(page, /Finished/);
        expect(await consoleBadge()).toEqual({ text: String(systems.expected.split("\n").length - 1), variant: "neutral" });
        expect(await page.locator("guide-tabs sp-tab[value=console]").getAttribute("aria-label")).toBe(`Console, ${systems.expected.split("\n").length - 1} new lines`);
        await replaceCode(page, original.replace("await world.run(countThenFail).catch((error: unknown) => console.log(String(error)));", "void world.run(countThenFail);"));
        await statusOf(page, /Failed/);
        expect(await consoleBadge()).toMatchObject({ variant: "negative" });
        await page.locator("guide-tabs sp-tab[value=console]").click();
        await page.waitForFunction(() => document.querySelector("guide-tabs")?.selected === "console");
        expect(await consoleBadge()).toBeNull();
        expect(await page.locator("guide-tabs [role=tabpanel][data-shown]").getAttribute("id")).toBe("panel-console");
        // The rejection nothing caught is the frame's own console's error too.
        expect(errors).toEqual([expect.stringMatching(/^System "fail" .*failed: broken$/)]);
    } finally {
        await page.close();
    }
});

it.each([[21, "div"], [22, "canvas"]] as const)("renders chapter %i's animation into the Output tab, each frame, and stops it with its frame", async (number, rendered) => {
    const { page, errors } = await open(browser, `${inject("guide")}#${chapter(number).slug}`);
    try {
        await page.waitForFunction(() => document.querySelector("guide-tabs")?.selected === "output");
        const frame = page.frames().find(item => item !== page.mainFrame());
        if (frame === undefined) throw new Error("no frame");
        // What the frame shows: the dots' places, or the canvas's pixels, summed.
        const drawn = (): Promise<{ readonly count: number; readonly sum: number }> => frame.evaluate(kind => {
            const output = document.querySelector("#output");
            if (kind === "div") {
                const dots = [...output?.querySelectorAll(":scope > div > div") ?? []];
                return { count: dots.length, sum: dots.reduce((total, dot) => total + dot.getBoundingClientRect().left, 0) };
            }
            const canvas = output?.querySelector("canvas");
            const context = canvas?.getContext("2d");
            if (canvas === null || canvas === undefined || context === null || context === undefined) return { count: 0, sum: 0 };
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let sum = 0;
            for (let index = 0; index < pixels.length; index += 97) sum += (pixels[index] ?? 0) * (index % 1009);
            return { count: 1, sum };
        }, rendered);
        await frame.waitForFunction(kind => (document.querySelector("#output")?.querySelectorAll(kind).length ?? 0) > 0, rendered);
        await page.waitForFunction(lines => document.querySelector("guide-console")?.logged.entries.length === lines, chapter(number).expected.split("\n").length - 1);
        const first = await drawn();
        await page.waitForTimeout(250);
        const later = await drawn();
        // The traced particle is gone, and its dot with it.
        expect(first.count).toBe(rendered === "div" ? 59 : 1);
        expect(later.count).toBe(first.count);
        expect(later.sum).not.toBe(first.sum);
        expect(await statusOf(page, /Running/)).toBe("Running…");
        // Another chapter shown replaces the frame, and the world and loop it held go with it.
        const resources = chapter(1);
        await page.locator("guide-nav sp-sidenav-item[value='1-resources']").click();
        // Resources' own output, not the status, which still reads Systems' "Finished" until Resources' run starts.
        await page.waitForFunction(lines => document.querySelector("guide-console")?.logged.entries.length === lines, resources.expected.split("\n").length - 1);
        await statusOf(page, /Finished/);
        expect(frame.isDetached()).toBe(true);
        expect(page.frames().filter(item => item !== page.mainFrame())).toHaveLength(1);
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

// Flaky on CI's runners, which runs no flaky test: run locally until it's hardened (`followups.md`, Correctness).
it.skipIf(process.env["CI"] !== undefined)("runs a chapter shown again once, in one frame, printing what the guide shows once", async () => {
    const systems = chapter(3);
    const { page, errors } = await open(browser, `${inject("guide")}#${systems.slug}`);
    try {
        await statusOf(page, /Finished/);
        await page.locator("guide-nav sp-sidenav-item[value='1-resources']").click();
        await statusOf(page, /Finished/);
        await page.evaluate(() => {
            const root = document.querySelector("guide-output")?.shadowRoot;
            const framed: string[] = [];
            Reflect.set(globalThis, "framed", framed);
            if (root !== null && root !== undefined) new MutationObserver(records => {
                for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLIFrameElement) {
                    const status = document.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? "";
                    framed.push(`${node.src.replace(/^.*ecs-guide-runs\/[^/]+\//, "")} at ${location.hash}, ${status}, ${Math.round(performance.now())} ms`);
                }
            }).observe(root, { childList: true });
        });
        await page.locator(`guide-nav sp-sidenav-item[value='${systems.slug}']`).click();
        await page.waitForFunction(lines => document.querySelector("guide-console")?.logged.entries.length === lines, systems.expected.split("\n").length - 1);
        await statusOf(page, /Finished/);
        await page.waitForTimeout(1000);
        // The frames added while the chapter was shown again, by address, so a failure says which ran.
        const framed: unknown = await page.evaluate(() => Reflect.get(globalThis, "framed"));
        expect(Array.isArray(framed) ? framed.length : -1, JSON.stringify(framed)).toBe(1);
        expect(unversioned(await consoleOf(page))).toBe(unversioned(systems.expected));
        expect(errors).toEqual([]);
    } finally {
        await page.close();
    }
});

it.each([
    ["a loop that never ends", 3, "export const main = async (): Promise<void> => {", "export const main = async (): Promise<void> => {\n    for (let i = 0; i < 10; i--) {}", /^Uncaught RangeError: This loop ran for over 1 s; the run stopped$/],
    ["a recursion that takes too long", 3, "export const main = async (): Promise<void> => {", "const both = (n: number): number => n <= 0 ? 1 : both(n - 1) + both(n - 1);\nexport const main = async (): Promise<void> => {\n    both(60);", /^Uncaught RangeError: These calls ran for over 1 s; the run stopped$/],
    ["a loop in a system's body", 14, "    row[velocity] = Vec3.scale(row[velocity], 0.5);", "    while (row[velocity][0] > 0) row[velocity] = Vec3.scale(row[velocity], 1);", /^Uncaught Error: System "slow" .*failed: This loop ran for over 1 s; the run stopped$/],
] as const)("stops %s, keeping the page responsive, and runs the next edit", async (_name, number, from, to, failure) => {
    const example = chapter(number);
    const { page } = await open(browser, `${inject("guide")}#${example.slug}`);
    try {
        await statusOf(page, /Finished/);
        const original = await codeOf(page);
        const code = original.replace(from, to);
        expect(code).not.toBe(original);
        await replaceCode(page, code);
        expect(await statusOf(page, /Failed/)).toBe("Failed: see Console");
        const uncaught = await page.evaluate(() => document.querySelector("guide-console")?.logged.entries.filter(entry => entry.level === "uncaught").map(entry => entry.text) ?? []);
        expect(uncaught).toContainEqual(expect.stringMatching(failure));
        // The page went on: it answers at once, and runs the guide's code again.
        const started = Date.now();
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
        expect(Date.now() - started).toBeLessThan(500);
        await page.locator("guide-reset sp-button").click();
        await page.waitForFunction(lines => document.querySelector("guide-console")?.logged.entries.length === lines, example.expected.split("\n").length - 1);
        expect(await statusOf(page, /Finished/)).toBe("Finished");
    } finally {
        await page.close();
    }
});

it("shows TypeScript's error in the list and in the editor, where it is", async () => {
    const resources = chapter(1);
    const { page } = await open(browser, `${inject("guide")}#${resources.slug}`);
    try {
        await statusOf(page);
        const code = (await codeOf(page)).replace("World.create({ [gravity]: -1.6 })", "World.create({ [gravity]: \"low\" })");
        await replaceCode(page, code);
        await page.waitForFunction(() => document.querySelector("guide-tabs")?.badges.problems.count === 1);
        await page.locator("guide-tabs sp-tab[value=problems]").click();
        const problem = page.locator("guide-problems li[data-kind=typescript]");
        await problem.first().waitFor();
        const line = code.split("\n").findIndex(text => text.includes("\"low\"")) + 1;
        expect(await problem.first().getAttribute("data-line")).toBe(String(line));
        expect(await problem.first().locator(".message").textContent()).toMatch(/not assignable to type 'number'/);
        await page.locator("guide-editor .cm-problem-typescript").first().waitFor();
        expect(await page.locator("guide-editor .cm-problem-typescript").first().textContent()).toContain("gravity");
    } finally {
        await page.close();
    }
});

it("shows what the ECS build rejects as its own problem, and runs nothing", async () => {
    const systems = chapter(3);
    const { page } = await open(browser, `${inject("guide")}#${systems.slug}`);
    try {
        await statusOf(page);
        const code = (await codeOf(page)).replace("(row, { resources }) => {\n    // Values", "async (row, { resources }) => {\n    // Values");
        await replaceCode(page, code);
        expect(await statusOf(page, /rejected/)).toBe("The ECS build rejected it: see Problems");
        expect(await page.evaluate(() => document.querySelector("guide-tabs")?.badges.problems)).toEqual({ count: await page.locator("guide-problems li").count(), errors: true });
        await page.locator("guide-tabs sp-tab[value=problems]").click();
        const problem = page.locator("guide-problems li[data-kind=build]");
        expect(await problem.locator(".kind").textContent()).toBe("ECS build");
        expect(await problem.locator(".message").textContent()).toContain("a body can't be async");
        expect(await problem.getAttribute("data-line")).toBe(String(code.split("\n").findIndex(text => text.includes("async (row")) + 1));
        await page.locator("guide-editor .cm-problem-build").first().waitFor();
    } finally {
        await page.close();
    }
});

it("shows lines in the editor from the prose's link, again as it's followed again, and a file's from its tab", async () => {
    const resources = chapter(1);
    const { page } = await open(browser, `${inject("guide")}#${resources.slug}`);
    try {
        await statusOf(page);
        const link = page.locator("guide-prose a[href$='/L14-L23']");
        await link.click();
        await page.waitForFunction(() => document.querySelector("guide-editor")?.revealed?.from === 14);
        const first = await page.evaluate(() => document.querySelector("guide-editor")?.revealed);
        expect(first).toMatchObject({ from: 14, to: 23 });
        expect(await page.evaluate(() => location.hash)).toBe("#1-resources/01-resources.ts/L14-L23");
        // Followed again, with the address already naming them, it shows them again.
        await link.click();
        await page.waitForFunction(serial => (document.querySelector("guide-editor")?.revealed?.serial ?? 0) > serial, first?.serial ?? 0);
        await page.locator("guide-nav sp-sidenav-item[value='11-traits-within-and-references']").click();
        await statusOf(page, /Finished/);
        await page.locator("guide-files sp-tab[value='1']").click();
        await page.waitForFunction(() => document.querySelector("guide-editor")?.file.name === "11-traits.type-test.ts");
    } finally {
        await page.close();
    }
});

it("follows the system's dark color scheme, and says whether this browser has WebGPU in the GPU chapter", async () => {
    const { page } = await open(browser, `${inject("guide")}#${chapter(16).slug}`, "dark");
    try {
        await statusOf(page);
        expect(await page.locator("sp-theme").getAttribute("color")).toBe("dark");
        const note = page.locator("guide-note");
        expect(await note.isVisible()).toBe(true);
        await page.waitForFunction(() => !/Checking/.test(document.querySelector("guide-note")?.shadowRoot?.textContent ?? "Checking"));
        expect(await page.evaluate(() => document.querySelector("guide-note")?.shadowRoot?.textContent)).toMatch(/This browser (has|has no) WebGPU/);
        await page.locator("guide-nav sp-sidenav-item[value='1-resources']").click();
        await page.waitForFunction(() => document.querySelector("guide-note")?.hidden === true);
    } finally {
        await page.close();
    }
});

it("shows a compiler that failed to load as a problem, and loads it again for the next edit", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let blocked = true;
    await context.route(/transform\.wasm32-wasip1.*\.wasm/, route => blocked ? route.abort() : route.continue());
    const page = await context.newPage();
    try {
        await page.goto(`${inject("guide")}#3-systems`);
        expect(await statusOf(page, /compiler failed/)).toBe("The compiler failed: see Problems");
        expect(await page.locator("guide-problems li[data-kind=build] .message").textContent()).toMatch(/^The compiler failed to load: /);
        blocked = false;
        await page.locator("guide-editor .cm-content").click();
        await page.keyboard.press("End");
        await page.keyboard.insertText(" ");
        expect(await statusOf(page, /Finished/)).toBe("Finished");
        expect(await page.locator("guide-problems li").count()).toBe(0);
    } finally {
        await context.close();
    }
});

it("shows TypeScript's worker that failed to load as a problem, and still runs the program", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route(/assets\/typescript-[\w-]+\.js$/, route => route.abort());
    const page = await context.newPage();
    try {
        await page.goto(`${inject("guide")}#3-systems`);
        expect(await statusOf(page)).toBe("Finished");
        await page.locator("guide-tabs sp-tab[value=problems]").click();
        await page.locator("guide-problems li[data-kind=typescript]").waitFor();
        expect(await page.locator("guide-problems li[data-kind=typescript] .message").textContent()).toBe("TypeScript failed to load: TypeScript's worker didn't load");
    } finally {
        await context.close();
    }
});

it.each([[1920, 1080], [1400, 900], [1024, 768], [390, 844]])("shows Setup's code whole at %i×%i, and the page doesn't scroll sideways", async (width, height) => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
        await page.goto(`${inject("guide")}#setup`);
        await page.locator("guide-prose pre").first().waitFor();
        const clipped = await page.evaluate(() => [...document.querySelector("guide-prose")?.shadowRoot?.querySelectorAll("pre") ?? []].filter(pre => pre.scrollWidth > pre.clientWidth + 1).length);
        expect(clipped).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
        await page.close();
    }
});

it("starts the compiler's worker again by itself when it fails to load, saying it's retrying, and gives what failed once the retries do", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Twice: the service worker passes a request the network failed on once more.
    let failures = 2;
    await context.route(/assets\/compiler-main-[\w-]+\.js$/, route => failures-- > 0 ? route.abort() : route.continue());
    const page = await context.newPage();
    try {
        const seen: string[] = [];
        page.on("console", () => {});
        await page.goto(`${inject("guide")}#3-systems`);
        await page.waitForFunction(() => {
            const text = document.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? "";
            const recorded: unknown = Reflect.get(globalThis, "seenStatus");
            const all = Array.isArray(recorded) ? recorded : [];
            if (all.at(-1) !== text) all.push(text);
            Reflect.set(globalThis, "seenStatus", all);
            return /Finished/.test(text);
        }, null, { polling: 50, timeout: 30000 });
        seen.push(...await page.evaluate(() => { const recorded: unknown = Reflect.get(globalThis, "seenStatus"); return Array.isArray(recorded) ? recorded.map(String) : []; }));
        expect(seen).toContain("Retrying the compiler…");
        expect(seen.at(-1)).toBe("Finished");
        failures = Infinity;
        await page.reload();
        expect(await statusOf(page, /compiler failed/)).toBe("The compiler failed: see Problems");
        expect(await page.locator("guide-problems li[data-kind=build] .message").textContent()).toMatch(/^The compiler failed to load: .*compiler-main-[\w-]+\.js/);
    } finally {
        await context.close();
    }
});

it.each(["light", "dark"] as const)("draws the editor's caret and selection where they show, in the %s scheme", async scheme => {
    const { page } = await open(browser, `${inject("guide")}#1-resources`, scheme);
    try {
        await statusOf(page);
        await page.locator("guide-editor .cm-content").click();
        await page.locator("guide-editor .cm-cursor").first().waitFor({ state: "attached" });
        const colors = await page.evaluate(() => {
            const root = document.querySelector("guide-editor")?.shadowRoot;
            const style = (selector: string) => root?.querySelector(selector) === null || root === undefined || root === null ? null : getComputedStyle(root.querySelector(selector) ?? document.body);
            return {
                caret: style(".cm-cursor")?.borderLeftColor, width: style(".cm-cursor")?.borderLeftWidth,
                background: style(".cm-editor")?.backgroundColor, activeLine: style(".cm-activeLine")?.backgroundColor,
            };
        });
        expect(colors.caret).not.toBe(colors.background);
        expect(colors.caret).not.toBe(scheme === "dark" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)");
        expect(colors.width).toBe("2px");
        // A translucent active line leaves the selection beneath it showing.
        expect(colors.activeLine).toMatch(/^rgba\(.*, 0\.\d+\)$/);
    } finally {
        await page.close();
    }
});

it("picks a light system's theme before the first paint, before the page's code runs", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    // The page's code waits, so what shows is the markup's own.
    let release: () => void = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    await context.route(/assets\/index-[\w-]+\.js$/, async route => {
        await held;
        await route.continue();
    });
    const page = await context.newPage();
    try {
        // Module scripts hold the document's load, so wait for the markup alone.
        await page.goto(`${inject("guide")}#1-resources`, { waitUntil: "commit" });
        await page.waitForFunction(() => document.querySelector(".app") !== null);
        expect(await page.evaluate(() => [document.querySelector("sp-theme")?.getAttribute("color"), getComputedStyle(document.body).backgroundColor])).toEqual(["light", "rgb(255, 255, 255)"]);
        release();
        await statusOf(page, /Finished/);
        expect(await page.locator("sp-theme").getAttribute("color")).toBe("light");
    } finally {
        await context.close();
    }
});

it.each(["light", "dark"] as const)("shows the editor's focus with Spectrum's indicator, and its line numbers at 4.5:1 or more, in the %s scheme", async scheme => {
    const { page } = await open(browser, `${inject("guide")}#1-resources`, scheme);
    try {
        await statusOf(page);
        await page.locator("guide-editor .cm-content").click();
        await page.waitForFunction(() => document.querySelector("guide-editor")?.shadowRoot?.querySelector(".cm-editor.cm-focused") !== null);
        const look = await page.evaluate(() => {
            const root = document.querySelector("guide-editor")?.shadowRoot;
            const editor = root?.querySelector(".cm-editor");
            const gutter = root?.querySelector(".cm-gutterElement:not(.cm-activeLineGutter)");
            if (!(editor instanceof HTMLElement && gutter instanceof HTMLElement)) return null;
            const indicator = document.createElement("div");
            indicator.style.color = "var(--spectrum-focus-indicator-color)";
            document.querySelector("sp-theme")?.append(indicator);
            const expected = getComputedStyle(indicator).color;
            indicator.remove();
            const channels = (color: string): number[] => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
            const luminance = (color: string): number => {
                const [r = 0, g = 0, b = 0] = channels(color).map(value => value / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
                return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };
            const [light, dark] = [luminance(getComputedStyle(gutter).color), luminance(getComputedStyle(editor).backgroundColor)].sort((a, b) => b - a);
            return { outline: getComputedStyle(editor).outlineColor, outlineWidth: getComputedStyle(editor).outlineWidth, expected, contrast: ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05) };
        });
        expect(look?.outline).toBe(look?.expected);
        expect(look?.outlineWidth).toBe("2px");
        expect(look?.contrast).toBeGreaterThanOrEqual(4.5);
    } finally {
        await page.close();
    }
});

it("marks the example's file shown in its tabs, which the keyboard reaches and moves between", async () => {
    const { page } = await open(browser, `${inject("guide")}#11-traits-within-and-references`);
    try {
        await statusOf(page);
        const tabs = (): Promise<readonly (readonly [string | null, boolean, number])[]> => page.locator("guide-files sp-tab").evaluateAll(items => items.map(item => [item.getAttribute("value"), Reflect.get(item, "selected") === true, item.tabIndex] as const));
        expect(await tabs()).toEqual([["0", true, 0], ["1", false, -1]]);
        await page.locator("guide-files sp-tab[value='0']").focus();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelector("guide-editor")?.file.name === "11-traits.type-test.ts");
        expect(await tabs()).toEqual([["0", false, -1], ["1", true, 0]]);
    } finally {
        await page.close();
    }
});

it("names the panel each of the run's tabs controls", async () => {
    const { page } = await open(browser, `${inject("guide")}#1-resources`);
    try {
        await statusOf(page);
        expect(await page.evaluate(() => {
            const root = document.querySelector("guide-tabs")?.shadowRoot;
            return [...root?.querySelectorAll("sp-tab") ?? []].map(tab => root?.getElementById(tab.getAttribute("aria-controls") ?? "")?.getAttribute("aria-labelledby") === tab.id);
        })).toEqual([true, true, true, true]);
    } finally {
        await page.close();
    }
});

it("fails a program that exports no main, as the package's guide test does", async () => {
    const { page } = await open(browser, `${inject("guide")}#3-systems`);
    try {
        await statusOf(page, /Finished/);
        await replaceCode(page, (await codeOf(page)).replace("export const main = async", "export const run = async"));
        expect(await statusOf(page, /Failed/)).toBe("Failed: see Console");
        expect(await page.evaluate(() => document.querySelector("guide-console")?.logged.entries.at(-1))).toEqual({ level: "uncaught", text: "Uncaught Error: 03-systems.ts exports no main, which runs it" });
    } finally {
        await page.close();
    }
});
