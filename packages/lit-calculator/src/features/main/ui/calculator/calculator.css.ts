// © 2026 Adobe. MIT License. See /LICENSE for details.

import { css } from "lit";

export const styles = css`
  :host {
    display: block;
  }

  .calculator {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: fit-content;
  }

  .display {
    font-family: monospace;
    font-size: 2rem;
    text-align: right;
    padding: 8px 12px;
    min-width: 232px;
    background: #111;
    color: #0f0;
    border-radius: 6px;
    overflow: hidden;
    white-space: nowrap;
  }

  .keypad {
    display: grid;
    grid-template-columns: repeat(4, 56px);
    gap: 4px;
  }

  .key {
    height: 56px;
    font-size: 1.25rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    background: #e0e0e0;
    color: #111;
  }

  .key:hover {
    filter: brightness(0.95);
  }

  .key:active {
    filter: brightness(0.9);
  }

  /* Kind-level styling only — one class per key ROLE, never one rule per
     enum member. The digit/operation sets drive their own keys by iteration. */
  .key-operation {
    background: #f5923e;
    color: #fff;
  }

  .key-equals {
    background: #2d7ef7;
    color: #fff;
  }

  .key-clear {
    background: #d9534f;
    color: #fff;
  }
`;
