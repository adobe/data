// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { PresenceCursor, PlayerMark } from "../../state/p2p-plugin.js";
import "../p2p-cell/p2p-cell.js";

export function render(args: {
    remoteCursor: PresenceCursor;
    remoteMark: PlayerMark;
}) {
    const { remoteCursor, remoteMark } = args;

    const cx = remoteCursor ? Math.max(0, Math.min(1, remoteCursor.x)) : null;
    const cy = remoteCursor ? Math.max(0, Math.min(1, remoteCursor.y)) : null;

    return html`
        <div class="board">
            ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(
                (index) => html`
                    <p2p-cell .index=${index}></p2p-cell>
                `,
            )}
        </div>
        <div class="cursors">
            ${cx !== null && cy !== null
                ? html`
                    <div
                        class="cursor cursor--${remoteMark.toLowerCase()}"
                        style="left:${cx * 100}%;top:${cy * 100}%"
                        aria-label="${remoteMark} cursor"
                    >
                        ${remoteMark}
                    </div>
                `
                : ""}
        </div>
    `;
}
