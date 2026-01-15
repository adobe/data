// © 2026 Adobe. MIT License. See /LICENSE for details.
import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
  }

  .todo-row {
    --todo-row-height: 56px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: var(--spectrum-spacing-200);
    padding: var(--spectrum-spacing-200) var(--spectrum-spacing-300);
    border-bottom: 1px solid var(--spectrum-gray-200);
    min-height: var(--todo-row-height);
    height: var(--todo-row-height);
    contain: layout paint style;            /* or at least paint/layout */
    content-visibility: auto;               /* skip offscreen work: https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility */
    contain-intrinsic-size: 500px var(--todo-row-height);     /* reserve space so auto can skip paint: https://developer.mozilla.org/en-US/docs/Web/CSS/contain-intrinsic-size */
    transition: background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
  }

  .todo-row.dragging {
    background-color: var(--spectrum-gray-100);
    z-index: 100;
    box-shadow: 0 0 10px var(--spectrum-gray-300);
  }

  .todo-row:hover {
    background-color: var(--spectrum-gray-100);
  }

  .todo-name {
    flex: 1;
    font-size: var(--spectrum-font-size-100);
    line-height: var(--spectrum-line-height-100);
    color: var(--spectrum-gray-800);
  }

  sp-checkbox {
    flex-shrink: 0;
  }

  sp-action-button {
    flex-shrink: 0;
  }
`; 