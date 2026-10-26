// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as ecs from "@adobe/ecs";
import { attachKernel } from "../../../ecs/dist/implementation/world/attach-kernel.js";
import { prepareLookup } from "../../../ecs/dist/implementation/world/prepared-lookup.js";
import { prepareAdd, prepareSpawn } from "../../../ecs/dist/implementation/world/prepared-spawn.js";
import { callGuard, loopGuard } from "./guard.js";
import { start } from "./program.js";
import { runtimeKey } from "./runtime-key.js";

/**
 * What a run's frame loads first: the package, the hooks compiled code imports from it, `start`, which runs the
 * program, and the checks loop protection puts in its code. A worker's bundle keeps no exports, so it puts them on the frame's global object, under `runtimeKey`, and
 * each run's exports module, which its import map gives every one of their specifiers, re-exports them from there.
 */
Reflect.set(globalThis, runtimeKey, { ...ecs, attachKernel, prepareLookup, prepareAdd, prepareSpawn, start, loopGuard, callGuard });
