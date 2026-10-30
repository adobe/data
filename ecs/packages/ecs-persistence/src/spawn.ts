// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, type Entity, type World } from "@adobe/ecs";
import type { Failure } from "./failure.js";
import { existingFor, type Matching } from "./match/match.js";
import { contents } from "./program/contents.js";
import type { Snapshot } from "./snapshot.js";

/**
 * What `spawn` made: how many of the snapshot's entities it didn't spawn, those owned by an entity outside it; and,
 * unless asked not to, `entities`, each of the snapshot's entities to the one spawned for it, the one `match` found
 * for it, or null for one it didn't spawn.
 */
export type Spawned<Entities extends boolean = true> = { readonly failure?: undefined; readonly dropped: number }
    & (Entities extends false ? {} : { readonly entities: ReadonlyMap<Entity, Entity | null> });

const isTables = (value: unknown): value is readonly World.Table[] => Array.isArray(value) && value.every(table =>
    typeof table === "object" && table !== null && typeof Reflect.get(table, "count") === "number" && Reflect.get(table, "entities") instanceof Float64Array
    && typeof Reflect.get(table, "columns") === "object");

const isKeyed = (value: unknown): value is { readonly [key: symbol]: unknown } => typeof value === "object" && value !== null;

/** `spawnTables` takes entities by their numbers: a map of the snapshot's to the world's holds only numbers. */
const isEntities = (value: unknown): value is ReadonlyMap<Entity, Entity> => value instanceof Map
    && [...value].every(([saved, found]) => typeof saved === "number" && typeof found === "number");

/** Spawns its input's tables and sets its resources, a snapshot's, rewriting their entities, those `existing` maps standing for theirs. */
const spawnTables = System.create({}, ({ commands }, input: { readonly tables: unknown; readonly resources: unknown; readonly existing: unknown }) => {
    if (!isTables(input.tables) || !isKeyed(input.resources) || !isEntities(input.existing)) throw new Error("A snapshot holds tables and resources.");
    return commands.spawnTables(input.tables, { resources: input.resources, existing: input.existing });
});

/**
 * Spawns an entity in `world` for each of the snapshot's, with its persisted components, and sets the persisted
 * resources, on the world's thread, as the world's references would leave them had the entities outside the snapshot
 * despawned: each entity value naming one of the snapshot's names the one spawned for it; an entity owned, directly
 * or through others, by an entity outside the snapshot isn't spawned, which the result counts; a weak reference to
 * one is left out; and any other entity value naming one is `Entity.none`.
 * - `match`: unique indexes saying which of the snapshot's entities are already in `world`: one an index holds there,
 *   with the key of one of the snapshot's it holds, stands for it, keeping its own values, and isn't spawned again. It
 *   fails for an index with a part of its key that isn't persisted, or two of the snapshot's entities with one key.
 * - `entities: false` leaves out the result's map of entities, which costs about 85 ms and 50 MB at a million.
 *
 * Fails, as data, for a column or resource that doesn't fit, spawning nothing.
 */
export function spawn(input: Spawning & { readonly entities: false }): Promise<Spawned<false> | Failure>;
export function spawn(input: Spawning & { readonly entities?: true }): Promise<Spawned | Failure>;
export async function spawn(input: Spawning & { readonly entities?: boolean }): Promise<Spawned<boolean> | Failure> {
    const from = input.snapshot[contents];
    const { tables, resources } = from;
    const values: { [key: symbol]: unknown } = {};
    for (const { persisted, value } of resources) values[persisted.key] = value;
    const existing = input.match === undefined || input.match.length === 0 ? new Map<number, number>() : await existingFor(input.world, from, input.match);
    if ("failure" in existing) return existing;
    const spawned = await input.world.run(spawnTables, { tables, resources: values, existing }).catch((error: unknown) => ({ failure: error instanceof Error ? error.message : String(error) }));
    if ("failure" in spawned) return spawned;
    if (input.entities === false) return { dropped: spawned.dropped };
    return { dropped: spawned.dropped, entities: entitiesOf(tables, spawned.entities) };
}

/** What `spawn` takes: the world spawned into, the snapshot, and the indexes saying which of its entities are there already. */
type Spawning = { readonly world: World; readonly snapshot: Snapshot; readonly match?: readonly Matching[] };

/** Each of the tables' entities to the one spawned for it, the one existing for it, or null for one that wasn't. */
const entitiesOf = (tables: readonly World.Table[], spawned: readonly Float64Array[]): ReadonlyMap<Entity, Entity | null> => {
    const entities = new Map<Entity, Entity | null>();
    tables.forEach((table, t) => {
        const made = spawned[t];
        for (let row = 0; row < table.count; row++) {
            // A table's entities and `spawnTables`' are entities, `Entity.none`, 0, for a row it didn't spawn.
            const entity = made[row] as Entity;
            entities.set(table.entities[row] as Entity, entity === 0 ? null : entity);
        }
    });
    return entities;
};
