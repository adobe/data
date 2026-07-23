// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import { Digit } from "../../data/digit/digit.js";
import { Operation } from "../../data/operation/operation.js";

export function render(args: {
  display: string;
  inputDigit: (digit: Digit) => void;
  inputDecimal: () => void;
  setOperation: (operation: Operation) => void;
  evaluate: () => void;
  clear: () => void;
}) {
  const { display, inputDigit, inputDecimal, setOperation, evaluate, clear } = args;
  return html`
    <div class="calculator">
      <div class="display">${display}</div>
      <div class="keypad">
        <button type="button" class="key key-clear" @click=${clear}>C</button>
        ${Operation.values.map(
          (operation) => html`
            <button
              type="button"
              class="key key-operation"
              @click=${() => setOperation(operation)}
            >
              ${Operation.sign[operation]}
            </button>
          `,
        )}
        ${Digit.values.map(
          (digit) => html`
            <button
              type="button"
              class="key key-digit"
              @click=${() => inputDigit(digit)}
            >
              ${digit}
            </button>
          `,
        )}
        <button type="button" class="key key-decimal" @click=${inputDecimal}>.</button>
        <button type="button" class="key key-equals" @click=${evaluate}>=</button>
      </div>
    </div>
  `;
}
