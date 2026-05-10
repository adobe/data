// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { Observe } from "@adobe/data/observe";
import { useObservableValues, usePointerObserve, useEffect } from "@adobe/data-lit";
import { PRESENCE_ID, type PlayerMark, type PresenceCursor } from "../../state/p2p-plugin.js";
import { P2pElement } from "../p2p-element.js";
import { styles } from "./p2p-board.css.js";
import * as presentation from "./p2p-board-presentation.js";

export const tagName = "p2p-board";

@customElement(tagName)
export class P2pBoard extends P2pElement {
    static styles = styles;

    render() {
        // -------------------------------------------------------------------
        // Reactive cursor state — drives the remote player's cursor dot.
        // -------------------------------------------------------------------
        const values = useObservableValues(
            () => ({
                cursorX: this.service.observe.resources.cursorX,
                cursorO: this.service.observe.resources.cursorO,
            }),
            [],
        );

        const remoteMark: PlayerMark = this.myMark === "X" ? "O" : "X";
        const remoteCursor: PresenceCursor =
            remoteMark === "X"
                ? (values?.cursorX ?? null)
                : (values?.cursorO ?? null);

        // -------------------------------------------------------------------
        // Presence: continuous pointer-position stream → sendTransient.
        //
        // usePointerObserve returns an Observe<{x,y}> (pixels relative to
        // this element). Observe.toAsyncGenerator with () => false creates a
        // never-ending async generator — the "drag sequence that never ends"
        // pattern. Each yielded position is normalised to a 0–1 fraction and
        // sent as a transient envelope with a fixed per-player ID so it
        // replaces (rather than accumulates) in the reconciling DB's queue.
        //
        // The useEffect cleanup calls gen.return() which terminates the
        // generator when the element disconnects.
        // -------------------------------------------------------------------
        const pointerPos = usePointerObserve([]);

        useEffect(() => {
            const gen = Observe.toAsyncGenerator(pointerPos, () => false);
            let active = true;

            (async () => {
                    for await (const [px, py] of gen) {
                        if (!active) break;
                        const { width, height } = this.getBoundingClientRect();
                        if (!width || !height) continue;
                        this.syncClient.sendTransient({
                            id: PRESENCE_ID[this.myMark],
                            name: "movePresence",
                            args: { mark: this.myMark, x: px / width, y: py / height },
                            time: -1,
                        });
                    }
            })();

            return () => {
                active = false;
                void gen.return(undefined as unknown as [number, number]);
            };
        }, []);

        // -------------------------------------------------------------------
        // Render
        // -------------------------------------------------------------------
        return presentation.render({
            service: this.service,
            syncClient: this.syncClient,
            myMark: this.myMark,
            remoteCursor,
            remoteMark,
        });
    }
}
