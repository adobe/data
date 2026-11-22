// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { document } from "../../../document/model/index.js";

/** The document's path in the library, null for one not yet saved. */
export const documentPath: System<void, string | null> = System.create({ readonly: true }, ({ resources }) => resources[document].path);
