// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createPlugin } from "./create-plugin.js";
import { Database } from "./database.js";
import { Observe } from "../../observe/index.js";
import { F32 } from "../../math/index.js";
import { Entity } from "../entity/entity.js";
import type { False, True, RemoveIndex } from "../../types/types.js";
import type { EntityReadValues } from "../store/core/core.js";
import type { ComponentSchemas } from "../component-schemas.js";
import type { ResourceSchemas } from "../resource-schemas.js";

/**
 * Type-only tests for deep `extends` chains and TS7056 serialization limits.
 *
 * Verifies that a production-realistic "fat" base plugin (20+ components,
 * 18 resources, 3 archetypes) extended through several layers of
 * transaction/computed/action plugins does NOT trigger TS7056 when the
 * combined database is exported.
 *
 * Plugin chain (city-builder domain):
 *
 *   corePlugin               — 20+ components, 18 resources, 3 archetypes
 *     → mutationsPlugin      — extends core, adds ~20 transactions
 *       → selectionPlugin    — extends mutations, adds selection transactions
 *         → cursorOpsPlugin  — extends selection, adds cursor-snap transactions
 *   derivedPlugin            — extends core, adds computed observables
 *   interactionsPlugin_typed — extends combined chain, typed actions
 *   simulationPlugin_typed   — extends combined chain, typed actions
 *
 * The test verifies:
 * 1. Type inference works correctly through the extends chain
 * 2. Database.Plugin.combine() merges all types at the top level
 * 3. Exported factory returning the combined database does NOT trigger TS7056
 * 4. Plugins with `extends` have full type safety (db parameter is fully typed)
 */

// ============================================================================
// Fat base plugin — many components, resources, archetypes
// ============================================================================

const corePlugin = createPlugin({
    components: {
        // District (container entity)
        districtType: { type: 'string' },
        zoning: { type: 'string' },
        districtLocked: { type: 'boolean' },
        districtActive: { type: 'boolean' },
        overlay: { type: 'string' },
        sortOrder: F32.schema,
        selectedByUsers: { type: 'array', items: { type: 'string' } },

        // Building (child entity)
        buildingType: { type: 'string' },
        parentDistrict: Entity.schema,
        positionX: F32.schema,
        footprintStart: F32.schema,
        footprintEnd: F32.schema,
        maxFootprint: F32.schema,
        blueprintRef: { type: 'string' },
        density: F32.schema,
        height: F32.schema,
        visibility: F32.schema,
        condemned: { type: 'boolean' },

        // Road (link entity)
        roadType: { type: 'string' },
        roadLength: F32.schema,
        roadId: { type: 'string' },
        parentBuilding: Entity.schema,
    },
    resources: {
        pixelsPerUnit: { default: 0 as F32 },
        zoomLevel: { default: 1.0 as F32 },
        cursorTime: { default: 0 as F32 },
        simulationState: { default: 'paused' as string },
        tickRate: { default: 30 as F32 },
        demolishToolActive: { default: false as boolean },
        gridSnapEnabled: { default: true as boolean },
        activeGridSnap: { default: null as number | null },
        gridSnapIndicator: { default: 0 as F32 },
        gridSnapVisible: { default: false as boolean },
        crossDistrictDragActive: { default: false as boolean },
        crossDistrictDragTarget: { default: null as Entity | null },
        crossDistrictDropOffset: { default: 0 as number },
        crossDistrictPlaceholder: { default: null as 'above' | 'below' | number | null },
        compactInsertPreviewIndex: { default: null as number | null },
        compactInsertPreviewDistrict: { default: null as Entity | null },
        compactInsertPreviewSize: { default: null as number | null },
        crossDistrictSourceGhost: {
            default: null as { districtId: Entity; offset: number; size: number } | null,
        },
    },
    archetypes: {
        District: ['districtType', 'zoning', 'districtLocked', 'districtActive', 'overlay', 'sortOrder', 'selectedByUsers'],
        Building: [
            'parentDistrict', 'buildingType', 'positionX', 'footprintStart',
            'footprintEnd', 'maxFootprint', 'blueprintRef', 'density',
            'height', 'visibility', 'overlay', 'condemned',
            'sortOrder', 'selectedByUsers',
        ],
        Road: ['parentBuilding', 'roadType', 'roadLength', 'roadId'],
    },
});

// ============================================================================
// Layer 1: Mutations — extends core, ~20 transactions
// ============================================================================

