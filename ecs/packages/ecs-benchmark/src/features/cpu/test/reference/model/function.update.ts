// © 2026 Adobe. MIT License. See /LICENSE for details.
import { next } from "./function.next.js";
import { playerType } from "./internal/constant.player-type.js";
import { statusEffect } from "./internal/constant.status-effect.js";
import { range } from "./internal/function.range.js";
import type { Reference } from "./type.reference.js";

/** One frame of `Application::update`, its two basic systems or all seven, drawing each character at its cell. */
export const update = (entities: readonly Reference[], complex: boolean, draw: (cell: number, character: number) => void): void => {
    for (const { position, velocity } of entities) {
        if (position === undefined || velocity === undefined) continue;
        position.x = Math.fround(position.x + Math.fround(velocity.x * dt));
        position.y = Math.fround(position.y + Math.fround(velocity.y * dt));
    }
    for (const { data } of entities) {
        if (data === undefined) continue;
        data.thingy = (data.thingy + 1) % 1000000;
        data.dingy += 0.0001 * dt;
        data.mingy = !data.mingy;
        data.numgy = next(data.rng);
    }
    if (!complex) return;
    for (const { position, velocity, data } of entities) {
        if (position === undefined || velocity === undefined || data === undefined || data.thingy % 10 !== 0) continue;
        if (position.x > position.y) {
            velocity.x = range(data.rng, 3, 19) - 10;
            velocity.y = range(data.rng, 0, 5);
        }
        else {
            velocity.x = range(data.rng, 0, 5);
            velocity.y = range(data.rng, 3, 19) - 10;
        }
    }
    for (const { health } of entities) {
        if (health === undefined) continue;
        if (health.hp <= 0 && health.status !== statusEffect.dead) {
            health.hp = 0;
            health.status = statusEffect.dead;
        }
        else if (health.status === statusEffect.dead && health.hp === 0) {
            health.hp = health.maxhp;
            health.status = statusEffect.spawn;
        }
        else if (health.hp >= health.maxhp && health.status !== statusEffect.alive) {
            health.hp = health.maxhp;
            health.status = statusEffect.alive;
        }
        else health.status = statusEffect.alive;
    }
    for (const { health, damage } of entities) {
        if (health === undefined || damage === undefined) continue;
        const total = damage.atk - damage.def;
        if (health.hp > 0 && total > 0) health.hp = Math.max(health.hp - total, 0);
    }
    for (const { sprite, player, health } of entities) {
        if (sprite === undefined || player === undefined || health === undefined) continue;
        if (health.status === statusEffect.alive) sprite.character = player.type === playerType.hero ? 64 : player.type === playerType.monster ? 107 : player.type === playerType.npc ? 104 : 32;
        else sprite.character = health.status === statusEffect.dead ? 124 : health.status === statusEffect.spawn ? 95 : 32;
    }
    for (const { position, sprite } of entities) {
        if (position === undefined || sprite === undefined) continue;
        const x = Math.trunc(position.x), y = Math.trunc(position.y);
        if (y >= 0 && y < 240 && x >= 0 && x < 320) draw(x + y * 320, sprite.character);
    }
};

const dt = Math.fround(1 / 60);
