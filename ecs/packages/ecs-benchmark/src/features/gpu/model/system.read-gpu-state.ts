// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { damage, frameBuffer, health, player, position, sprite, velocity } from "../../../model/index.js";
import { gpuData } from "./component.gpu-data.js";

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

/** What the GPU lane's entities hold: by component, its rows' bytes, `stride` a row, in archetype and row order; and the frame. */
type GpuState = { readonly components: { readonly [name: string]: { readonly bytes: Uint8Array; readonly stride: number } }; readonly frame: Uint8Array };
