import type { Gpu } from '../index.js';
import { System } from '../system/system.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const tint = 'gpuTypeTest/tint';
declare module '@adobe/data-ecs' {
    export interface Components {
        [tint]: { type: number };
    }
}

// Gpu.wgsl and Gpu.layout are the implementation's; their types are here.
declare const wgsl: Gpu.Wgsl;
declare const layout: Gpu.Layout;
declare const device: GPUDevice;
const draw = System.render({ name: "gpuTypeTest/draw", shader: { accessors: { tint } } }, () => {});
const code: string = wgsl(draw);
check<Equal<ReturnType<Gpu.Layout>, GPUBindGroupLayout>>();
export const used = [code, layout(device)];
