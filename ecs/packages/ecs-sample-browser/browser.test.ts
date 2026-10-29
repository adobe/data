// © 2026 Adobe. MIT License. See /LICENSE for details.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { first, samples } from "./samples.ts";

it("the sample browser has a tab for each sample package beside it, titled as its page", () => {
    const page = readFileSync(new URL("index.html", import.meta.url), "utf8");
    const tabs = [...page.matchAll(/<a href="#([^"]+)">([^<]+)<\/a>/g)].map(([, name, title]) => ({ name, title }));
    const found = samples().map(({ name, title }) => ({ name, title }));
    expect(found.length).toBeGreaterThan(0);
    expect(tabs).toEqual(found);
    expect(tabs[0]?.name).toBe(first);
});
