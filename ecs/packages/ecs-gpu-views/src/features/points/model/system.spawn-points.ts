// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { hue } from './component.hue.js';
import { place } from './component.place.js';
import { spin } from './shared/spin.js';

/** Points in a ring of rings, turning at speeds of their own. */
export const spawnPoints: System<{ readonly count: number }> = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) {
        const angle = i * 2.399963;
        const radius = 1 + (i % 64) / 32;
        commands.spawn([place, spin, hue])({
            [place]: [Math.cos(angle) * radius, ((i * 7) % 97) / 97 - 0.5, Math.sin(angle) * radius],
            [spin]: 0.2 + (i % 5) * 0.1,
            [hue]: (i % 360) / 360,
        });
    }
});