const mutationsPlugin = createPlugin({
    extends: corePlugin,
    transactions: {
        createDistrict: (t, _input: { districtType: string; zoning: string }) => { },
        deleteDistrict: (t, _id: Entity) => { },
        createBuilding: (t, _input: { parentDistrict: Entity; positionX: number }) => { },
        deleteBuilding: (t, _id: Entity) => { },
        updateBuilding: (t, _input: { id: Entity } & Partial<{ positionX: number; density: number }>) => { },
        selectExclusive: (t, _input: { entityId: Entity; userId: string }) => { },
        toggleSelected: (t, _input: { entityId: Entity; userId: string }) => { },
        ensureSelected: (t, _input: { entityId: Entity; userId: string }) => { },
        moveSelectedBuildings: (t, _input: { deltaUnits: number }) => { },
        setCursorTime: (t, _input: { time: number }) => { },
        setSimulationState: (t, _input: { state: string }) => { },
        setZoomLevel: (t, _input: { level: number }) => { },
        setDemolishTool: (t, _input: { active: boolean }) => { },
        setGridSnap: (t, _input: { enabled: boolean }) => { },
        setActiveGridSnap: (t, _input: { time: number | null }) => { },
        setCrossDistrictDrag: (t, _input: { active: boolean }) => { },
        clearCrossDistrictPreviews: (t) => { },
        resizeFreeformBuilding: (t, _input: { buildingId: Entity; edge: 'left' | 'right'; deltaPx: number }) => { },
        resizeCompactBuilding: (t, _input: { buildingId: Entity; edge: 'left' | 'right'; deltaPx: number }) => { },
        splitAtCursor: (t, _input: { userId: string }) => { },
        deleteSelected: (t, _input: { userId: string }) => { },
        toggleCondemned: (t, _input: { buildingId: Entity }) => { },
    },
});

// ============================================================================
// Layer 2: Selection — extends mutations
// ============================================================================

const selectionPlugin = createPlugin({
    extends: mutationsPlugin,
    transactions: {
        deselectAll: (t, _input: { userId: string }) => { },
        selectAll: (t, _input: { userId: string }) => { },
        setSelectionFromIds: (t, _input: { entityIds: Entity[]; userId: string; additive: boolean }) => { },
    },
});

// ============================================================================
// Layer 3: Cursor operations — extends selection
// ============================================================================

const cursorOpsPlugin = createPlugin({
    extends: selectionPlugin,
    transactions: {
        resizeSelectedToCursor: (t, _input: { userId: string; edge: 'left' | 'right' }) => { },
    },
});

// ============================================================================
// Derived state — extends core (parallel branch, adds computed observables)
// ============================================================================

const derivedPlugin = createPlugin({
    extends: corePlugin,
    computed: {
        districts: (db) =>
            Observe.withMap(
                db.observe.select(db.archetypes.District.components),
                ids => [...ids].sort((a, b) => (db.get(a, 'sortOrder') ?? 0) - (db.get(b, 'sortOrder') ?? 0))
            ),
        buildings: (db) => (districtId: Entity): Observe<readonly Entity[]> =>
            Observe.withMap(
                db.observe.select(db.archetypes.Building.components, { where: { parentDistrict: districtId } }),
                ids => [...ids].sort((a, b) => ((db.get(a, 'positionX') as number) ?? 0) - ((db.get(b, 'positionX') as number) ?? 0))
            ),
        currentUserId: (_db): Observe<string | null> => Observe.fromConstant('local'),
        effectivePixelsPerUnit: (db): Observe<number> =>
            Observe.withMap(
                Observe.fromProperties({
                    ppu: db.observe.resources.pixelsPerUnit,
                    zoom: db.observe.resources.zoomLevel,
                }),
                ({ ppu, zoom }) => ppu * zoom
            ),
        worldExtent: (db): Observe<number> =>
            Observe.withMap(db.observe.select(db.archetypes.District.components), () => 0),
    },
});

// ============================================================================
// THE PROBLEM: Interaction and simulation plugins that CANNOT use extends
// ============================================================================

