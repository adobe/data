// © 2026 Adobe. MIT License. See /LICENSE for details.
import { DragPosition } from "../../../data/drag-position/drag-position.js";

// Live vertical pixel offset while a todo is being dragged — pure local UI
// gesture state: `nonPersistent: true` keeps it out of snapshots and
// `nonShared: true` keeps it off the wire (your drag isn't your peers' drag).
export const dragPosition = { ...DragPosition.schema, nonPersistent: true, nonShared: true };
