// © 2026 Adobe. MIT License. See /LICENSE for details.
import { mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { guidePackages } from "../../guide-packages.ts";

const guide = fileURLToPath(new URL("../..", import.meta.url));
const scratch = join(realpathSync(join(guide, "node_modules", "@adobe", "ecs-persistence")), ".vanishing");

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

it("reads its packages while a test's scratch folder in one, beside its sources, holds a file gone as it's read", () => {
    mkdirSync(scratch, { recursive: true });
    symlinkSync(join(scratch, "removed.ts"), join(scratch, "gone.ts"));
    const { load } = guidePackages(guide);
    if (typeof load !== "function") throw new Error("guide-packages has no load");
    const loaded: unknown = Reflect.apply(load, { addWatchFile: () => undefined }, ["\0virtual:guide-packages"]);
    expect(loaded).toEqual(expect.stringContaining("@adobe/ecs-persistence"));
});
