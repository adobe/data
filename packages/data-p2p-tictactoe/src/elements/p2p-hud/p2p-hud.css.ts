// © 2026 Adobe. MIT License. See /LICENSE for details.

import { css } from "lit";

export const styles = css`
    :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        max-width: 320px;
    }

    .status-row {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }

    .badge {
        padding: 0.3rem 0.8rem;
        border-radius: 999px;
        background: #23232f;
        font-size: 0.85rem;
        font-weight: 600;
        border: 1px solid #2e2e3e;
        color: #e8e8f0;
    }

    .status {
        color: #7a7a9a;
        font-size: 0.95rem;
    }

    .status--active {
        color: #50fa7b;
        font-weight: 600;
    }

    .btn-restart {
        width: 100%;
        padding: 0.75rem;
        border: none;
        border-radius: 6px;
        background: #6c63ff;
        color: #fff;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s;
    }

    .btn-restart:hover {
        opacity: 0.88;
    }
`;
