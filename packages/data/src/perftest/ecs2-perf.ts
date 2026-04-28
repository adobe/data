// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "../ecs/store/index.js";
import { F32, True, U32 } from "../schema/index.js";
import { PerformanceTest } from "./perf-test.js";

// Mirror of ecs1-perf.ts on the new ECS, using createStore directly so we
// measure raw column read/write cost — no plugin, no transactions, no undo
// machinery. The legacy suite also bypasses transactions, so this matches.
//
// Dropped vs ecs1: move_native (no .native typed-array view exposed) and
// move_wasm* (no custom WASM allocator yet). Add them back here when the
// new ECS gains those surfaces.

const storeSchema = Store.Schema.create({
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
});

type ParticleStore = Store.FromSchema<typeof storeSchema>;

// The Archetype.insert signatures differ by component-set type, so the
// archetype refs can't share a typed array. Cast at the call site — this
// perftest just needs to fill the rows.

function seedAll(store: ParticleStore, count: number): void {
    const perTable = Math.ceil(count / 4);
    const archetypes = [
        store.archetypes.VisibleEnabled,
        store.archetypes.VisibleDisabled,
        store.archetypes.InvisibleEnabled,
        store.archetypes.InvisibleDisabled,
    ] as readonly any[];
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
}

function seedSingle(store: ParticleStore, count: number): void {
    const archetypes = [
        store.archetypes.VisibleEnabled,
        store.archetypes.VisibleDisabled,
        store.archetypes.InvisibleEnabled,
        store.archetypes.InvisibleDisabled,
    ] as readonly any[];
    for (let i = 0; i < count; i++) {
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
}

const create = (): PerformanceTest => {
    let count = 0;
    const setup = async (n: number) => { count = n; };
    const run = () => {
        const store = Store.create(storeSchema);
        seedSingle(store, count);
    };
    const cleanup = async () => { };
    return { setup, run, cleanup, type: "create" };
};

const createMoveParticlesPerformanceTest = (): PerformanceTest => {
    let store: ParticleStore;
    const setup = async (n: number) => {
        store = Store.create(storeSchema);
        seedAll(store, n);
    };
    const run = () => {
        const archetypes = store.queryArchetypes([
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
    };
    const getVisibleEnabledPositions = (): number[] => {
        const values: number[] = [];
        const archetypes = store.queryArchetypes([
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
    // Lock N to 1M to match ecs1's move tests so cache pressure is the
    // same on both sides — otherwise the auto-tuner picks different N
    // based on cold-probe time and the comparison becomes about cache,
    // not code. See ecs1-perf.ts for the matching note.
    return { setup, run, cleanup, getVisibleEnabledPositions, type: "move", startN: 1_000_000 };
};

export const ecs2 = {
    create: create(),
    move_column: createMoveParticlesPerformanceTest(),
};
