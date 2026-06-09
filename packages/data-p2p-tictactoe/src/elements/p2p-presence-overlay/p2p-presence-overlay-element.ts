// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Optional presence overlay container. Subscribes to peer cursor positions
// from the synced game database and drives a never-ending presence
// transaction with local pointer events. Render delegates to the
// presentation; the never-ending transient lives in a `useEffect` because
// it is genuinely lifecycle-bound (cleanup must throw the generator).

import { customElement } from "lit/decorators.js";
import { DatabaseElement, useObservableValues, usePointerObserve, useEffect, useElement } from "@adobe/data-lit";
import { Database } from "@adobe/data/ecs";
import { Observe } from "@adobe/data/observe";
import { presencePlugin } from "../../state/presence-plugin.js";
import { styles } from "./p2p-presence-overlay.css.js";
import * as presentation from "./p2p-presence-overlay-presentation.js";

export const tagName = "p2p-presence-overlay";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: P2pPresenceOverlayElement;
    }
}

@customElement(tagName)
export class P2pPresenceOverlayElement extends DatabaseElement<typeof presencePlugin> {
    static styles = styles;

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
        // `this.service` is the live Database at runtime — DatabaseElement assigns
        // the real database and only narrows its *type* to the UI-restricted view
        // for pure widgets. This presence container drives a streaming
        // (async-generator) transaction and reads the local peer id, so it works
        // against the full database surface.
        const service = this.service as unknown as Database.Plugin.ToDatabase<typeof presencePlugin>;

        useEffect(() => {
            const positions = Observe.toAsyncGenerator(pointerPos, () => false);

            async function* presenceArgs() {
                for await (const [px, py] of positions) {
                    const { width, height } = element.getBoundingClientRect();
                    if (!width || !height) continue;
                    yield { x: px / width, y: py / height };
                }
            }

            service.transactions.movePresence(presenceArgs).catch(() => undefined);

            return () => {
                void positions.throw(new Error("disposed")).catch(() => undefined);
            };
        }, [pointerPos, element, service]);

        // The peer identity is the rebase-replay concurrency userId (set to the
        // player's mark by the negotiation controller); there is no `.sync` view.
        const localMark = service.concurrency.userId;

        return presentation.render({ cursors: values?.cursors, localMark });
    }
}