/**
 * These plugins must use `db: any` because extending the deep plugin chain
 * pushes the combined type past TS7056. Without extends, `db` inside action
 * handlers has no type information — typos and wrong argument shapes compile.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const interactionsPlugin_untyped = createPlugin({
    actions: {
        selectExclusive: async (db: any, entityId: Entity) => {
            db.transactions.selectExclusive({ entityId, userId: 'local' });
        },
        toggleSimulation: async (db: any) => {
            db.transactions.setSimulationState({ state: 'running' });
        },
        moveBuildings: async (db: any, _input: { buildingId: Entity }) => {
            db.transactions.moveSelectedBuildings({ deltaUnits: 100 });
        },
        resizeBuilding: async (db: any, _input: { buildingId: Entity; edge: 'left' | 'right' }) => {
            db.transactions.resizeFreeformBuilding({ buildingId: 0, edge: 'left', deltaPx: 10 });
        },
        // NOT type-checked — typos and wrong shapes compile silently:
        demonstrateUnsafety: async (db: any) => {
            db.transactions.setCurserTime({ time: 0 });          // typo in name
            db.transactions.setSimulationState('running');        // wrong arg shape
            const _x = await Observe.toPromise(db.computed.nope); // non-existent computed
        },
    },
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================================================
// DESIRED: Interaction plugin WITH extends — full type safety
// ============================================================================

const interactionsBase = Database.Plugin.combine(cursorOpsPlugin, derivedPlugin);

const interactionsPlugin_typed = createPlugin({
    extends: interactionsBase,
    actions: {
        selectExclusive: async (db, entityId: Entity) => {
            db.transactions.selectExclusive({ entityId, userId: 'local' });
        },
        toggleSimulation: async (db) => {
            const state: string = await Observe.toPromise(db.observe.resources.simulationState);
            db.transactions.setSimulationState({ state: state === 'running' ? 'paused' : 'running' });
        },
        moveBuildings: async (db, { buildingId }: { buildingId: Entity }) => {
            db.transactions.ensureSelected({ entityId: buildingId, userId: 'local' });
            const ppu: number = await Observe.toPromise(db.computed.effectivePixelsPerUnit);
            db.transactions.moveSelectedBuildings({ deltaUnits: ppu * 10 });
        },
        resizeBuilding: async (db, { buildingId, edge }: { buildingId: Entity; edge: 'left' | 'right' }) => {
            db.transactions.resizeFreeformBuilding({ buildingId, edge, deltaPx: 10 });
        },
        zoomByStep: async (db, delta: number) => {
            db.transactions.setZoomLevel({ level: db.resources.zoomLevel + delta });
        },
    },
});

const simulationPlugin_typed = createPlugin({
    extends: interactionsBase,
    actions: {
        stepTicks: async (db, count: number) => {
            const t: number = await Observe.toPromise(db.observe.resources.cursorTime);
            const rate: number = db.resources.tickRate;
            db.transactions.setCursorTime({ time: t + count * (1 / rate) });
        },
        jumpToStart: async (db) => {
            db.transactions.setSimulationState({ state: 'paused' });
            db.transactions.setCursorTime({ time: 0 });
        },
    },
});

// ============================================================================
// Combine and create — both approaches
// ============================================================================

function testUntypedCombine() {
    const plugin = Database.Plugin.combine(derivedPlugin, interactionsPlugin_untyped, cursorOpsPlugin);
    const db = Database.create(plugin);
    db.transactions.setCursorTime({ time: 0 });
    db.transactions.deselectAll({ userId: 'local' });
    db.transactions.resizeSelectedToCursor({ userId: 'local', edge: 'left' });
}

function testTypedCombine() {
    const plugin = Database.Plugin.combine(interactionsPlugin_typed, simulationPlugin_typed);
    const db = Database.create(plugin);
    db.transactions.setCursorTime({ time: 0 });
    db.transactions.deselectAll({ userId: 'local' });
    db.transactions.resizeSelectedToCursor({ userId: 'local', edge: 'left' });
    db.actions.selectExclusive(0 as Entity);
    db.actions.toggleSimulation();
    db.actions.stepTicks(1);
}

// ============================================================================
// TS7056 regression guard
//
// TS7056 fires during declaration emit when TypeScript tries to serialize an
// inferred return type that exceeds its ~1 MB per-node limit. Deep plugin
// chains hit this because every transaction/action signature embeds the full
// Store<FromSchemas<Components>> parameter type, and combining N plugins
// repeats those schemas N times across dozens of function signatures.
//
// The fix (direct property access instead of conditional `infer` extraction
// in CombinePlugins, FromPlugin, createDatabase, and Database.extend) keeps
// the serialized size well under the limit. Because `create()` is exported,
// `tsc -b` must emit its .d.ts return type — so if a future change pushes
// the combined type back over the threshold, this line will fail the build.
// ============================================================================

const _allPlugins = Database.Plugin.combine(
    derivedPlugin,
    interactionsPlugin_typed,
    simulationPlugin_typed,
    cursorOpsPlugin,
);

/** Exported to force declaration emit — will trigger TS7056 if we regress. */
export function create() {
    return Database.create(_allPlugins);
}

type _CityService = ReturnType<typeof create>;

