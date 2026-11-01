// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";

/** A chapter of the guide. */
export const chapter = Symbol();
/** Its number, 0 for Setup. */
export const chapterNumber = Symbol();
/** Its place in the guide's order, which unnumbered chapters such as Setup share their number 0 in. */
export const chapterOrder = Symbol();
/** Its address: its numbered title's anchor, as `1-resources`. */
export const slug = Symbol();
export const title = Symbol();
/** The part of the guide it's in, empty for Setup. */
export const part = Symbol();
/** The package it's a chapter of, whose examples its files are. */
export const owner = Symbol();
/** Its prose, as HTML. */
export const prose = Symbol();
/** The chapter the page shows: one at a time. */
export const shown = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [chapter]: { type: true };
        [chapterNumber]: { type: number };
        [chapterOrder]: { type: number };
        [slug]: { type: string };
        [title]: { type: string };
        [part]: { type: string };
        [owner]: { type: string };
        [prose]: { type: string };
        [shown]: { type: true };
    }
}

export const Chapter = [chapter, chapterNumber, chapterOrder, slug, title, part, owner, prose] as const;

/** Every chapter, in the guide's order. */
export const inOrder = Index.create({ key: [chapterOrder], sorted: true, components: { with: [chapter, chapterNumber, slug, title, part] } });
