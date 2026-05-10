// © 2026 Adobe. MIT License. See /LICENSE for details.

import { css } from "lit";

export const styles = css`
    :host {
        display: block;
        position: relative;
        width: 100%;
        max-width: 320px;
    }

    .board {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        width: 100%;
    }

    /* Presence cursor overlay — covers the board exactly, never intercepts clicks */
    .cursors {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
    }

    /* Labeled dot representing the remote player's pointer */
    .cursor {
        position: absolute;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 800;
        transform: translate(-50%, -50%);
        transition: left 0.05s linear, top 0.05s linear;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
        border: 2px solid rgba(255, 255, 255, 0.3);
    }

    .cursor--x {
        background: #6c63ff;
        color: #fff;
    }

    .cursor--o {
        background: #ff6b8a;
        color: #fff;
    }
`;
