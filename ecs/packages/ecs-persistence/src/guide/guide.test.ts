// © 2026 Adobe. MIT License. See /LICENSE for details.
import { checkChapters } from "ecs-guide-checks";

/** What each chapter teaches, which its prose names as code and its program does. */
const teaches: { readonly [chapter: number]: readonly string[] } = {
    1: ["[file]: \"position\"", "snapshot({ world, by: file })", "encode(", "decode(bytes, { by: file })", "spawn({ world", "entities", "failure"],
    2: ["snapshot({ world, by: file, root", "dropped", "entities: false", "entities", "match: [byLabel]"],
    3: ["shared: true", "where: { [chunk]: [2, 0] }", "despawnWhere", "match: [byTree]"],
    4: ["snapshot({ world, by: file })", "snapshot({ world, by: settings })", "decode", "spawn"],
};

/**
 * Changes to each chapter's program, each taking away a point it teaches, which its output catches: each its code as
 * written, once in the program, what takes its place, and the failure it then prints, where it's one.
 */
const mutations: { readonly [chapter: number]: readonly (readonly [string, string, string?])[] } = {
    1: [["; [file]: \"target\"", ""], ["; [file]: \"level\"", ""], ["; [file]: \"position\"", ""]],
    2: [["root: ship", "root: hull"], ["[parent]: hull", "[parent]: ship"], [", match: [byLabel]", ""]],
    3: [["where: { [chunk]: [2, 0] }", "where: { [chunk]: [1, 0] }"], [", where: { [chunk]: [input.x, 0] }", ""], [", match: [byTree]", ""]],
    4: [
        ["[panelOpen]: { type: boolean; default: false; [settings]: \"panel open\" }", "[panelOpen]: { type: boolean; default: false; [file]: \"panel open\" }"],
        ["const settingsAsDocument = decode(settingsBytes, { by: file });", "const settingsAsDocument = decode(settingsBytes, { by: settings });"],
        ["[tool]: { type: string; default: \"select\"; [settings]: \"tool\" }", "[tool]: { type: string; default: \"select\"; [settings]: \"tool\"; [file]: \"tool\" }"],
    ],
};

checkChapters({ folder: new URL(".", import.meta.url), teaches, mutations });
