// © 2026 Adobe. MIT License. See /LICENSE for details.
import { clock, System } from '@adobe/ecs';
import { place } from './component.place.js';
import { spin } from './shared/spin.js';

/** Turns each point around the vertical axis, in a kernel on the GPU. */
export const turn: System = System.create({ kernel: "gpu", components: { with: [place, spin] } }, (row, { resources }) => {
    const angle = row[spin] * resources[clock].delta / 1000;
    const [x, y, z] = row[place];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    row[place] = [x * cos - z * sin, y, x * sin + z * cos];
});
