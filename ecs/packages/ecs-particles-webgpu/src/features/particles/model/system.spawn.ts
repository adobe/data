// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { color } from './component.color.js';
import { enabled } from './component.enabled.js';
import { position } from './component.position.js';
import { visible } from './component.visible.js';
import { mass } from './shared/component.mass.js';
import { velocity } from './shared/component.velocity.js';

/** Spawns `count` particles over a field `width` by `height` pixels; entity i goes to archetype i % 4. */
export const spawn: System<{ readonly count: number; readonly width: number; readonly height: number }> = System.create({
}, ({ commands }, { count, width, height }: { readonly count: number; readonly width: number; readonly height: number }) => {
    const next = random(7);
    for (let i = 0; i < count; i++) {
        const p = [next() * width, next() * height, 0] as const;
        const angle = next() * Math.PI * 2;
        const speed = 0.25 + next() * 1.75;
        const v = [Math.cos(angle) * speed, Math.sin(angle) * speed, 0] as const;
        // Opaque, in the colors' upper half so they show on black: RGBA bytes, red lowest.
        const rgb = 0x808080 | Math.floor(next() * 0x1000000);
        commands.spawn(archetypes[i % 4])({ [color]: (0xff000000 | rgb) >>> 0, [mass]: 1, [position]: p, [velocity]: v });
    }
});

/** The four archetypes, by visible and enabled. */
const archetypes = [
    [color, mass, position, velocity, visible, enabled] as const,
    [color, mass, position, velocity, visible] as const,
    [color, mass, position, velocity, enabled] as const,
    [color, mass, position, velocity] as const,
] as const;

/** A deterministic sequence in [0, 1), so every mode starts from the same particles. */
const random = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
};
