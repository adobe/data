// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Browser usage example using the new provider API.
//
// This module would be imported from your application entry point.
// It assumes a Vite / bundler setup that supports
// `new Worker(new URL(...), { type: 'module' })`.

import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { mount } from "@adobe/data-persistence";
import { createOpfsProvider } from "@adobe/data-persistence/browser";

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
    },
});

// createOpfsProvider() — omit argument to use the per-origin OPFS root,
// or pass a FileSystemDirectoryHandle to scope to a subdirectory.
const provider = createOpfsProvider();

// ---------------------------------------------------------------------------
// WRITE PASS
// ---------------------------------------------------------------------------

export async function runWritePass(): Promise<number[]> {
    const db = Database.create(gamePlugin);
    const m = await mount(provider, db, {
        checkpoint: { everyNTransactions: 50, idleMs: 2000 },
    });

    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
        const id = db.transactions.spawnUnit({ x: i * 10, y: 0, z: 0, hp: 100 });
        if (id !== undefined) ids.push(id);
    }

    db.transactions.moveUnit({ entity: ids[0]!, x: 99, y: 0, z: 0 });

    await m.service.flush();
    await m.service.checkpoint();
    await m.dispose();

    return ids;
}

// ---------------------------------------------------------------------------
// READ PASS
// ---------------------------------------------------------------------------

export async function runReadPass(savedIds: number[]): Promise<void> {
    const db = Database.create(gamePlugin);
    const m = await mount(provider, db, { autoPersist: false });

    await m.service.load();

    for (const id of savedIds) {
        const view = db.read(id) as { position: ArrayLike<number>; health: number } | null;
        if (view !== null) {
            const [x, y, z] = Array.from(view.position);
            console.log(`Entity ${id}: pos=[${x}, ${y}, ${z}] hp=${view.health}`);
        }
    }

    await m.dispose();
}
