// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// The string the UI shows, projected from the `calculator` resource through the
// pure `data/` `State.display`. Only reads `resources.calculator`, so it types
// on the lowest layer that exposes it — `CoreDatabase`.
export const display = cached((db: CoreDatabase) =>
  Observe.withFilter(db.observe.resources.calculator, State.display),
);
