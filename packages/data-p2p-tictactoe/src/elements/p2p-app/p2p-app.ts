// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Thin sample shell. Wires the generic <p2p-negotiation> element with the
// Tic-Tac-Toe game and the optional presence overlay.
//
// This file is intentionally short — all WebRTC signaling and sync lifecycle
// logic lives in <p2p-negotiation>. Game logic lives in data-lit-tictactoe.

import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { Database } from "@adobe/data/ecs";
// Importing tictactoeTagName pulls in tictactoe-app.ts which registers
// the <tictactoe-app> custom element via @customElement.
import { tictactoePlugin, tictactoeTagName, PlayerMark } from "data-lit-tictactoe";
import { presencePlugin } from "../../state/presence-plugin.js";
import "../p2p-negotiation/p2p-negotiation.js";
import "../p2p-presence-overlay/p2p-presence-overlay.js";
import { tagName as presenceTagName } from "../p2p-presence-overlay/p2p-presence-overlay.js";

export const tagName = "p2p-app";

/**
 * Combined plugin: Tic-Tac-Toe game logic + cursor presence.
 * The presence overlay is optional — remove `presencePlugin` and the
 * `presenceTagName` prop from the negotiation element to disable cursors.
 */
const gamePlugin = Database.Plugin.combine(tictactoePlugin, presencePlugin);

// Host plays first (PlayerMark.values[0], "X"); joiner plays second.
const assignUserId = (role: "host" | "joiner"): PlayerMark =>
    PlayerMark.values[role === "host" ? 0 : 1];

@customElement(tagName)
export class P2pApp extends LitElement {
    static styles = css`
        :host {
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
            padding: 2rem 1rem;
            box-sizing: border-box;
        }
    `;

    render() {
        return html`
            <p2p-negotiation
                .gamePlugin=${gamePlugin}
                .gameTagName=${tictactoeTagName}
                .assignUserId=${assignUserId}
                .presenceTagName=${presenceTagName}
            ></p2p-negotiation>
        `;
    }
}
