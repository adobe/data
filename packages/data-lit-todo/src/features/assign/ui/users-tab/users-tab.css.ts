// © 2026 Adobe. MIT License. See /LICENSE for details.
import { css } from "lit";

export const styles = css`
  :host {
    display: block;
    padding: var(--spectrum-spacing-300);
  }
  .add-row {
    display: flex;
    gap: var(--spectrum-spacing-200);
    margin-bottom: var(--spectrum-spacing-300);
  }
  .add-input {
    flex: 1;
  }
  .user-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spectrum-spacing-100);
  }
  .user {
    display: flex;
    gap: var(--spectrum-spacing-200);
    align-items: baseline;
    padding: var(--spectrum-spacing-100) 0;
    border-bottom: 1px solid var(--spectrum-gray-200);
  }
  .user-name {
    font-weight: 700;
    min-width: 120px;
  }
  .tasks {
    color: var(--spectrum-gray-700);
    font-size: var(--spectrum-font-size-75);
  }
  .none {
    font-style: italic;
    color: var(--spectrum-gray-500);
  }
  .empty {
    color: var(--spectrum-gray-700);
  }
`;
