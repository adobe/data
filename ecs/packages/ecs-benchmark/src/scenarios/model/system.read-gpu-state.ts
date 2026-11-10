// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { gpuData } from "./gpu/component.gpu-data.js";
import { damage } from "./shared/component.damage.js";
import { health } from "./shared/component.health.js";
import { player } from "./shared/component.player.js";
import { position } from "./shared/component.position.js";
import { sprite } from "./shared/component.sprite.js";
import { velocity } from "./shared/component.velocity.js";
import { frameBuffer } from "./shared/resource.frame-buffer.js";
import type { GpuState } from "./gpu/type.gpu-state.js";

const named = { position, velocity, data: gpuData, player, health, damage, sprite } as const;

/** Reads `GpuState`, to compare what the GPU lane's frames compute on the GPU and on the CPU. */
export const readGpuState: System<void, GpuState> = System.create(
    { readonly: true, tables: { components: Object.values(named), resources: [frameBuffer] } },
    ({ tables }) => {
        const components: { [name: string]: { bytes: Uint8Array; stride: number } } = {};
        for (const [name, key] of Object.entries(named)) {
            const parts = tables.archetypes.flatMap(table => {
                const column = table.columns[key];
                return column?.kind === "bytes" ? [column] : [];
            });
            const bytes = new Uint8Array(parts.reduce((total, part) => total + part.bytes.length, 0));
            let at = 0;
            for (const part of parts) {
                bytes.set(part.bytes, at);
                at += part.bytes.length;
            }
            components[name] = { bytes, stride: parts[0]?.stride ?? 0 };
        }
        return { components, frame: Uint8Array.from(tables.resources[frameBuffer] ?? []) };
    },
);
