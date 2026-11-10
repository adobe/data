// © 2026 Adobe. MIT License. See /LICENSE for details.

/** What the GPU lane's entities hold: by component, its rows' bytes, `stride` a row, in archetype and row order; and the frame. */
export type GpuState = { readonly components: { readonly [name: string]: { readonly bytes: Uint8Array; readonly stride: number } }; readonly frame: Uint8Array };
