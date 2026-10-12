import { describe, expect, test } from "vitest";
import { Mat4x4 } from "./index.js";
import { Quat } from "../quat/index.js";

describe("lookAt", () => {
    test("rejects an up vector parallel to the view direction", () => {
        expect(() => Mat4x4.lookAt([0, 0, 0], [0, 1, 0], [0, 1, 0])).toThrow("Up vector cannot be parallel to view direction");
    });

    test("as a quaternion, stays finite for an up vector parallel to the view direction", () => {
        expect(Quat.lookAt([0, 1, 0], [0, 1, 0]).every(Number.isFinite)).toBe(true);
    });
});
