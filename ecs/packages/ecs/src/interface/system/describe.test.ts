// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Index } from "../indexes/index-type.js";
import { System } from "./system.js";

const position = Symbol("describeTest/position");
const cell = Symbol("describeTest/cell");
const speed = Symbol("describeTest/speed");
const hover = Symbol("describeTest/hover");

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: number };
        [cell]: { type: number };
    }
    export interface Resources {
        [speed]: { type: number };
        [hover]: { type: number };
    }
}

const byCell = Index.create({ key: [cell] });

const spawnCells = System.create(({ commands }) => { commands.spawn([position])({ [position]: 1 }); });
const move = System.create({ components: { with: [position] }, after: [spawnCells] }, (row, { resources }) => { row[position] += resources[speed]; });
const deriveCells = System.create({ components: { with: [position], not: [cell] }, after: [move] }, (row, { commands }) => { commands.add(row.entity, cell, row[position]); });
const pick = System.create({ lookup: { cells: { index: byCell } }, after: [deriveCells] }, ({ lookup, resources }) => { resources[hover] = lookup.cells(1).length; });
const nudge = System.create({ components: { with: [position], whole: true } }, row => { Reflect.set(row, position, 0); });
const watch = System.create({ readonly: true, components: { with: [position] } }, row => { void row[position]; });
const frame = System.create([spawnCells, move, deriveCells, pick, watch]);

describe("System.describe", () => {
    it("gives tiers in run order, readonly systems apart, and what each system uses, as data", () => {
        const described = System.describe(frame);
        expect(described.tiers.map(tier => tier.systems.map(system => system.name))).toEqual([["spawnCells"], ["move"], ["deriveCells"], ["pick"]]);
        expect(described.readonly.map(system => system.system)).toEqual([watch]);
        const [[spawning], [moving], [deriving], [picking]] = described.tiers.map(tier => tier.systems);
        expect(spawning?.commands).toEqual({ spawn: [position], add: [], remove: [], despawn: false });
        expect([moving?.components.write, moving?.resources.read, moving?.commands?.add]).toEqual([[position], [speed], []]);
        expect([deriving?.components.read, deriving?.components.not, deriving?.commands?.add]).toEqual([[position], [cell], [cell]]);
        expect([picking?.lookups, picking?.resources.write]).toEqual([[{ name: "cells", index: "byCell", read: [] }], [hover]]);
        expect(moving?.after).toEqual([{ system: spawnCells, name: "spawnCells", because: "after", conflicts: [] }]);
        expect(deriving?.after).toEqual([{ system: move, name: "move", because: "after", conflicts: [position] }]);
        expect(System.describe(nudge).tiers[0]?.systems[0]?.whole).toBe(true);
    });
    it("gives the fewest sync points between tiers whose commands a later system depends on, and why", () => {
        expect(System.describe(frame).tiers.map(tier => tier.sync)).toEqual([
            [{ from: spawnCells, to: move, keys: [position] }, { from: spawnCells, to: deriveCells, keys: [position] }],
            null,
            [{ from: deriveCells, to: pick, keys: [cell] }],
            null,
        ]);
        // Despawning may change anything a later system matches; writing values needs no sync point.
        const clear = System.create({ components: { with: [cell] } }, (row, { commands }) => { commands.despawn(row.entity); });
        const count = System.create({ components: { with: [position] }, after: [clear] }, row => { void row[position]; });
        const tally = System.create({ after: [count] }, ({ resources }) => { resources[hover] = resources[speed]; });
        expect(System.describe(System.create([clear, count, tally])).tiers.map(tier => tier.sync)).toEqual([[{ from: clear, to: count, keys: [] }], null, null]);
    });
    it("gives a text form to read", () => {
        expect(System.describe(frame).text).toBe([
            "tier 0  spawnCells   commands  spawn describeTest/position",
            "sync    spawnCells's commands of describeTest/position, for move",
            "        spawnCells's commands of describeTest/position, for deriveCells",
            "tier 1  move         writes    describeTest/position",
            "                     resources reads describeTest/speed",
            "                     after     spawnCells (after)",
            "tier 2  deriveCells  reads     describeTest/position",
            "                     requires  not describeTest/cell",
            "                     commands  add describeTest/cell",
            "                     after     move (after: describeTest/position)",
            "sync    deriveCells's commands of describeTest/cell, for pick",
            "tier 3  pick         resources writes describeTest/hover",
            "                     looks up  cells through byCell",
            "                     after     deriveCells (after)",
            "readonly",
            "        watch        reads     describeTest/position",
        ].join("\n"));
    });
});
