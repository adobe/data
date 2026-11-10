// © 2026 Adobe. MIT License. See /LICENSE for details.
import { playerType } from "./constant.player-type.js";
import { sprites } from "./constant.sprites.js";
import { statusEffect } from "./constant.status-effect.js";
import { randomRange } from "./function.random-range.js";
import type { HeroMonsterValues } from "./type.hero-monster-values.js";
import type { Random } from "./type.random.js";

/**
 * `HeroMonsterEntityFactory::setComponents` for a player whose generator starts at `rng`: of `type`, or a random one
 * when it's null. The random type is drawn either way, as `value_or` evaluates its argument.
 */
export const heroMonsterValues = (rng: Random, type: number | null): HeroMonsterValues => {
    let state = rng;
    const range = (low: number, high: number): number => {
        const step = randomRange(state, low, high);
        state = step.state;
        return step.value;
    };
    const rate = range(1, 100);
    const chosen = type ?? (rate <= 3 ? playerType.npc : rate <= 30 ? playerType.hero : playerType.monster);
    let maxhp = 0;
    let def = 0;
    let atk = 0;
    if (chosen === playerType.hero) {
        maxhp = range(5, 15);
        def = range(2, 6);
        atk = range(4, 10);
    }
    else if (chosen === playerType.monster) {
        maxhp = range(4, 12);
        def = range(2, 8);
        atk = range(3, 9);
    }
    else if (chosen === playerType.npc) {
        maxhp = range(6, 12);
        def = range(3, 8);
    }
    const x = range(0, 320 + 100) - 100;
    const y = range(0, 240 + 100) - 100;
    return {
        position: { x, y },
        player: { rng: state, type: chosen },
        health: { hp: 0, maxhp, status: statusEffect.spawn },
        damage: { atk, def },
        sprite: { character: sprites.spawn },
    };
};
