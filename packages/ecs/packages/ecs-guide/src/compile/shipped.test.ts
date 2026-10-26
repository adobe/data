// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import manifest from "../../../ecs/package.json?raw";
import { filesOf, shippedBy } from "./shipped.js";

it("ships what the package's files list says, the last pattern matching deciding", () => {
    const shipped = shippedBy(filesOf(manifest));
    expect(shipped("dist/index.js")).toBe(true);
    expect(shipped("dist/interface/math/vec3/index.d.ts")).toBe(true);
    expect(shipped("dist/interface/math/vec3/vec3.test.js")).toBe(false);
    expect(shipped("dist/interface/index.type-test.d.ts")).toBe(false);
    expect(shipped("dist/guide/01-resources.test.js")).toBe(false);
    expect(shipped("dist/guide.js")).toBe(true);
    expect(shipped("dist/perftest/run.js")).toBe(false);
    expect(shipped("dist/index.tsbuildinfo")).toBe(false);
    expect(shipped("src/interface/index.ts")).toBe(true);
    expect(shipped("LICENSE")).toBe(true);
    expect(shipped("README.md")).toBe(false);
    expect(shipped("package.json")).toBe(false);
});
