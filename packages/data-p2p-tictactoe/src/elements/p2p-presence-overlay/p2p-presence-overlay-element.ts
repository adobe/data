// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Optional presence overlay container. Subscribes to peer cursor positions
// from the synced game database and feeds local pointer movement back through
// the `trackPresence` action. A pure container: it observes state, observes
// local pointer events (a genuine UI concern), and delegates everything else
// to the action / presentation.

import { customElement } from "lit/decorators.js";
import { DatabaseElement, useObservableValues, usePointerObserve, useEffect, useElement } from "@adobe/data-lit";
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
        const { observe, actions, concurrency } = this.service;

        const values = useObservableValues(
            () => ({ cursors: observe.resources.cursors }),
            [],
        );

        const pointerPos = usePointerObserve([]);
        const element = useElement();

        useEffect(() => {
            const positions = Observe.toAsyncGenerator(pointerPos, () => false);

            // Normalise local pointer events against the overlay's own size —
            // a DOM concern that has to live in the element — then hand the
            // stream to the action, which owns the transient transaction.
            async function* normalised() {
                for await (const [px, py] of positions) {
                    const { width, height } = element.getBoundingClientRect();
                    if (!width || !height) continue;
                    yield { x: px / width, y: py / height };
                }
            }

            actions.trackPresence(normalised);

            return () => {
                void positions.throw(new Error("disposed")).catch(() => undefined);
            };
        }, [pointerPos, element]);

        // The peer identity is the rebase-replay concurrency userId (set to the
        // player's mark when the game DB was created); survives the restricted
        // view since it is a plain value.
        const localMark = concurrency.userId;

        return presentation.render({ cursors: values?.cursors, localMark });
    }
}
