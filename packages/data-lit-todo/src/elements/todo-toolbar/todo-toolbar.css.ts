// © 2026 Adobe. MIT License. See /LICENSE for details.
import { css } from "lit";

export const styles = css`
  :host {
    display: block;
    flex-shrink: 0;
    border-bottom: 1px solid var(--spectrum-gray-300);
    background: var(--spectrum-gray-75);
  }

  .toolbar {
    display: flex;
    flex-direction: column;
    gap: var(--spectrum-spacing-200);
    padding: var(--spectrum-spacing-300);
  }

  .add-row {
    display: flex;
    gap: var(--spectrum-spacing-200);
  }

  .add-input {
    flex: 1;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: var(--spectrum-spacing-200);
    flex-wrap: wrap;
  }

  .spacer {
    flex: 1;
  }

  .stats {
    font-size: var(--spectrum-font-size-75);
    color: var(--spectrum-gray-700);
    white-space: nowrap;
  }
`;
