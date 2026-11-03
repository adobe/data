// © 2026 Adobe. MIT License. See /LICENSE for details.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(packageRoot, "node_modules", ".bin", "ecs-architecture");

/** What `ecs-architecture` prints for `args` in this package, as an app runs it; a failing command throws, printing it. */
const run = (...args: string[]): string => execFileSync(cli, args, { cwd: packageRoot, encoding: "utf8" });

it("follows the architecture standard", () => {
    expect(run("check")).toMatch(/^architecture ok/);
});

it("has its diagrams and the repository's agent rules up to date", () => {
    expect(run("diagrams", "--check")).toBe("diagrams ok\n");
    expect(run("agents", "--check")).toBe("agent rules ok\n");
});
