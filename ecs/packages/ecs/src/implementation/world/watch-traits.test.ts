// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "../index.js";
import { readResource } from "./reads.test-helper.js";
import { inDocument } from "./watch-traits.test-helper.js";

const title = Symbol("watchTraits/title");
const cursor = Symbol("watchTraits/cursor");
const zoom = Symbol("watchTraits/zoom");
const theme = Symbol("watchTraits/theme");
const saved = Symbol("watchTraits/saved");
const recorded = Symbol("watchTraits/recorded");

declare module "@adobe/ecs" {
    interface Components {
        [title]: { type: string; [inDocument]: true };
        [cursor]: { type: number };
    }
    interface Resources {
        [zoom]: { type: number; default: 1; [inDocument]: true };
        [theme]: { type: string };
        [saved]: { type: readonly string[]; default: [] };
        [recorded]: { type: readonly string[]; default: [] };
    }
}

/** What a change set holds, as lines: each group's components added and removed, and each resource written. */
const linesOf = (changes: { readonly groups: readonly { readonly added: readonly symbol[]; readonly removed: readonly symbol[] }[]; readonly resources: readonly { readonly key: symbol; readonly previous: unknown; readonly next: unknown }[] }): string[] => [
    ...changes.groups.map(group => [...group.added.map(key => `+${key.description}`), ...group.removed.map(key => `-${key.description}`)].join(" ")),
    ...changes.resources.map(change => `${change.key.description} ${String(change.previous)} → ${String(change.next)}`),
];

Finalizer.changes({ watch: [inDocument] }, (changes, { resources }) => {
    resources[saved] = [...resources[saved], ...linesOf(changes)];
});
Finalizer.changes({ watch: { components: true, resources: [theme] } }, (changes, { resources }) => {
    resources[recorded] = [...resources[recorded], ...linesOf(changes)];
});

const spawn = System.create(({ commands }) => { commands.spawn([title, cursor])({ [title]: "notes", [cursor]: 0 }); });
const edit = System.create(({ resources }) => {
    resources[zoom] = 2;
    resources[theme] = "dark";
});

it("watches each component and resource declaring a trait, and every component with the resources chosen", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(edit);
    expect(await readResource(world, saved)).toEqual(["+watchTraits/title", "watchTraits/zoom 1 → 2"]);
    expect(await readResource(world, recorded)).toEqual(["+watchTraits/title +watchTraits/cursor", "watchTraits/theme  → dark"]);
});

it("watches a resource declaring a trait it watches that registers after the world started", async () => {
    await using world = createWorld();
    await world.run(spawn);
    const { widen } = await import("./watch-traits-late.test-helper.js");
    await world.run(widen);
    expect(await readResource(world, saved)).toEqual(["+watchTraits/title", "watchTraits/margin 0 → 5"]);
});
