// © 2026 Adobe. MIT License. See /LICENSE for details.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The folder holding this package and the samples beside it. */
export const packages = fileURLToPath(new URL("..", import.meta.url));

/** A sample: its package's folder, its page's path in the folder of packages, and the page's `<title>`. */
export type Sample = { readonly name: string; readonly page: string; readonly title: string | undefined };

/** The sample listed first, which the sample browser shows when its URL names none. */
export const first = "ecs-guide";

/**
 * Every sample beside this package: each package named `ecs-*` that serves a page from its `src`, `first` first and
 * the rest by name.
 */
export const samples = (): Sample[] => readdirSync(packages, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith("ecs-") && existsSync(`${packages}${entry.name}/src/index.html`))
    .map(entry => entry.name)
    .sort((a, b) => Number(b === first) - Number(a === first) || (a < b ? -1 : a > b ? 1 : 0))
    .map(name => {
        const page = `${name}/src/index.html`;
        return { name, page, title: /<title>([^<]+)<\/title>/.exec(readFileSync(`${packages}${page}`, "utf8"))?.[1] };
    });
