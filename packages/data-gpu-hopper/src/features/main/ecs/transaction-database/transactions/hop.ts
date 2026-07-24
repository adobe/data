// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../data/state/state.js";
import type { Direction } from "../../../data/direction/direction.js";
import type { CoreDatabase } from "../../core-database/core-database.js";
import { readFrog } from "./read-frog.js";

// Hop the frog one cell (see State.hop). Board bounds and status come from
// resources; the decision is the pure `data/` transform, and this only writes
// the resulting position back to the frog entity. A no-op while not playing
// writes the same values, so it stays idempotent.
export const hop = (t: CoreDatabase.Store, direction: Direction) => {
  const { id, frog } = readFrog(t);
  const next = State.hop(
    { frog, width: t.resources.width, height: t.resources.height, status: t.resources.status },
    direction,
  );
  t.update(id, { x: next.frog.x, y: next.frog.y });
};
