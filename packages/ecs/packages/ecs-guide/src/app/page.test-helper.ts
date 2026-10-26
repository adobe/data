// © 2026 Adobe. MIT License. See /LICENSE for details.
import { chromium, type Browser, type Page } from "playwright";

/**
 * Chromium's flags: WebGPU where the machine has a GPU, and none on CI's runners, whose WebGPU is software and too slow,
 * unless `ECS_GPU=1`; without it pages see no adapter, as in a browser without WebGPU.
 */
export const chromiumArgs = process.env["ECS_GPU"] === "1" || process.env["CI"] === undefined ? ["--enable-unsafe-webgpu"] : ["--disable-gpu"];

/** Full Chromium, as the samples' browser tests use. */
export const launch = (): Promise<Browser> => chromium.launch({ channel: "chromium", args: chromiumArgs });

/** A page of the guide at `url`, recording what it logs as errors, in the color scheme given. */
export const open = async (browser: Browser, url: string, colorScheme: "light" | "dark" = "light"): Promise<{ readonly page: Page; readonly errors: string[] }> => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(url);
    return { page, errors };
};

/** The status line's words, once they match `pattern`: by default, once the run has ended. */
export const statusOf = async (page: Page, pattern: RegExp = /Finished|Failed|rejected|failed/): Promise<string> => {
    const handle = await page.waitForFunction(source => {
        const text = document.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? "";
        return new RegExp(source).test(text) ? text : null;
    }, pattern.source).catch(async (error: unknown) => {
        // What the page shows instead, for a failure: its status, what it logged and its problems.
        const shown = await page.evaluate(() => ({
            status: document.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? null,
            console: document.querySelector("guide-console")?.shadowRoot?.textContent?.slice(0, 400) ?? null,
            problems: document.querySelector("guide-problems")?.shadowRoot?.textContent?.slice(0, 400) ?? null,
        })).catch(() => null);
        throw new Error(`the status never matched ${String(pattern)}: ${JSON.stringify(shown)}`, { cause: error });
    });
    return String(await handle.jsonValue());
};

/**
 * Waits for the build of an edit just made to land: the status leaves what it said, as the edit compiles, and ends;
 * an edit so quick that the status never showed it compiling waits a moment, then for the end.
 */
export const settled = async (page: Page, before: string): Promise<string> => {
    await page.waitForFunction(text => (document.querySelector("guide-status")?.shadowRoot?.querySelector("sp-status-light")?.textContent ?? "") !== text, before, { timeout: 3000 }).catch(() => undefined);
    return statusOf(page);
};

/** Replaces the code in the editor as a reader would: selecting it all and typing in its place. */
export const replaceCode = async (page: Page, code: string): Promise<void> => {
    await page.locator("guide-editor .cm-content").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(code);
};

/** The editor's code. */
export const codeOf = (page: Page): Promise<string> =>
    page.evaluate(() => document.querySelector("guide-editor")?.file.code ?? "");

/** What the console shows, a line each, as a `.out` file holds it. */
export const consoleOf = (page: Page): Promise<string> =>
    page.evaluate(() => (document.querySelector("guide-console")?.logged.entries ?? []).map(entry => `${entry.text}\n`).join(""));

/** Text with the package's version, which ids name, left out, as the package's guide test compares it. */
export const unversioned = (text: string): string => text.replace(/@adobe\/ecs@[^/\s]+\//g, "@adobe/ecs/");

/**
 * The contrast of each line of text in the editor's tooltip shown, against the background behind it: WCAG's ratio of
 * their relative luminances, each color as the page resolves it.
 */
export const tooltipContrasts = (page: Page, selector = ".cm-tooltip"): Promise<readonly { readonly text: string; readonly ratio: number }[]> => page.evaluate(within => {
    const root = document.querySelector("guide-editor")?.shadowRoot;
    const tooltip = root?.querySelector(within);
    if (!(tooltip instanceof HTMLElement)) return [];
    const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    /** A color's red, green, blue and alpha, as a canvas paints it. */
    const rgba = (color: string): readonly number[] => {
        if (canvas === null) return [0, 0, 0, 0];
        canvas.clearRect(0, 0, 1, 1);
        canvas.fillStyle = color;
        canvas.fillRect(0, 0, 1, 1);
        return [...canvas.getImageData(0, 0, 1, 1).data];
    };
    const luminance = ([r = 0, g = 0, b = 0]: readonly number[]): number => {
        const linear = (value: number): number => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    /** The first opaque background at or above an element. */
    const background = (element: Element): readonly number[] => {
        const parentOf = (at: Element): Element | null => {
            const root = at.getRootNode();
            return at.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
        };
        for (let at: Element | null = element; at !== null; at = parentOf(at)) {
            const color = rgba(getComputedStyle(at).backgroundColor);
            if ((color[3] ?? 0) > 200) return color;
        }
        return [255, 255, 255, 255];
    };
    const texts = [...tooltip.querySelectorAll("*")].filter(element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== ""));
    return texts.map(element => {
        const [lighter, darker] = [luminance(rgba(getComputedStyle(element).color)), luminance(background(element))].sort((a, b) => b - a);
        return { text: (element.textContent ?? "").slice(0, 40), ratio: ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05) };
    });
}, selector);

/**
 * Rests the pointer on `word` where it's first found in the editor's line holding `line`, scrolling the editor to the
 * line first, since it draws only the lines in view.
 */
export const hoverWord = async (page: Page, line: string, word: string): Promise<void> => {
    const point = await page.evaluate(async ([line, word]) => {
        const root = document.querySelector("guide-editor")?.shadowRoot;
        const scroller = root?.querySelector(".cm-scroller");
        if (!(scroller instanceof HTMLElement)) return null;
        /** Where the word is in a line drawn now, if one holds `line`. */
        const find = (): { readonly x: number; readonly y: number } | null => {
            for (const element of root?.querySelectorAll(".cm-line") ?? []) {
                const text = element.textContent ?? "";
                if (!text.includes(line)) continue;
                let offset = text.indexOf(line) + line.indexOf(word);
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
                    const length = node.textContent?.length ?? 0;
                    if (offset < length) {
                        const range = document.createRange();
                        range.setStart(node, offset);
                        range.setEnd(node, offset + 1);
                        const box = range.getBoundingClientRect();
                        const view = scroller.getBoundingClientRect();
                        if (box.top < view.top || box.bottom > view.bottom) return null;
                        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
                    }
                    offset -= length;
                }
            }
            return null;
        };
        const settle = (): Promise<unknown> => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const shown = find();
        if (shown !== null) return shown;
        for (let top = 0; top <= scroller.scrollHeight; top += scroller.clientHeight / 3) {
            scroller.scrollTop = top;
            await settle();
            const found = find();
            if (found !== null) return found;
        }
        return null;
    }, [line, word]);
    if (point === null) throw new Error(`no "${word}" in a line with "${line}" in view`);
    await page.mouse.move(point.x, point.y);
};
