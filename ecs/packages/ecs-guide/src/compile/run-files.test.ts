// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { hookModules, runFiles } from "./run-files.js";

it("gives a run's page an import map sending every specifier compiled code imports from the package to its exports", () => {
    const files = runFiles(4, "https://guide/assets/runtime.js", ["System", "start"], [{ path: "/node_modules/@adobe/ecs/src/guide/01-resources.ts", code: "export {};" }]);
    expect(files.map(file => file.path)).toEqual(["index.html", "exports.js", "node_modules/@adobe/ecs/src/guide/01-resources.ts"]);
    const page = files[0]?.text ?? "";
    const map: unknown = JSON.parse(/<script type="importmap">(.*)<\/script>/.exec(page)?.[1] ?? "null");
    expect(map).toEqual({ imports: Object.fromEntries(["@adobe/ecs", "@ecs-guide/guard", ...hookModules, "./node_modules/@adobe/ecs/src/index.js"].map(specifier => [specifier, "./exports.js"])) });
    expect(page).toContain(`start(4, ["./node_modules/@adobe/ecs/src/guide/01-resources.ts"])`);
    expect(page).toContain(`<div id="output"></div>`);
    expect(files[1]?.text).toBe(`import "https://guide/assets/runtime.js";\nconst runtime = globalThis[Symbol.for("ecs-guide/runtime")];\nexport const { System, start } = runtime;\n`);
});
