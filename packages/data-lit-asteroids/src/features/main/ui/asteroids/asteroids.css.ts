// © 2026 Adobe. MIT License. See /LICENSE for details.

import { css } from "lit";

export const styles = css`
  :host {
    position: relative;
    display: inline-block;
    font-family: system-ui, sans-serif;
  }

  canvas {
    display: block;
    border: 1px solid #333;
    background: #05060a;
  }

  .hud {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    gap: 1rem;
    padding: 0.5rem 0.75rem;
    color: #e8e8f0;
    pointer-events: none;
    text-shadow: 0 1px 2px #000;
  }

  .stat strong {
    font-weight: 700;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(5, 6, 10, 0.72);
  }

  .panel {
    text-align: center;
    color: #e8e8f0;
  }

  .panel h1 {
    margin: 0 0 0.25rem;
    letter-spacing: 0.04em;
  }

  .panel button {
    margin-top: 0.75rem;
    padding: 0.4rem 1.1rem;
    cursor: pointer;
  }
`;
