// © 2026 Adobe. MIT License. See /LICENSE for details.
import { css } from "lit";

export const styles = css`
  :host { display: block; padding: 1rem; }
  .hud {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 0.5rem;
    font: 14px/1 ui-monospace, monospace;
  }
  .stat { color: #cfe; }
  .status { text-transform: uppercase; letter-spacing: 0.08em; color: #fd6; }
  button { font: inherit; padding: 0.25rem 0.75rem; cursor: pointer; }
  canvas { display: block; border: 1px solid #333; background: #0a0a12; outline: none; }
  .hint { color: #889; font: 12px/1.4 ui-monospace, monospace; }
`;
