// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { health } from "../shared/component.health.js";
import { player } from "../shared/component.player.js";
import { sprite } from "../shared/component.sprite.js";
import { playerType } from "../shared/constant.player-type.js";
import { sprites } from "../shared/constant.sprites.js";
import { statusEffect } from "../shared/constant.status-effect.js";
import { gpuDamageSystem } from "./system.gpu-damage-system.js";

/** `SpriteSystem` as a GPU kernel: the character for the status and, alive, the player's type. */
export const gpuSpriteSystem: System = System.create({ kernel: "gpu", components: { with: [sprite, player, health] }, after: [gpuDamageSystem] }, row => {
    const status = row[health].status;
    const type = row[player].type;
    const alive = type === playerType.hero ? sprites.player : type === playerType.monster ? sprites.monster : type === playerType.npc ? sprites.npc : sprites.none;
    row[sprite] = { character: status === statusEffect.alive ? alive : status === statusEffect.dead ? sprites.grave : status === statusEffect.spawn ? sprites.spawn : sprites.none };
});
