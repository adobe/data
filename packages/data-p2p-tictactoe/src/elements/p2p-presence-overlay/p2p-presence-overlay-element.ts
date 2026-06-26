// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Optional presence overlay container. Subscribes to peer cursor positions
// from the synced game database and drives a never-ending presence
// transaction with local pointer events. Render delegates to the
// presentation; the never-ending transient lives in a `useEffect` because
// it is genuinely lifecycle-bound (cleanup must throw the generator).

import { customElement } from "lit/decorators.js";
import { DatabaseElement, useObservableValues, usePointerObserve, useEffect, useElement } from "@adobe/data-lit";
import { Observe } from "@adobe/data/observe";
import type { Database } from "@adobe/data/ecs";
import { UIService } from "@adobe/data/service";
import { presencePlugin } from "../../state/presence-plugin.js";
import { styles } from "./p2p-presence-overlay.css.js";
import * as presentation from "./p2p-presence-overlay-presentation.js";

export const tagName = "p2p-presence-overlay";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: P2pPresenceOverlayElement;
    }
}

type PresenceDatabase = Database.Plugin.ToDatabase<typeof presencePlugin>;

@customElement(tagName)
export class P2pPresenceOverlayElement extends DatabaseElement<typeof presencePlugin> {
    static styles = styles;

    // This container drives a streaming (async-generator) transaction and reads
    // the local peer id, so it needs the full database rather than the
    // restricted `service` view. It captures the injected database as it flows
    // through the setter and keeps it private to this element.
    #fullDatabase!: PresenceDatabase;

    override get service(): UIService.FromService<PresenceDatabase> {
        return super.service;
    }
    override set service(db: PresenceDatabase) {
        this.#fullDatabase = db;
        super.service = db;
    }

    get plugin() {
        return presencePlugin;
    }

    render() {
        const values = useObservableValues(
            () => ({ cursors: this.service.observe.resources.cursors }),
            [],
        );

        const pointerPos = usePointerObserve([]);
        const element = useElement();
        const database = this.#fullDatabase;

        useEffect(() => {
            const positions = Observe.toAsyncGenerator(pointerPos, () => false);

            async function* presenceArgs() {
                for await (const [px, py] of positions) {
                    const { width, height } = element.getBoundingClientRect();
                    if (!width || !height) continue;
                    yield { x: px / width, y: py / height };
                }
            }

            database.transactions.movePresence(presenceArgs).catch(() => undefined);

            return () => {
                void positions.throw(new Error("disposed")).catch(() => undefined);
            };
        }, [pointerPos, element, database]);

        // The peer identity is the rebase-replay concurrency userId (set to the
        // player's mark by the negotiation controller); there is no `.sync` view.
        const localMark = database.concurrency.userId;

        return presentation.render({ cursors: values?.cursors, localMark });
    }
}
