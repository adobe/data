// © 2026 Adobe. MIT License. See /LICENSE for details.
import { css } from "lit";

export const styles = css`
  :host {
    display: inline-block;
    position: relative;
  }
  .panel {
    position: absolute;
    z-index: 1;
    right: 0;
    margin-top: var(--spectrum-spacing-75);
    display: flex;
    flex-direction: column;
    gap: var(--spectrum-spacing-75);
    padding: var(--spectrum-spacing-200);
    min-width: 180px;
    background: var(--spectrum-gray-50);
    border: 1px solid var(--spectrum-gray-300);
    border-radius: var(--spectrum-corner-radius-100, 4px);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
  }
  .empty {
    font-size: var(--spectrum-font-size-75);
    color: var(--spectrum-gray-700);
  }
`;
