// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, type Vec3, type World } from '@adobe/ecs';
import { position } from './shared/component.position.js';
import { setDelta } from './shared/system.set-delta.js';
import { step } from './shared/system.step.js';

/** Runs a frame `seconds` long and returns every position it left, in spawn order. */
export const frame = async (world: World, seconds: number): Promise<readonly Vec3[]> => {
    await world.run(setDelta, { seconds });
    await world.run(step);
    positions.length = 0;
    await world.run(read);
    return [...positions];
};

const positions: Vec3[] = [];
const read = System.create({
    readonly: true,
    components: { with: [position] },
}, row => {
    positions.push(row[position]);
});
