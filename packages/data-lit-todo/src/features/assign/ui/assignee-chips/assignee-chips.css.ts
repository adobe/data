// © 2026 Adobe. MIT License. See /LICENSE for details.
import { css } from "lit";

export const styles = css`
  :host {
    display: inline-flex;
    gap: var(--spectrum-spacing-75);
    flex-shrink: 0;
  }
  .assignee-chip {
    font-size: var(--spectrum-font-size-50);
    color: var(--spectrum-gray-800);
    background: var(--spectrum-gray-200);
    border-radius: 999px;
    padding: 2px var(--spectrum-spacing-100);
    white-space: nowrap;
  }
`;
