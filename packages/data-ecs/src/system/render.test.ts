import { describe, expect, it } from "vitest";
import { System } from "./system.js";

const position = "renderTest/position";
const color = "renderTest/color";
const visible = "renderTest/visible";

declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: { type: readonly [number, number] };
        [color]: { type: number };
        [visible]: { type: true };
    }
    export interface Systems {
        "renderTest/draw": true;
    }
}

describe("render systems", () => {
    it("read the components their accessors name, once each", () => {
        const draw = System.render({ name: "renderTest/draw", components: { has: [visible] }, shader: { accessors: { place: position, tint: color, again: position } } }, () => {});
        expect(draw.declaration.components).toEqual({ has: [visible], read: [position, color] });
    });
});
