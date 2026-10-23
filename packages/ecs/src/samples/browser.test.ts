// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const samples = fileURLToPath(new URL(".", import.meta.url));

it("the sample browser has a tab for each sample folder, titled as its page", () => {
    const page = readFileSync(`${samples}index.html`, "utf8");
    const tabs = [...page.matchAll(/<a href="#([^"]+)">([^<]+)<\/a>/g)].map(([, name, title]) => ({ name, title }));
    const folders = readdirSync(samples, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && existsSync(`${samples}${entry.name}/index.html`))
        .map(entry => {
            const title = /<title>([^<]+)<\/title>/.exec(readFileSync(`${samples}${entry.name}/index.html`, "utf8"))?.[1];
            return { name: entry.name, title };
        });
    expect(tabs).toEqual(folders);
});
