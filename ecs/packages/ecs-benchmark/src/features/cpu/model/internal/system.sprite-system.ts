// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { health, player, playerType, sprite, sprites, statusEffect } from "../../../../model/index.js";
import { damageSystem } from "./system.damage-system.js";

/** `SpriteSystem`: the character for the status and, alive, the player's type. */
export const spriteSystem: System = System.create({ kernel: true, components: { with: [sprite, player, health] }, after: [damageSystem] }, row => {
    const status = row[health].status;
    const type = row[player].type;
    const alive = type === playerType.hero ? sprites.player : type === playerType.monster ? sprites.monster : type === playerType.npc ? sprites.npc : sprites.none;
    row[sprite] = { character: status === statusEffect.alive ? alive : status === statusEffect.dead ? sprites.grave : status === statusEffect.spawn ? sprites.spawn : sprites.none };
});
