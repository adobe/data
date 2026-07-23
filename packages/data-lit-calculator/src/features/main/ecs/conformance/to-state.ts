// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read a store back into a `data/` `State` — the inverse of `fromState`. The
// calculator's whole state is the singleton `calculator` resource, which *is* a
// `State`, so reading it back is a single access. Test-only.
export const toState = (store: CoreDatabase.Store): State => store.resources.calculator;
