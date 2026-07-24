// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, type TemplateResult } from "lit";
import type { GameStatus } from "../../data/game-status/game-status.js";

// Pure presentation: the HUD (lives / score / status + new-game) around the
// WebGPU canvas the renderer draws into. The canvas is imperative — the scheduler
// draws it every frame — so the element only needs it in the DOM and focused.
export const render = (props: {
  lives: number;
  score: number;
  status: GameStatus;
  onKeyDown: (event: KeyboardEvent) => void;
  onNewGame: () => void;
}): TemplateResult => html`
  <div class="hud">
    <span class="stat">Lives ${props.lives}</span>
    <span class="stat">Score ${props.score}</span>
    <span class="stat status">${props.status}</span>
    <button @click=${props.onNewGame}>New Game</button>
  </div>
  <canvas width="800" height="600" tabindex="0" @keydown=${props.onKeyDown}></canvas>
  <p class="hint">WASD / arrow keys to hop</p>
`;
