// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { State } from "../../data/state/state.js";

// The calculator has no entities — its whole model is one singleton value — so
// its state materialises as a single resource of the `data/` `State` type. Its
// identity stays in data/state (never re-spelled here), and its initial value is
// the data-layer's own `State.create()`. A resource is one slot per database, so
// the plain `{ default }` pattern is used — no typed-buffer schema is warranted.
export const resources = Database.resources({
  // session = client-local (nonShared) + ephemeral (nonPersistent): a live
  // calculator is not shared with peers and need not survive a reload.
  session: {
    calculator: { default: State.create() },
  },
});
