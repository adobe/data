// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Connect } from "../../shared/connect.js";
import { showChapter } from "./model.js";

/** The chapter an address names: its first part, as `#1-resources` or its lines' `#1-resources/…`. */
export const slugOfHash = (hash: string): string => hash.slice(1).split("/")[0] ?? "";

/** Shows the chapter the page's address names, now and as it changes. */
export const connect: Connect = world => {
    const show = (): void => void world.run(showChapter, { slug: slugOfHash(location.hash) });
    addEventListener("hashchange", show);
    show();
    return () => removeEventListener("hashchange", show);
};
