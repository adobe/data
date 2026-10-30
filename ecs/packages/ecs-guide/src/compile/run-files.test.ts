// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { hookModules, runFiles } from "./run-files.js";

it("gives a run's page an import map sending each package, as compiled code imports it, to its exports, and the runtime's own to the runtime's", () => {
    const packages = [{ name: "@adobe/ecs", names: ["System"] }, { name: "@adobe/ecs-gpu", names: ["Frame", "View"] }];
    const files = runFiles(4, "https://guide/assets/runtime.js", packages, [{ path: "/node_modules/@adobe/ecs-gpu/src/guide/01-devices.ts", code: "export {};" }]);
    expect(files.map(file => file.path)).toEqual(["index.html", "exports.js", "package-0.js", "package-1.js", "node_modules/@adobe/ecs-gpu/src/guide/01-devices.ts"]);
    const page = files[0]?.text ?? "";
    const map: unknown = JSON.parse(/<script type="importmap">(.*)<\/script>/.exec(page)?.[1] ?? "null");
    expect(map).toEqual({
        imports: {
            ...Object.fromEntries(["@ecs-guide/guard", ...hookModules].map(specifier => [specifier, "./exports.js"])),
            "@adobe/ecs": "./package-0.js", "./node_modules/@adobe/ecs/src/index.js": "./package-0.js",
            "@adobe/ecs-gpu": "./package-1.js", "./node_modules/@adobe/ecs-gpu/src/index.js": "./package-1.js",
        },
    });
    expect(page).toContain(`start(4, ["./node_modules/@adobe/ecs-gpu/src/guide/01-devices.ts"])`);
    expect(page).toContain(`<div id="output"></div>`);
    expect(files[1]?.text).toBe(`import "https://guide/assets/runtime.js";\nconst runtime = globalThis[Symbol.for("ecs-guide/runtime")];\nexport const { attachKernel, prepareLookup, prepareAdd, prepareSpawn, start, loopGuard, callGuard } = runtime;\n`);
    expect(files[3]?.text).toBe(`import "https://guide/assets/runtime.js";\nconst runtime = globalThis[Symbol.for("ecs-guide/runtime")].packages["@adobe/ecs-gpu"];\nexport const { Frame, View } = runtime;\n`);
});
