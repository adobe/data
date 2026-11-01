// © 2026 Adobe. MIT License. See /LICENSE for details.
import { indexDefinitionOf } from '../registry/indexes.js';
import { labelOf } from '../registry/names.js';
import { requireDefinition } from '../registry/program.js';
import { isLeaf, placementsOf, scheduleOf, type Placement } from '../registry/schedule.js';
import type { Leaf } from './leaf.js';
import type { System } from './system.js';

type Key = symbol;

const none: readonly never[] = [];

/** A leaf as the system value it is. */
const asSystem = (leaf: Leaf): System<unknown, unknown> => leaf;

/** What the build inferred one system uses, and what placed it, as plain data. */
const describeLeaf = (leaf: Leaf, placements: readonly Placement[]) => {
    const { components, resources, lookup, up, order } = leaf.declaration;
    const { commands } = leaf;
    return {
        /** The system, the value its constructor returned. */
        system: asSystem(leaf),
        name: leaf.name,
        components: {
            read: [...components?.read ?? none, ...up === undefined ? none : [up.through]],
            write: components?.write ?? none,
            /** What it requires without reading: `with` members it doesn't use, `added` and `changed` filters' among them. */
            has: components?.has ?? none,
            optional: components?.optional ?? none,
            not: components?.not ?? none,
            added: components?.added ?? none,
            changed: components?.changed ?? none,
            /** What it reads of each row's parent, through `up`. */
            parent: up?.read ?? none,
        },
        resources: {
            read: resources?.read ?? none,
            write: resources?.write ?? none,
            reduce: resources?.reduce ?? none,
            changed: resources?.changed ?? none,
            is: resources?.is ?? none,
            not: resources?.not ?? none,
        },
        lookups: Object.entries(lookup ?? {}).map(([name, used]) => ({
            name,
            /** The label of the index it looks up through, or null for a lookup by entity. */
            index: "index" in used && used.index !== undefined ? indexDefinitionOf(used.index)?.name ?? null : null,
            read: used.read ?? none,
        })),
        /** The label of the sorted index ordering its rows, or null. */
        order: indexDefinitionOf(order)?.name ?? null,
        /** What its commands name by kind, and whether it despawns; null where the build couldn't follow them. */
        commands: commands === null ? null : {
            spawn: commands?.spawn ?? none,
            add: commands?.add ?? none,
            remove: commands?.remove ?? none,
            despawn: commands?.despawn === true,
        },
        /** Whether it takes its row whole (`components: { whole: true }`), every member written. */
        whole: components?.whole === true,
        /** The systems it follows directly, with what ordered it after each and the keys that need that order. */
        after: placements.map(placement => ({ system: asSystem(placement.leaf), name: placement.leaf.name, because: placement.because, conflicts: placement.conflicts })),
    };
};

type Described = ReturnType<typeof describeLeaf>;

const keys = (list: readonly Key[]): string => list.map(labelOf).join(" ");

/** A system's lines of text, after its name in a column of `width`. */
const linesOf = (system: Described, width: number): readonly string[] => {
    const lines: string[] = [];
    const add = (label: string, text: string): void => { if (text !== "") lines.push(`${label.padEnd(10)}${text}`); };
    const { components, resources, commands } = system;
    add("reads", keys(components.read));
    add("writes", `${keys(components.write)}${system.whole ? " (its whole row)" : ""}`);
    add("requires", [keys(components.has), components.not.length === 0 ? "" : `not ${keys(components.not)}`, components.optional.length === 0 ? "" : `optional ${keys(components.optional)}`].filter(text => text !== "").join(", "));
    add("filters", [...components.added.map(key => `added ${labelOf(key)}`), ...components.changed.map(key => `changed ${labelOf(key)}`), ...resources.changed.map(key => `changed ${labelOf(key)}`)].join(", "));
    add("parent", keys(components.parent));
    add("resources", [resources.read.length === 0 ? "" : `reads ${keys(resources.read)}`, resources.write.length === 0 ? "" : `writes ${keys(resources.write)}`,
        resources.reduce.length === 0 ? "" : `reduces ${keys(resources.reduce)}`, resources.is.length === 0 ? "" : `while ${keys(resources.is)}`,
        resources.not.length === 0 ? "" : `unless ${keys(resources.not)}`].filter(text => text !== "").join(", "));
    for (const lookup of system.lookups) add("looks up", `${lookup.name}${lookup.index === null ? "" : ` through ${lookup.index}`}${lookup.read.length === 0 ? "" : `: ${keys(lookup.read)}`}`);
    if (system.order !== null) add("ordered", `by ${system.order}`);
    if (commands === null) add("commands", "unknown: the build couldn't follow them");
    else add("commands", [commands.spawn.length === 0 ? "" : `spawn ${keys(commands.spawn)}`, commands.add.length === 0 ? "" : `add ${keys(commands.add)}`,
        commands.remove.length === 0 ? "" : `remove ${keys(commands.remove)}`, commands.despawn ? "despawn" : ""].filter(text => text !== "").join(", "));
    add("after", system.after.map(placement => `${placement.name} (${placement.because}${placement.conflicts.length === 0 ? "" : `: ${keys(placement.conflicts)}`})`).join(", "));
    const indent = " ".repeat(width);
    return lines.length === 0 ? [system.name] : lines.map((line, i) => `${i === 0 ? system.name.padEnd(width) : indent}${line}`);
};

/**
 * Describes how a system or composite runs: its tiers in run order, systems in one tier having no ordering path between
 * them, each with the sync point after it, if any, and its readonly systems apart, which run after its last sync
 * point. For each system, what the build inferred it reads, writes, looks up and commands, whether it takes its row
 * whole, and the systems it follows directly, with what ordered it after each. `text` gives it all to read; the rest
 * is data to assert on.
 */
export const describe = <I, R>(system: System<I, R>) => {
    const definition = requireDefinition(system);
    const schedule = scheduleOf(definition);
    const placements = placementsOf(definition);
    const tiers = schedule.tiers.map((tier, t) => ({
        systems: tier.map(leaf => describeLeaf(leaf, placements.get(leaf) ?? none)),
        /**
         * Why a sync point follows the tier, applying the commands so far: each system whose commands may change what a
         * later one that follows it uses, through `keys`, none listed where it despawns or a cascade could; null for none.
         */
        sync: schedule.syncs[t]?.map(reason => ({ from: asSystem(reason.from), to: asSystem(reason.to), keys: reason.keys })) ?? null,
    }));
    const readonly = schedule.observer.flatMap(member => isLeaf(member) ? [describeLeaf(member, none)] : []);
    const width = Math.max(0, ...[...tiers.flatMap(tier => tier.systems), ...readonly].map(described => described.name.length)) + 2;
    const text = [
        ...tiers.flatMap((tier, t) => [
            ...tier.systems.flatMap((described, i) => linesOf(described, width).map((line, l) => `${(i === 0 && l === 0 ? `tier ${t}` : "").padEnd(8)}${line}`)),
            ...(tier.sync ?? none).map((reason, r) => `${(r === 0 ? "sync" : "").padEnd(8)}${reason.from.name}'s commands${reason.keys.length === 0 ? "" : ` of ${keys(reason.keys)}`}, for ${reason.to.name}`),
        ]),
        ...readonly.length === 0 ? none : ["readonly", ...readonly.flatMap(described => linesOf(described, width).map(line => `${"".padEnd(8)}${line}`))],
    ].map(line => line.trimEnd()).join("\n");
    return { tiers, readonly, text };
};