// ============================================================================
// Index signature regression guard
//
// Plugin type parameters default to constraints like Record<string, Schema>,
// which carry an implicit { [K: string]: ... } index signature. If that
// index leaks into the Database's public API types (read, get, resources,
// observe), downstream consumers see { [x: string]: any } in their types
// and lose type safety.
//
// Two layered defenses prevent this:
//
//   1. RemoveIndex<T> — applied in Database.FromPlugin to every plugin
//      property (components, resources, etc.) before passing to FromSchemas.
//      Strips the index at the source.
//
//   2. EntityReadValues<C> key remapping — applies
//      `as string extends K ? never : K` so even if C still carries an
//      index, the read() return type won't expose it.
//
// The tests below verify EACH defense independently (by feeding types that
// actually have index signatures) and the end-to-end pipeline.
// ============================================================================

type HasStringIndex<T> = string extends keyof T ? true : false;

{
    // --- Defense 1: RemoveIndex strips index signatures ---
    type WithIndex = { readonly [K: string]: unknown; foo: string; bar: number };
    type _Precondition1 = True<HasStringIndex<WithIndex>>;
    type _Defense1 = False<HasStringIndex<RemoveIndex<WithIndex>>>;

    // --- Defense 2: EntityReadValues strips index keys via key remapping ---
    type ComponentsWithIndex = { [x: string]: unknown; foo: string; bar: number };
    type _Precondition2 = True<HasStringIndex<ComponentsWithIndex>>;
    type _Defense2 = False<HasStringIndex<EntityReadValues<ComponentsWithIndex>>>;

    // --- Defense 1 applied in FromPlugin ---
    // When a plugin type flows through a generic constraint like
    // <P extends Database.Plugin>, P['components'] resolves to the
    // constraint ComponentSchemas (= Record<string, Schema>) intersected
    // with the concrete properties. This carries a string index.
    // FromPlugin must strip it via RemoveIndex before Database sees it.
    type IndexedPlugin = Database.Plugin<
        ComponentSchemas & { readonly foo: { type: 'string' }; readonly bar: { type: 'number' } },
        ResourceSchemas & { readonly baz: { default: 0 } }
    >;
    type IndexedDB = Database.FromPlugin<IndexedPlugin>;
    type IndexedRead = NonNullable<ReturnType<IndexedDB['read']>>;
    type _FromPlugin_ReadNoIndex = False<HasStringIndex<IndexedRead>>;
    type _FromPlugin_ResourcesNoIndex = False<HasStringIndex<IndexedDB['resources']>>;

    // --- End-to-end: Database from combined concrete plugins ---
    type FullDB = Database.FromPlugin<typeof _allPlugins>;
    type FullRead = NonNullable<ReturnType<FullDB['read']>>;
    type _E2E_ReadNoIndex = False<HasStringIndex<FullRead>>;
    type _E2E_ResourcesNoIndex = False<HasStringIndex<FullDB['resources']>>;

    type ServiceRead = NonNullable<ReturnType<_CityService['read']>>;
    type _E2E_ServiceReadNoIndex = False<HasStringIndex<ServiceRead>>;
    type _E2E_ServiceResourcesNoIndex = False<HasStringIndex<_CityService['resources']>>;
}

// ============================================================================
// Overload assignability test
//
// When assigning Database<C,...> to an interface with concrete read overloads
// (e.g., `read(entity, archetype: ReadonlyArchetype<District>): District | null`),
// TypeScript checks generic overload compatibility by instantiating T to `any`,
// not to the target's archetype type.
//
// The old archetype-specific read overload returned:
//   { readonly [K in StringKeyof<RequiredComponents & T>]: ... } & EntityReadValues<C>
// With T=any this produced StringKeyof<any>=string → { [x: string]: any }.
//
// The fix uses `Readonly<T> & EntityReadValues<C>` instead. When T=any,
// Readonly<any>=any, and any & EntityReadValues<C> = any, which is
// assignable to any concrete return type.
//
// This test reproduces the pattern used by consumers like firefly-platform's
// MainService interface to verify that the assignment compiles.
// ============================================================================

import type { ReadonlyArchetype } from "../archetype/archetype.js";
import type { RequiredComponents } from "../required-components.js";

type District = Readonly<{
    id: Entity;
    districtType: string;
    zoning: string;
    districtLocked: boolean;
    districtActive: boolean;
}>;

type Building = Readonly<{
    id: Entity;
    buildingType: string;
    parentDistrict: Entity;
    positionX: number;
}>;

interface CityService {
    read(entity: Entity): Readonly<Partial<District & Building> & { id: Entity }> | null;
    read(entity: Entity, archetype: ReadonlyArchetype<District>): District | null;
    read(entity: Entity, archetype: ReadonlyArchetype<Building>): Building | null;
}

{
    const _db: _CityService = null!;
    // This assignment tests that Database's generic read overload is
    // compatible with CityService's concrete read overloads.
    const _service: CityService = _db;
}
