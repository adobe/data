// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Minimal Node.js usage example using the new provider API.
//
// The example does two passes:
//   1. "Write" pass: mounts a persistence session, inserts entities, checkpoints.
//   2. "Read" pass:  new mount on the same root, loads the snapshot and prints entities.
//
// Data is stored under /tmp/data-persistence-example/. The directory is
// deliberately NOT cleaned up so you can inspect the raw files afterwards.

import { join } from "node:path";
import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { mount } from "@adobe/data-persistence";
import { createNodeFsProvider } from "@adobe/data-persistence/node";

// ---------------------------------------------------------------------------
// Database schema
// ---------------------------------------------------------------------------

const gamePlugin = Database.Plugin.create({
    components: {
        position: Vec3.schema,
        velocity: Vec3.schema,
        health: F32.schema,
    },
    archetypes: {
        Unit: ["position", "velocity", "health"],
    },
    transactions: {
        spawnUnit(t, args: { x: number; y: number; z: number; hp: number }) {
            return t.archetypes.Unit.insert({
                position: [args.x, args.y, args.z],
                velocity: [0, 0, 0],
                health: args.hp,
            });
        },
        moveUnit(t, args: { entity: number; x: number; y: number; z: number }) {
            t.update(args.entity, { position: [args.x, args.y, args.z] });
        },
        damageUnit(t, args: { entity: number; amount: number }) {
            const view = t.read(args.entity) as { health: number } | null;
            if (view !== null) {
                t.update(args.entity, { health: Math.max(0, view.health - args.amount) });
            }
        },
    },
});

// ---------------------------------------------------------------------------
// WRITE PASS
// ---------------------------------------------------------------------------

const ROOT = join("/tmp", "data-persistence-example");

// createNodeFsProvider returns a provider factory — one value shared across
// both passes so they operate on the same on-disk root.
const provider = createNodeFsProvider(ROOT);

async function writePass(): Promise<number[]> {
    console.log("\n=== WRITE PASS ===");

    const db = Database.create(gamePlugin);
    const m = await mount(provider, db);

    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
        const id = db.transactions.spawnUnit({ x: i * 10, y: 0, z: 0, hp: 100 });
        if (id !== undefined) ids.push(id);
    }
    console.log(`  Spawned ${ids.length} units: ${ids.join(", ")}`);

    db.transactions.moveUnit({ entity: ids[0]!, x: 42, y: 7, z: 3 });
    db.transactions.damageUnit({ entity: ids[1]!, amount: 30 });

    await m.service.flush();
    await m.service.checkpoint();
    console.log("  Checkpoint written.");

    await m.dispose();
    return ids;
}

// ---------------------------------------------------------------------------
// READ PASS
// ---------------------------------------------------------------------------

async function readPass(expectedIds: number[]): Promise<void> {
    console.log("\n=== READ PASS ===");

    const db = Database.create(gamePlugin);
    const m = await mount(provider, db, { autoPersist: false });

    await m.service.load();

    for (const id of expectedIds) {
        const view = db.read(id) as {
            position: ArrayLike<number>;
            health: number;
        } | null;
        if (view === null) {
            console.log(`  Entity ${id}: NOT FOUND`);
        } else {
            const [x, y, z] = Array.from(view.position);
            console.log(`  Entity ${id}: pos=[${x}, ${y}, ${z}] hp=${view.health}`);
        }
    }

    await m.dispose();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ids = await writePass();
await readPass(ids);

console.log(`\nRaw files are in: ${ROOT}`);
console.log("  meta.json           — manifest (archetype schema + checkpoint id)");
console.log("  journal.bin         — write-ahead log (truncated after checkpoint)");
console.log("  entity-location.bin — entity → (archetype, row) map");
console.log("  archetypes/<id>/    — per-component column files");
