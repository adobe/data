// © 2026 Adobe. MIT License. See /LICENSE for details.
import { css } from "lit";
import { TODO_ROW_HEIGHT } from "./todo-row.constants.js";

export const styles = css`
  :host {
    display: block;
  }

  .todo-row {
    box-sizing: border-box;
    position: absolute;
    left: 0;
    right: 0;
    height: ${TODO_ROW_HEIGHT}px;
    display: flex;
    align-items: center;
    gap: var(--spectrum-spacing-200);
    padding: 0 var(--spectrum-spacing-300);
    border-bottom: 1px solid var(--spectrum-gray-200);
    background: var(--spectrum-background-layer-2-color, #fff);
    touch-action: none;
    transition: top 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
  }

  .todo-row:hover {
    background-color: var(--spectrum-gray-100);
  }

  .todo-row.dragging {
    z-index: 10;
    background-color: var(--spectrum-gray-100);
    box-shadow: var(--spectrum-drop-shadow-emphasized, 0 4px 12px rgba(0, 0, 0, 0.18));
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
  }

  .todo-name {
    flex: 1;
    font-size: var(--spectrum-font-size-100);
    color: var(--spectrum-gray-900);
    cursor: grab;
    user-select: none;
    word-break: break-word;
  }

  .todo-row.complete .todo-name {
    text-decoration: line-through;
    color: var(--spectrum-gray-500);
  }

  sp-checkbox,
  sp-action-button {
    flex-shrink: 0;
  }
`;
