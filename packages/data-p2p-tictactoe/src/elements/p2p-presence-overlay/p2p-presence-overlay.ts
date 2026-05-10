// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Optional presence overlay. Wraps any game element via <slot> and renders
// absolute-positioned cursor dots for each peer's live pointer position.

import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useObservableValues, usePointerObserve, useEffect, useElement } from "@adobe/data-lit";
import { Observe } from "@adobe/data/observe";
import { PlayerMark } from "data-lit-tictactoe";
import { presencePlugin } from "../../state/presence-plugin.js";

export const tagName = "p2p-presence-overlay";

/**
 * Wraps a game element (via `<slot>`) and renders live cursor dots for each
 * connected peer. The overlay owns no sync logic — it reads the `cursors`
 * resource (keyed by `PlayerMark`) from the injected synced database and
 * drives `movePresence` with local pointer events.
 *
 * Cursor coordinates are stored as normalised `[0..1]` offsets so they map
 * naturally to CSS percentages regardless of viewport size.
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
    `;

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
                    yield { x: px / width, y: py / height };
                }
            }

            service.transactions.movePresence(presenceArgs).catch(() => undefined);

            return () => {
                void positions.throw(new Error("disposed")).catch(() => undefined);
            };
        }, [pointerPos, element, service]);

        const cursors = values?.cursors;

        return html`
            <slot></slot>
            <div class="overlay">
                ${PlayerMark.values.map((mark) => {
                    const pos = cursors?.[mark];
                    if (!pos) return "";
                    return html`
                        <div class="cursor"
                             style="left: ${(pos[0] * 100).toFixed(1)}%; top: ${(pos[1] * 100).toFixed(1)}%; background-color: ${PlayerMark.markColor[mark]}"
                        >${mark}</div>
                    `;
                })}
            </div>
        `;
    }
}
