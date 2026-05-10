// © 2026 Adobe. MIT License. See /LICENSE for details.

import { property } from "lit/decorators.js";
import { DatabaseElement } from "@adobe/data-lit";
import type { SyncClient } from "@adobe/data-sync";
import { p2pPlugin, type PlayerMark } from "../state/p2p-plugin.js";

/**
 * Base class for all in-game P2P elements.
 *
 * Extends the standard `DatabaseElement` from @adobe/data-lit, which:
 *   - owns the `service` property (the ECS database)
 *   - wires `withHooks` so that useObservableValues, usePointerObserve,
 *     useEffect, etc. all work inside render()
 *   - propagates `service` via DOM ancestor traversal
 *
 * We add two P2P-specific properties on top:
 *   - `syncClient` — mutations go through propose/sendTransient, not
 *     db.transactions directly, so the sync layer sees every change
 *   - `myMark`     — which player this browser is ("X" or "O")
 */
export abstract class P2pElement extends DatabaseElement<typeof p2pPlugin> {
    get plugin() {
        return p2pPlugin;
    }

    @property({ type: Object })
    syncClient!: SyncClient;

    @property({ type: String })
    myMark!: PlayerMark;
}
