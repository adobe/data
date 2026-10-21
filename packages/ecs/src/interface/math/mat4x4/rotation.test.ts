import { describe, expect, test } from "vitest";
import { Mat4x4 } from "./index.js";
import { Quat } from "../quat/index.js";

const close = (actual: readonly number[], expected: readonly number[]): void =>
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));

describe("rotations", () => {
    test("turn counterclockwise about their axis, as the axis-angle quaternion does", () => {
        close(Mat4x4.rotationX(0.7), Quat.toMat4(Quat.fromAxisAngle([1, 0, 0], 0.7)));
        close(Mat4x4.rotationY(0.7), Quat.toMat4(Quat.fromAxisAngle([0, 1, 0], 0.7)));
        close(Mat4x4.rotationZ(0.7), Quat.toMat4(Quat.fromAxisAngle([0, 0, 1], 0.7)));
        close(Mat4x4.multiplyVec3(Mat4x4.rotationY(Math.PI / 2), [1, 0, 0]), [0, 0, -1]);
        close(Mat4x4.multiplyVec3(Mat4x4.rotationZ(Math.PI / 2), [1, 0, 0]), [0, 1, 0]);
    });
});
