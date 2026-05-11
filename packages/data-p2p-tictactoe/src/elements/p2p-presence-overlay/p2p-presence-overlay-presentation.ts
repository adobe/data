// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";
import type { Vec2 } from "@adobe/data/math";
import { PlayerMark } from "data-lit-tictactoe";

export function render({
    cursors,
    localMark,
}: {
    cursors: Partial<Record<PlayerMark, Vec2>> | undefined;
    localMark: number | string | undefined;
}): TemplateResult {
    return html`
        <slot></slot>
        <div class="overlay">
            ${PlayerMark.values.map((mark) => {
                if (mark === localMark) return "";
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
