// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Optional presence overlay. Wraps any game element via <slot> and renders
// absolute-positioned cursor dots for each peer's live pointer position.

import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useObservableValues, usePointerObserve, useEffect, useElement } from "@adobe/data-lit";
import { Observe } from "@adobe/data/observe";
import { presencePlugin } from "../../state/presence-plugin.js";

export const tagName = "p2p-presence-overlay";

/**
 * Wraps a game element (via `<slot>`) and renders live cursor dots for each
 * connected peer. The overlay owns no sync logic — it reads `cursorX` and
 * `cursorO` from the injected synced database and drives `movePresence` with
 * local pointer events.
 *
 * Cursor coordinates are stored as raw pixel offsets from the overlay's
 * bounding box (as returned by `usePointerObserve`).
 *
 * Service injection: the parent must set `.service` to a database that
 * includes `presencePlugin` (typically combined with `tictactoePlugin`).
 * Children slotted inside inherit the same service automatically via the
 * `DatabaseElement` ancestor search.
 */
@customElement(tagName)
export class P2pPresenceOverlay extends DatabaseElement<typeof presencePlugin> {
    static styles = css`
        :host {
            display: block;
            position: relative;
        }

        .overlay {
            position: absolute;
            inset: 0;
            pointer-events: none;
            overflow: hidden;
        }

        .cursor {
            position: absolute;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.85;
            box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 9px;
            font-weight: 700;
            color: #fff;
        }

        .cursor--x { background: #6c63ff; }
        .cursor--o { background: #ff6363; }
    `;

    get plugin() {
        return presencePlugin;
    }

    render() {
        const values = useObservableValues(
            () => ({
                cursorX: this.service.observe.resources.cursorX,
                cursorO: this.service.observe.resources.cursorO,
            }),
            [],
        );

        const pointerPos = usePointerObserve([]);
        const element = useElement();
        const service = this.service;

        // Drive a never-ending async-generator presence transaction.
        // Each yield becomes a transient envelope forwarded to the peer.
        // Cleanup throws to cancel the in-flight transient instead of committing.
        useEffect(() => {
            const positions = Observe.toAsyncGenerator(pointerPos, () => false);

            async function* presenceArgs() {
                for await (const [px, py] of positions) {
                    const { width, height } = element.getBoundingClientRect();
                    if (!width || !height) continue;
                    // Normalise to [0..1] so coords are screen-size independent.
                    yield { x: px / width, y: py / height };
                }
            }

            (service.transactions.movePresence as (factory: () => AsyncGenerator<{ x: number; y: number }>) => Promise<unknown>)(presenceArgs)
                .catch(() => undefined);

            return () => {
                void positions.throw(new Error("disposed")).catch(() => undefined);
            };
        }, [pointerPos, element, service]);

        const cx = values?.cursorX;
        const co = values?.cursorO;

        // Convert normalised [0..1] coords back to pixel offsets for rendering.
        // We don't need element dimensions here — CSS percentages work naturally.
        return html`
            <slot></slot>
            <div class="overlay">
                ${cx ? html`
                    <div class="cursor cursor--x"
                         style="left: ${(cx[0] * 100).toFixed(1)}%; top: ${(cx[1] * 100).toFixed(1)}%">X</div>
                ` : ""}
                ${co ? html`
                    <div class="cursor cursor--o"
                         style="left: ${(co[0] * 100).toFixed(1)}%; top: ${(co[1] * 100).toFixed(1)}%">O</div>
                ` : ""}
            </div>
        `;
    }
}
