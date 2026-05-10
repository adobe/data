// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { Observe } from "@adobe/data/observe";
import { useObservableValues, usePointerObserve, useEffect } from "@adobe/data-lit";
import type { PlayerMark, PresenceCursor } from "../../state/p2p-plugin.js";
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
        // Presence: never-ending transaction whose async generator yields a
        // fresh `movePresence` argument for every pointer sample.
        //
        // The transaction is invoked once with a generator function:
        //   - Each yielded value becomes a transient envelope (negative
        //     time) which createSyncService forwards as `kind: "transient"`.
        //   - The wrapper assigns the same `id` to every yield, so each
        //     yield REPLACES the previous transient in the reconciler queue
        //     via the (userId, id) compound key.
        //   - The generator never returns, so the transaction never
        //     commits — it just streams transients until the element
        //     disconnects.
        //
        // The useEffect cleanup terminates the generator so the transaction
        // wrapper unwinds cleanly.
        // -------------------------------------------------------------------
        const pointerPos = usePointerObserve([]);

        useEffect(() => {
            const positions = Observe.toAsyncGenerator(pointerPos, () => false);
            const myMark = this.myMark;
            const board = this;

            async function* presenceArgs() {
                for await (const [px, py] of positions) {
                    const { width, height } = board.getBoundingClientRect();
                    if (!width || !height) continue;
                    yield { mark: myMark, x: px / width, y: py / height };
                }
            }

            // When invoked with an async-generator factory the wrapper
            // returns a Promise (typed loosely here because the static
            // declaration of `movePresence` is `(args) => void`). The
            // promise rejects when we `.throw()` the generator on
            // dispose; swallow that — we used `.throw()` precisely so the
            // wrapper would cancel the in-flight transient instead of
            // promoting the last cursor position to a commit.
            const movePresence = this.service.transactions.movePresence as
                unknown as (factory: () => AsyncGenerator<unknown>) => Promise<unknown>;
            movePresence(presenceArgs).catch(() => undefined);

            return () => {
                void positions.throw(new Error("p2p-board disposed")).catch(() => undefined);
            };
        }, []);

        // -------------------------------------------------------------------
        // Render
        // -------------------------------------------------------------------
        return presentation.render({
            remoteCursor,
            remoteMark,
        });
    }
}
