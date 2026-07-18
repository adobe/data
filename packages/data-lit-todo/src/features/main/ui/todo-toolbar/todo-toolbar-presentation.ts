// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html } from "lit";
import "@spectrum-web-components/textfield/sp-textfield.js";
import "@spectrum-web-components/button/sp-button.js";
import "@spectrum-web-components/switch/sp-switch.js";

type RenderArgs = {
  readonly draftName: string;
  readonly totalCount: number;
  readonly completedCount: number;
  readonly displayCompleted: boolean;
  readonly setDraftName: (value: string) => void;
  readonly addTodo: () => void;
  readonly addRandomTodo: () => void;
  readonly addBulkTodos: (count: number) => void;
  readonly toggleDisplayCompleted: () => void;
  readonly clearAll: () => void;
};

export function render(args: RenderArgs) {
  const {
    draftName,
    totalCount,
    completedCount,
    displayCompleted,
    setDraftName,
    addTodo,
    addRandomTodo,
    addBulkTodos,
    toggleDisplayCompleted,
    clearAll,
  } = args;

  return html`
    <div class="toolbar">
      <div class="add-row">
        <sp-textfield
          class="add-input"
          placeholder="What needs to be done?"
          aria-label="New todo name"
          .value=${draftName}
          @input=${(event: Event) =>
            setDraftName((event.target as HTMLInputElement).value)}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === "Enter") addTodo();
          }}
        ></sp-textfield>
        <sp-button
          variant="accent"
          @click=${addTodo}
          ?disabled=${draftName.trim() === ""}
        >
          Add
        </sp-button>
      </div>

      <div class="controls">
        <sp-button
          variant="secondary"
          treatment="outline"
          @click=${addRandomTodo}
        >
          Add random
        </sp-button>
        <sp-button
          variant="secondary"
          treatment="outline"
          @click=${() => addBulkTodos(10)}
        >
          Add 10
        </sp-button>
        <sp-switch
          ?checked=${displayCompleted}
          @change=${toggleDisplayCompleted}
        >
          Show completed
        </sp-switch>
        <span class="spacer"></span>
        <span class="stats">${completedCount} / ${totalCount} completed</span>
        <sp-button
          variant="negative"
          treatment="outline"
          @click=${clearAll}
          ?disabled=${totalCount === 0}
        >
          Clear all
        </sp-button>
      </div>
    </div>
  `;
}
