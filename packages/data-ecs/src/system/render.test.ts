import { describe, expect, it } from "vitest";
import { System } from "./system.js";

const position = "renderTest/position";
const color = "renderTest/color";
const visible = "renderTest/visible";

declare module "../component/types.js" {
    export interface Types {
        [position]: readonly [number, number];
        [color]: number;
        [visible]: true;
    }
}
declare module "./types.js" {
    export interface Types {
        "renderTest/draw": true;
    }
}

describe("render systems", () => {
    it("read the components their accessors name, once each", () => {
        const draw = System.render({ name: "renderTest/draw", query: { has: [visible] }, render: { accessors: { place: position, tint: color, again: position } } }, () => {});
        expect(draw.declaration.query).toEqual({ has: [visible], read: [position, color] });
    });
});
