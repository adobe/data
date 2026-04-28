// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "../ecs/database/index.js";
import { Store } from "../ecs/store/index.js";
import { F32, True, U32 } from "../schema/index.js";
import { PerformanceTest } from "./perf-test.js";

// Mirror of ecs1-perf.ts, but built on the new ECS (Database / Plugin / Store).
// We omit the `move_native` and `move_wasm*` tests because the new ECS does
// not yet expose a column.native typed-array view nor a custom WASM memory
// allocator. Once that surface lands these tests can be added back here.

const particlePlugin = Database.Plugin.create({
    components: {
        color: U32.schema,
        enabled: True.schema,
        mass: F32.schema,
        positionX: F32.schema,
        positionY: F32.schema,
        positionZ: F32.schema,
        velocityX: F32.schema,
        velocityY: F32.schema,
        velocityZ: F32.schema,
        visible: True.schema,
    },
    archetypes: {
        VisibleEnabled: [
            "color", "enabled", "mass",
            "positionX", "positionY", "positionZ",
            "velocityX", "velocityY", "velocityZ",
            "visible",
        ],
        InvisibleEnabled: [
            "color", "enabled", "mass",
            "positionX", "positionY", "positionZ",
            "velocityX", "velocityY", "velocityZ",
        ],
        VisibleDisabled: [
            "color", "mass",
            "positionX", "positionY", "positionZ",
            "velocityX", "velocityY", "velocityZ",
            "visible",
        ],
        InvisibleDisabled: [
            "color", "mass",
            "positionX", "positionY", "positionZ",
            "velocityX", "velocityY", "velocityZ",
        ],
    },
    transactions: {
        // Single transaction wraps the whole loop so transaction overhead is
        // amortized — this is the cheapest way to do a large mutation pass on
        // the new ECS today.
        seedAll(t: Store<any, any, any>, args: { count: number }): void {
            const perTable = Math.ceil(args.count / 4);
            const archetypes = [
                t.archetypes.VisibleEnabled,
                t.archetypes.VisibleDisabled,
                t.archetypes.InvisibleEnabled,
                t.archetypes.InvisibleDisabled,
            ];
            for (let archIndex = 0; archIndex < archetypes.length; archIndex++) {
                const arch = archetypes[archIndex];
                for (let k = 0; k < perTable; k++) {
                    const i = archIndex + k * 4;
                    arch.insert({
                        color: 0xff00ff,
                        mass: 10,
                        positionX: i + 1,
                        positionY: i + 1,
                        positionZ: i + 1,
                        velocityX: -i,
                        velocityY: -i,
                        velocityZ: -i,
                    });
                }
            }
        },
        seedSingle(t: Store<any, any, any>, args: { count: number }): void {
            const archetypes = [
                t.archetypes.VisibleEnabled,
                t.archetypes.VisibleDisabled,
                t.archetypes.InvisibleEnabled,
                t.archetypes.InvisibleDisabled,
            ];
            for (let i = 0; i < args.count; i++) {
                archetypes[i % 4].insert({
                    color: 0xff00ff,
                    mass: 10,
                    positionX: i + 1,
                    positionY: i + 1,
                    positionZ: i + 1,
                    velocityX: -i,
                    velocityY: -i,
                    velocityZ: -i,
                });
            }
        },
        moveColumn(t: Store<any, any, any>): void {
            // Iterate every archetype that has the visible+enabled subset and
            // mutate position in-place via column.get / column.set.
            const archetypes = t.queryArchetypes([
                "positionX", "positionY", "positionZ",
                "velocityX", "velocityY", "velocityZ",
                "visible", "enabled",
            ] as const);
            for (const archetype of archetypes) {
                const { columns, rowCount } = archetype;
                const positionX = columns.positionX;
                const positionY = columns.positionY;
                const positionZ = columns.positionZ;
                const velocityX = columns.velocityX;
                const velocityY = columns.velocityY;
                const velocityZ = columns.velocityZ;
                for (let i = 0; i < rowCount; i++) {
                    positionX.set(i, positionX.get(i) + velocityX.get(i));
                    positionY.set(i, positionY.get(i) + velocityY.get(i));
                    positionZ.set(i, positionZ.get(i) + velocityZ.get(i));
                }
            }
        },
    },
});

type ParticleDb = ReturnType<typeof Database.create<typeof particlePlugin>>;

const create = (batch: boolean) => {
    let count = 0;
    const setup = async (n: number) => { count = n; };
    const run = () => {
        const db = Database.create(particlePlugin);
        if (batch) {
            db.transactions.seedAll({ count });
        } else {
            db.transactions.seedSingle({ count });
        }
    };
    const cleanup = async () => { };
    return { setup, run, cleanup, type: "create" } satisfies PerformanceTest;
};

const createMoveParticlesPerformanceTest = (): PerformanceTest => {
    let db: ParticleDb;
    const setup = async (n: number) => {
        db = Database.create(particlePlugin);
        db.transactions.seedAll({ count: n });
    };
    const run = () => {
        db.transactions.moveColumn();
    };
    const getVisibleEnabledPositions = (): number[] => {
        const values: number[] = [];
        const archetypes = db.queryArchetypes([
            "positionX", "positionY", "positionZ",
            "visible", "enabled",
        ] as const);
        for (const archetype of archetypes) {
            const { columns, rowCount } = archetype;
            const positionX = columns.positionX;
            const positionY = columns.positionY;
            const positionZ = columns.positionZ;
            for (let i = 0; i < rowCount; i++) {
                values.push(positionX.get(i), positionY.get(i), positionZ.get(i));
            }
        }
        return values;
    };
    const cleanup = async () => { };
    return { setup, run, cleanup, getVisibleEnabledPositions, type: "move" };
};

export const ecs2 = {
    create: create(false),
    create_batch: create(true),
    move_column: createMoveParticlesPerformanceTest(),
};
