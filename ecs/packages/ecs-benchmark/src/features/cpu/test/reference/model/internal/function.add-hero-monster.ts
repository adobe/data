// © 2026 Adobe. MIT License. See /LICENSE for details.
import { generator } from "../function.generator.js";
import type { Reference } from "../type.reference.js";
import { playerType } from "./constant.player-type.js";
import { statusEffect } from "./constant.status-effect.js";
import { range } from "./function.range.js";

/** `addComponents` then `initComponents`, the player's generator seeded with `seed`. */
export const addHeroMonster = (entity: Reference, seed: number, type: number | null): void => {
    const player: NonNullable<Reference["player"]> = { rng: generator(seed), type: playerType.npc };
    const health: NonNullable<Reference["health"]> = { hp: 0, maxhp: 0, status: statusEffect.spawn };
    const damage: NonNullable<Reference["damage"]> = { atk: 0, def: 0 };
    entity.position ??= { x: 0, y: 0 };
    const rate = range(player.rng, 1, 100);
    player.type = type ?? (rate <= 3 ? playerType.npc : rate <= 30 ? playerType.hero : playerType.monster);
    if (player.type === playerType.hero) {
        health.maxhp = range(player.rng, 5, 15);
        damage.def = range(player.rng, 2, 6);
        damage.atk = range(player.rng, 4, 10);
    }
    else if (player.type === playerType.monster) {
        health.maxhp = range(player.rng, 4, 12);
        damage.def = range(player.rng, 2, 8);
        damage.atk = range(player.rng, 3, 9);
    }
    else {
        health.maxhp = range(player.rng, 6, 12);
        damage.def = range(player.rng, 3, 8);
        damage.atk = 0;
    }
    entity.position.x = Math.fround(range(player.rng, 0, 420) - 100);
    entity.position.y = Math.fround(range(player.rng, 0, 340) - 100);
    Object.assign(entity, { player, health, damage, sprite: { character: 95 } });
};
