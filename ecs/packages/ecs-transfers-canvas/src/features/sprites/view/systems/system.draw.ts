// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { move, position, surface, texture } from '../../model/index.js';
import { clear } from './system.clear.js';

/** Draws each sprite's texture where it is. */
export const draw: System = System.create({ components: { with: [texture, position] }, after: [clear, move] }, (row, { resources }) => {
    const [x, y] = row[position];
    resources[surface]?.getContext("2d")?.drawImage(row[texture], x, y);
});
