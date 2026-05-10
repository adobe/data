// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement } from "lit";
import { property } from "lit/decorators.js";
import { attachDecorator, withHooks } from "@adobe/data-lit";
import type { SyncClient } from "@adobe/data-sync";
import type { P2pDatabase, PlayerMark } from "../state/p2p-plugin.js";

/**
 * Base class for all in-game P2P elements.
 *
 * Mirrors the role of `DatabaseElement` in the standard data-lit pattern but
 * carries three things every game element needs:
 *   - `service`    — the reconciling ECS database (reactive reads via useObservableValues)
 *   - `syncClient` — the sync client (mutations via propose / sendTransient)
 *   - `myMark`     — which player this browser is ("X" or "O")
 *
 * `withHooks` is attached so that hooks like `useObservableValues`,
 * `usePointerObserve`, and `useEffect` work inside `render()`.
 */
export abstract class P2pElement extends LitElement {
    @property({ type: Object })
    service!: P2pDatabase;

    @property({ type: Object })
    syncClient!: SyncClient;

    @property({ type: String })
    myMark!: PlayerMark;

    constructor() {
        super();
        attachDecorator(this as any, "render", withHooks);
    }
}
