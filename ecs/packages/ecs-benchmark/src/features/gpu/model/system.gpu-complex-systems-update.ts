// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { damage, frameBuffer, frameHeight, frameWidth, health, player, playerType, position, randomRange, sprite, sprites, statusEffect, velocity } from "../../../model/index.js";
import { gpuData } from "./component.gpu-data.js";
import { gpuDataSystem } from "./internal/system.gpu-data-system.js";
import { gpuMovementSystem } from "./internal/system.gpu-movement-system.js";

/** `HealthSystem` as a GPU kernel: the dead respawn, the spawned come alive. */
const gpuHealthSystem: System = System.create({ kernel: "gpu", components: { with: [health] } }, row => {
    const value = row[health];
    if (value.hp <= 0 && value.status !== statusEffect.dead) row[health] = { hp: 0, maxhp: value.maxhp, status: statusEffect.dead };
    else if (value.status === statusEffect.dead && value.hp === 0) row[health] = { hp: value.maxhp, maxhp: value.maxhp, status: statusEffect.spawn };
    else if (value.hp >= value.maxhp && value.status !== statusEffect.alive) row[health] = { hp: value.maxhp, maxhp: value.maxhp, status: statusEffect.alive };
    else row[health] = { hp: value.hp, maxhp: value.maxhp, status: statusEffect.alive };
});

/** `DamageSystem` as a GPU kernel: health takes `atk - def` while both are positive. */
const gpuDamageSystem: System = System.create({ kernel: "gpu", components: { with: [health, damage] }, after: [gpuHealthSystem] }, row => {
    const value = row[health];
    const { atk, def } = row[damage];
    const total = atk - def;
    if (value.hp > 0 && total > 0) row[health] = { hp: Math.max(value.hp - total, 0), maxhp: value.maxhp, status: value.status };
});

/** `MoreComplexSystem` as a GPU kernel: every tenth `thingy`, a new random direction, drawn from the data's generator. */
const gpuMoreComplexSystem: System = System.create({ kernel: "gpu", components: { with: [position, velocity, gpuData] }, after: [gpuMovementSystem, gpuDataSystem] }, row => {
    const value = row[gpuData];
    if (value.thingy % 10 === 0) {
        const at = row[position];
        if (at.x > at.y) {
            const x = randomRange(value.rng, 3, 19);
            const y = randomRange(x.state, 0, 5);
            row[velocity] = { x: x.value - 10, y: y.value };
            row[gpuData] = { thingy: value.thingy, dingy: value.dingy, mingy: value.mingy, seed: value.seed, rng: y.state, numgy: value.numgy };
        }
        else {
            const x = randomRange(value.rng, 0, 5);
            const y = randomRange(x.state, 3, 19);
            row[velocity] = { x: x.value, y: y.value - 10 };
            row[gpuData] = { thingy: value.thingy, dingy: value.dingy, mingy: value.mingy, seed: value.seed, rng: y.state, numgy: value.numgy };
        }
    }
});

/** `SpriteSystem` as a GPU kernel: the character for the status and, alive, the player's type. */
const gpuSpriteSystem: System = System.create({ kernel: "gpu", components: { with: [sprite, player, health] }, after: [gpuDamageSystem] }, row => {
    const status = row[health].status;
    const type = row[player].type;
    const alive = type === playerType.hero ? sprites.player : type === playerType.monster ? sprites.monster : type === playerType.npc ? sprites.npc : sprites.none;
    row[sprite] = { character: status === statusEffect.alive ? alive : status === statusEffect.dead ? sprites.grave : status === statusEffect.spawn ? sprites.spawn : sprites.none };
});

/** `RenderSystem` as a GPU kernel: draws each sprite's character into the frame buffer at its position, truncated as `int`. */
const gpuRenderSystem: System = System.create({ kernel: "gpu", components: { with: [position, sprite] }, after: [gpuMovementSystem, gpuSpriteSystem] }, (row, { resources }) => {
    const at = row[position];
    const x = Math.trunc(at.x);
    const y = Math.trunc(at.y);
    if (y >= 0 && y < frameHeight && x >= 0 && x < frameWidth) resources[frameBuffer][x + y * frameWidth] = row[sprite].character;
});

/** `complexSystemsUpdate` as GPU kernels, its data's `dingy` an f32. */
export const gpuComplexSystemsUpdate: System = System.create([gpuMovementSystem, gpuDataSystem, gpuMoreComplexSystem, gpuHealthSystem, gpuDamageSystem, gpuSpriteSystem, gpuRenderSystem]);
