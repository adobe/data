// © 2026 Adobe. MIT License. See /LICENSE for details.
import { css } from "lit";

export const styles = css`
  :host {
    display: block;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    user-select: none;
  }

  .todo-list {
    position: relative;
  }

  .empty {
    padding: var(--spectrum-spacing-700) var(--spectrum-spacing-300);
    text-align: center;
    color: var(--spectrum-gray-600);
    font-size: var(--spectrum-font-size-100);
  }
`;
