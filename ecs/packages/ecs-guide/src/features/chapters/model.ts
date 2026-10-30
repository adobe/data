// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index, System } from "@adobe/ecs";
import { Chapter, chapter, chapterNumber, chapterOrder, owner, part, prose, shown, slug, title } from "./data.js";

/** A chapter as the guide's content gives it, its prose rendered. */
export type ChapterContent = { readonly number: number; readonly slug: string; readonly title: string; readonly part: string; readonly package: string; readonly prose: string };

/** Chapters by their address. */
const bySlug = Index.create({ key: [slug], unique: true, components: { with: [chapter] } });

/** Adds the guide's chapters, in the guide's order. */
export const addChapters = System.create({}, ({ commands }, input: { readonly chapters: readonly ChapterContent[] }) => {
    for (const [order, item] of input.chapters.entries()) {
        commands.spawn(Chapter)({ [chapterNumber]: item.number, [chapterOrder]: order, [slug]: item.slug, [title]: item.title, [part]: item.part, [owner]: item.package, [prose]: item.prose });
    }
});

/** The chapter shown when an address names none: the first. */
export const firstSlug = "setup";

/** Shows the chapter at an address, or the first for an address that names none. */
export const showChapter = System.create({
    components: { with: [chapter, slug], optional: [shown] },
    lookup: { bySlug: { index: bySlug } },
}, (row, { lookup, commands }, input: { readonly slug: string }) => {
    const chosen = (lookup.bySlug(input.slug) ?? lookup.bySlug(firstSlug))?.entity === row.entity;
    if (chosen && row[shown] === undefined) commands.add(row.entity, shown);
    else if (!chosen && row[shown] !== undefined) commands.remove(row.entity, shown);
});
