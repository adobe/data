// © 2026 Adobe. MIT License. See /LICENSE for details.

import { css } from "lit";

export const styles = css`
    :host {
        display: block;
    }

    .cell {
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1a1a24;
        border: 1px solid #2e2e3e;
        border-radius: 10px;
        font-size: clamp(2rem, 10vw, 3.5rem);
        font-weight: 700;
        color: #7a7a9a;
        cursor: default;
        transition: background 0.12s, border-color 0.12s, transform 0.08s;
        user-select: none;
    }

    .cell--x { color: #6c63ff; }
    .cell--o { color: #ff6b8a; }

    .cell--winning {
        background: #1a2f1e;
        border-color: #50fa7b;
        box-shadow: 0 0 12px rgba(80, 250, 123, 0.25);
    }

    .cell--playable {
        cursor: pointer;
        border-color: #2e2e3e;
    }

    .cell--playable:hover {
        background: #23232f;
        border-color: #6c63ff;
        transform: scale(1.04);
    }
`;
