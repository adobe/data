// © 2026 Adobe. MIT License. See /LICENSE for details.

import { css } from "lit";

export const styles = css`
    :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.25rem;
        width: 100%;
        max-width: 480px;
        color: #e8e8f0;
        font-family: system-ui, -apple-system, sans-serif;
    }

    /* ── Role selection ────────────────────────────────────────── */
    .role-select {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        align-items: center;
        text-align: center;
        width: 100%;
    }

    h2 { font-size: 1.5rem; margin: 0; }
    .subtitle { color: #7a7a9a; max-width: 340px; line-height: 1.6; margin: 0; }
    .hint { color: #7a7a9a; font-size: 0.85rem; margin: 0; }

    .role-buttons {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        justify-content: center;
    }

    /* ── Signaling ─────────────────────────────────────────────── */
    .signaling {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
    }

    .step { font-size: 0.95rem; margin: 0; }

    .label {
        display: block;
        font-size: 0.8rem;
        color: #7a7a9a;
        margin-bottom: 0.35rem;
    }

    .codebox-wrap { display: flex; flex-direction: column; }

    .codebox {
        width: 100%;
        padding: 0.6rem 0.75rem;
        background: #1a1a24;
        border: 1px solid #2e2e3e;
        border-radius: 6px;
        color: #e8e8f0;
        font-family: monospace;
        font-size: 0.78rem;
        resize: vertical;
        margin-bottom: 0.4rem;
        box-sizing: border-box;
    }

    .codebox:focus { outline: 1.5px solid #6c63ff; }

    /* ── Buttons ───────────────────────────────────────────────── */
    .btn {
        padding: 0.6rem 1.4rem;
        border: none;
        border-radius: 6px;
        background: #6c63ff;
        color: #fff;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.1s;
    }

    .btn:hover { opacity: 0.88; }
    .btn:active { transform: scale(0.97); }
    .btn--secondary { background: #23232f; border: 1px solid #2e2e3e; color: #e8e8f0; }
    .btn--role { min-width: 160px; padding: 0.9rem 1.6rem; font-size: 1.05rem; }
    .btn--sm { padding: 0.35rem 0.9rem; font-size: 0.85rem; }

    /* ── Banner ────────────────────────────────────────────────── */
    .banner {
        padding: 0.65rem 1rem;
        border-radius: 6px;
        font-size: 0.9rem;
        background: #23232f;
        border: 1px solid #2e2e3e;
        width: 100%;
        box-sizing: border-box;
    }

    .banner--error { background: #2d1520; border-color: #7a2535; color: #ff8099; }

    /* ── Game ──────────────────────────────────────────────────── */
    .game {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        width: 100%;
    }
`;
