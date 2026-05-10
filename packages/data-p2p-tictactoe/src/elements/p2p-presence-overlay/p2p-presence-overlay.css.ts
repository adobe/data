// © 2026 Adobe. MIT License. See /LICENSE for details.

import { css } from "lit";

export const styles = css`
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
