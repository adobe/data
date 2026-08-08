// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Cursors } from "../../../data/cursors/cursors.js";

/**
 * Presence state surface: the synced peer cursor positions. Written only through
 * transient (never-committed) envelopes by `movePresence`, so it needs no schema
 * flags — an absent entry simply means that peer hasn't moved yet.
 */
export const resources = {
  cursors: { default: {} as Cursors },
};
