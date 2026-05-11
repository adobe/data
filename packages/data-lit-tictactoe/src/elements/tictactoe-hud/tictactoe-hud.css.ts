// © 2026 Adobe. MIT License. See /LICENSE for details.

import { css } from "lit";

export const styles = css`
  .hud {
    padding: 0.5rem 1rem;
    font-family: system-ui, sans-serif;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .score {
    display: flex;
    gap: 0;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #ddd;
    font-size: 0.82rem;
    flex-shrink: 0;
  }

  .score-cell {
    padding: 0.2rem 0.55rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    letter-spacing: 0.02em;
  }

  .score-x    { background: #fff0f0; color: #c0392b; }
  .score-draw { background: #f5f5f5; color: #555; }
  .score-o    { background: #f0f4ff; color: #2563eb; }

  .score-cell strong {
    font-weight: 700;
    min-width: 1ch;
    text-align: right;
  }

  .status {
    flex: 1;
    font-size: 0.9rem;
    color: #333;
  }

  .hud button {
    padding: 0.25rem 0.75rem;
    cursor: pointer;
    flex-shrink: 0;
  }
`;
