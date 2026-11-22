// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { library } from "../../model/index.js";

/** Whether there's a library folder, one that needs reconnecting, or one ready. */
export const libraryState: System<void, "none" | "permission" | "ready"> = System.create({ readonly: true }, ({ resources }) => resources[library].state);
