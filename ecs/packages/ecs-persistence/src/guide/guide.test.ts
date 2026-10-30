// © 2026 Adobe. MIT License. See /LICENSE for details.
import { checkChapters } from "ecs-guide-checks";

/** What each chapter teaches, which its prose names as code and its program does. */
const teaches: { readonly [chapter: number]: readonly string[] } = {
    1: ["[persist]: \"position\"", "snapshot({ world })", "encode(", "decode(bytes)", "spawn({ world", "entities", "failure"],
    2: ["snapshot({ world, root", "dropped", "entities: false", "entities", "match: [byLabel]"],
};

/**
 * Changes to each chapter's program, each taking away a point it teaches, which its output catches: each its code as
 * written, once in the program, what takes its place, and the failure it then prints, where it's one.
 */
const mutations: { readonly [chapter: number]: readonly (readonly [string, string, string?])[] } = {
    1: [["; [persist]: \"target\"", ""], ["; [persist]: \"level\"", ""], ["; [persist]: \"position\"", ""]],
    2: [["root: ship", "root: hull"], ["[parent]: hull", "[parent]: ship"], [", match: [byLabel]", ""]],
};

checkChapters({ folder: new URL(".", import.meta.url), teaches, mutations });
