// © 2026 Adobe. MIT License. See /LICENSE for details.
import { css } from "lit";

export const styles = css`
  :host {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 480px;
    height: 460px;
    max-height: 460px;
    overflow: hidden;
    border: 1px solid var(--spectrum-gray-300);
    border-radius: var(--spectrum-corner-radius-200, 10px);
    background: var(--spectrum-background-layer-2-color, #fff);
    box-shadow: var(--spectrum-drop-shadow-emphasized, 0 1px 3px rgba(0, 0, 0, 0.08));
  }

  .tabs {
    display: flex;
    gap: var(--spectrum-spacing-100);
    padding: var(--spectrum-spacing-100) var(--spectrum-spacing-200);
    border-bottom: 1px solid var(--spectrum-gray-300);
    background: var(--spectrum-gray-100);
    flex-shrink: 0;
  }
`;
