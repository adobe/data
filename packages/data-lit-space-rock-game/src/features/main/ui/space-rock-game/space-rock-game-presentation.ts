// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, nothing } from "lit";

// Pure HUD: the score / lives / wave readout plus a game-over overlay whose
// button invokes the newGame callback. No database, no canvas — every value
// arrives as a prop from the container element.
export function render(args: {
  score: number;
  lives: number;
  wave: number;
  gameOver: boolean;
  newGame: () => void;
}) {
  const { score, lives, wave, gameOver, newGame } = args;
  return html`
    <div class="hud">
      <span class="stat">Score <strong>${score}</strong></span>
      <span class="stat">Lives <strong>${lives}</strong></span>
      <span class="stat">Wave <strong>${wave}</strong></span>
    </div>
    ${gameOver
      ? html`
          <div class="overlay">
            <div class="panel">
              <h1>Game Over</h1>
              <p>Final score ${score}</p>
              <button type="button" @click=${newGame}>Play again</button>
            </div>
          </div>
        `
      : nothing}
  `;
}
