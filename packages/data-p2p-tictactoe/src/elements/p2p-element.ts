// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseElement } from "@adobe/data-lit";
import type { SyncClient } from "@adobe/data-sync";
import { p2pPlugin, type PlayerMark } from "../state/p2p-plugin.js";

/**
 * Base class for all P2P Tic-Tac-Toe elements.
 *
 * Extends `DatabaseElement` from @adobe/data-lit, which:
 *   - owns or inherits the ECS `service` via DOM ancestor traversal
 *   - wires `withHooks` so hooks work inside render()
 *
 * `syncClient` and `myMark` are read from the ECS service — no prop
 * drilling required. Child elements just read `this.syncClient` / `this.myMark`
 * and the values come from wherever the ephemeral ECS resources were set.
 */
export abstract class P2pElement extends DatabaseElement<typeof p2pPlugin> {
    get plugin() {
        return p2pPlugin;
    }

    get syncClient(): SyncClient {
        return this.service.resources.syncClient!;
    }

    get myMark(): PlayerMark {
        return this.service.resources.myMark!;
    }
}
