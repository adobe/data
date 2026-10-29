// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, type F32, System, Vec2, Vec3 } from '../../index.js';

/** Systems of each kind the descriptions tell apart (`describe.test.ts`), compiled by the plugin and described from this source. */

export const position = Symbol("describeTest/position");
export const velocity = Symbol("describeTest/velocity");
export const spot = Symbol("describeTest/spot");
export const drift = Symbol("describeTest/drift");
export const label = Symbol("describeTest/label");
export const bonus = Symbol("describeTest/bonus");
export const score = Symbol("describeTest/score");
export const flag = Symbol("describeTest/flag");
export const target = Symbol("describeTest/target");
export const aim = Symbol("describeTest/aim");
export const delta = Symbol("describeTest/delta");
export const total = Symbol("describeTest/total");

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [spot]: { type: Vec2 };
        [drift]: { type: Vec2 };
        [label]: { type: string };
        [bonus]: { type: F32 };
        [score]: { type: number };
        [flag]: { type: boolean };
        [target]: { type: Entity };
        [aim]: { type: number };
    }
    export interface Resources {
        [delta]: { type: F32; default: 0.5 };
        [total]: { type: number; reduce: "+" };
    }
}

export const automatic = System.create({ components: { with: [velocity, position] } }, (row, { resources }) => {
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], resources[delta]));
});

export const asserted = System.create({ kernel: true, components: { with: [velocity, position] } }, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

export const shaded = System.create({ kernel: "gpu", components: { with: [drift, spot] } }, row => {
    row[spot] = Vec2.add(row[spot], row[drift]);
});

export const spawn = System.create(({ commands }) => {
    commands.spawn([position, velocity])({ [position]: [0, 0, 0], [velocity]: [1, 0, 0] });
});

export const observe = System.create({ readonly: true, components: { with: [position] } }, row => {
    console.log(row[position]);
});

export const named = System.create({ components: { with: [label, score] } }, row => {
    row[score] = row[label].length;
});

export const optional = System.create({ components: { with: [score], optional: [bonus] } }, row => {
    row[score] = row[score] + (row[bonus] ?? 1);
});

export const unflagged = System.create({ kernel: false, components: { with: [velocity] } }, row => {
    row[velocity] = Vec3.scale(row[velocity], 0.5);
});

export const draw = System.render({ shader: { accessors: { dotPosition: spot } } }, ({ tables }) => {
    console.log(tables.length);
});

export const filtered = System.create({ components: { with: [score], changed: [score] } }, row => {
    row[score] = Math.max(row[score], 0) % 7;
});

export const looked = System.create({ components: { with: [target, aim] }, lookup: { other: { with: [score, flag], changed: [score] } } }, (row, { lookup }) => {
    const found = lookup.other(row[target]);
    row[aim] = found === null ? 0 : found[flag] ? found[score] : -found[score];
});

export const summed = System.create({ components: { with: [score] } }, (row, { reduce }) => {
    reduce[total](row[score]);
});

export const inputs = System.create({ components: { with: [score] } }, (row, _context, input: { readonly by: number; readonly negate: boolean }) => {
    row[score] = input.negate ? -row[score] * input.by : row[score] * input.by;
});

export const hypotenuse = System.create({ components: { with: [score] } }, row => {
    row[score] = Math.hypot(row[score], 1, 2);
});

export const nested = (): unknown => System.create({ components: { with: [score] } }, row => {
    row[score] = 1;
});
