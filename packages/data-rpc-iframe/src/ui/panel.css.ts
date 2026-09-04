// © 2026 Adobe. MIT License. See /LICENSE for details.

import { css } from "lit";

/** Shared styling for both panels. */
export const panelStyles = css`
    :host {
        display: block;
        font-family: system-ui, sans-serif;
        border: 2px solid var(--accent, #4a6);
        border-radius: 8px;
        padding: 1rem;
    }
    h2 {
        margin: 0 0 0.5rem;
        color: var(--accent, #4a6);
    }
    .row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0.35rem 0;
    }
    .label {
        font-weight: 600;
        min-width: 9rem;
    }
    .value {
        font-family: ui-monospace, monospace;
    }
    button {
        cursor: pointer;
        border: 1px solid var(--accent, #4a6);
        background: transparent;
        color: inherit;
        border-radius: 4px;
        padding: 0.25rem 0.6rem;
    }
    button:hover {
        background: var(--accent, #4a6);
        color: white;
    }
    ul {
        margin: 0.25rem 0;
        padding-left: 1.2rem;
    }
`;
