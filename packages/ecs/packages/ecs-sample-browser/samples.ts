// © 2026 Adobe. MIT License. See /LICENSE for details.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The folder holding this package and the samples beside it. */
export const packages = fileURLToPath(new URL("..", import.meta.url));

/** A sample: its package's folder, its page's path in the folder of packages, and the page's `<title>`. */
export type Sample = { readonly name: string; readonly page: string; readonly title: string | undefined };

/** Every sample beside this package, by name: each package named `ecs-*` that serves a page from its `src`. */
export const samples = (): Sample[] => readdirSync(packages, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith("ecs-") && existsSync(`${packages}${entry.name}/src/index.html`))
    .map(entry => entry.name)
    .sort()
    .map(name => {
        const page = `${name}/src/index.html`;
        return { name, page, title: /<title>([^<]+)<\/title>/.exec(readFileSync(`${packages}${page}`, "utf8"))?.[1] };
    });
