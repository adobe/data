// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseElement } from "@adobe/data-lit";
import { p2pPlugin } from "../state/p2p-plugin.js";
import type { PlayerMark } from "../types/player-mark/player-mark.js";

/**
 * Base class for all P2P Tic-Tac-Toe elements.
 *
 * Extends `DatabaseElement` from `@adobe/data-lit`, which:
 *   - owns or inherits the ECS `service` via DOM ancestor traversal
 *   - wires `withHooks` so hooks work inside render()
 *
 * `myMark` is the only ambient piece of context the children rely on; it
 * lives in the ephemeral `myMark` resource on the ECS so children read it
 * without prop-drilling. There is intentionally no `syncClient` getter —
 * the sync service is invisible: all mutations flow through
 * `this.service.transactions.X(args)`.
 */
export abstract class P2pElement extends DatabaseElement<typeof p2pPlugin> {
    get plugin() {
        return p2pPlugin;
    }

    get myMark(): PlayerMark {
        return this.service.resources.myMark!;
    }
}
