// © 2026 Adobe. MIT License. See /LICENSE for details.

import { css } from "lit";

export const styles = css`
  :host {
    display: block;
  }

  .cell {
    width: 100px;
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    font-weight: bold;
    background: #1f2937;
    border: 2px solid #6b7280;
    color: #e5e7eb;
    box-sizing: border-box;
  }

  .cell.playable {
    cursor: pointer;
  }

  .cell.winning {
    background: #2e7d32;
  }
`;
