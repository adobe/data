// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from '../component/component.js';
import type { Gpu } from '../index.js';
import { System } from '../system/system.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const tint = Symbol("gpuTypeTest/tint");
declare module '@adobe/ecs' {
    export interface Components {
        [tint]: { type: number };
    }
}
Component.register(tint, { type: { type: "number" } });

declare const wgsl: typeof Gpu.wgsl;
declare const layout: typeof Gpu.layout;
// @ts-expect-error the type of Gpu.wgsl is typeof Gpu.wgsl, not a name of its own
export type Wgsl = Gpu.Wgsl;
// @ts-expect-error the type of Gpu.layout is typeof Gpu.layout, not a name of its own
export type Layout = Gpu.Layout;
check<Equal<typeof Gpu.wgsl, (system: System<unknown>) => string>>();
declare const device: GPUDevice;
const draw = System.render({ name: "gpuTypeTest/draw", shader: { accessors: { tint } } }, () => {});
const code: string = wgsl(draw);
check<Equal<typeof Gpu.layout, (device: GPUDevice) => GPUBindGroupLayout>>();
export const used = [code, layout(device)];
