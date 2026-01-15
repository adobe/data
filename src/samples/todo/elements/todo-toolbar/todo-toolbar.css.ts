// © 2026 Adobe. MIT License. See /LICENSE for details.
import { css } from 'lit';

export const styles = css`
  .todo-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spectrum-spacing-200) var(--spectrum-spacing-300);
    background-color: var(--spectrum-gray-100);
    border-bottom: 1px solid var(--spectrum-gray-300);
    gap: var(--spectrum-spacing-200);
  }

  .toolbar-left,
  .toolbar-center,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--spectrum-spacing-100);
  }

  .toolbar-center {
    flex: 1;
    justify-content: center;
  }

  .todo-stats {
    font-size: var(--spectrum-font-size-100);
    color: var(--spectrum-gray-600);
    margin-left: var(--spectrum-spacing-200);
    width: 100px;
  }
`; 