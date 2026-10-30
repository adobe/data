// © 2026 Adobe. MIT License. See /LICENSE for details.
import { modules } from "virtual:guide-runtime";
import { attachKernel } from "../../../ecs/dist/implementation/world/attach-kernel.js";
import { prepareLookup } from "../../../ecs/dist/implementation/world/prepared-lookup.js";
import { prepareAdd, prepareSpawn } from "../../../ecs/dist/implementation/world/prepared-spawn.js";
import { callGuard, loopGuard } from "./guard.js";
import { start } from "./program.js";
import { runtimeKey } from "./runtime-key.js";

/**
 * What a run's frame loads first: the guide's packages, the ECS's hooks compiled code imports, `start`, which runs the
 * program, and the checks loop protection puts in its code. A worker's bundle keeps no exports, so it puts them on the
 * frame's global object, under `runtimeKey`, and each run's exports modules, which its import map gives every one of
 * their specifiers, re-export them from there: a package's from `packages`, by its name.
 */
Reflect.set(globalThis, runtimeKey, { packages: modules, attachKernel, prepareLookup, prepareAdd, prepareSpawn, start, loopGuard, callGuard });
