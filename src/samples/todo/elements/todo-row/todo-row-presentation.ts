/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
import { html } from 'lit';

import { useDragTransaction } from '../../../../lit/hooks/index.js';
import '@spectrum-web-components/action-button/sp-action-button.js';
import '@spectrum-web-components/checkbox/sp-checkbox.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-delete.js';

// Temporarily disable localization for the sample
// import { Localized, Unlocalized } from '../../../../services/locale-service/locale-service.js';
import { DragTodoFunction, Todo } from '../../services/state-service/todo-state-service.js';

const TODO_ROW_HEIGHT = 56;

// Simplified localization for sample - using static strings
const localizedStrings = {
  deleteTodo: 'Delete',
  toggleComplete: 'Toggle complete',
} as const;

type RenderArgs = {
  localized: typeof localizedStrings;
  todo: Todo;
  toggleComplete: () => void;
  deleteTodo: () => void;
  dragTodo: DragTodoFunction;
  index: number;
};

export function render(args: RenderArgs) {
  const { localized, todo, toggleComplete, deleteTodo, index, dragTodo } = args;

  useDragTransaction({
    transaction: dragTodo,
    update: (value) => {
      if (value.type === 'move') {
        return {
          todo: todo.id,
          dragPosition: value.delta[1],
        };
      } else if (value.type === 'end') {
        const finalIndex = index + Math.round(value.position[1] / TODO_ROW_HEIGHT);
        return {
          todo: todo.id,
          dragPosition: index,
          finalIndex,
        };
      }
      // Explicitly return undefined for unhandled events
      return undefined as unknown as void;
    },
  }, [dragTodo, todo.id, index]);

  const dragging = todo.dragPosition !== null;
  const position = index * TODO_ROW_HEIGHT + (todo.dragPosition ?? 0);

  return html`
    <div
      class="todo-row ${dragging ? 'dragging' : ''}"
      style="height: ${TODO_ROW_HEIGHT}px; position: absolute; top: ${position}px; left: 0; right: 0;">
      <sp-checkbox @change=${toggleComplete} title=${localized.toggleComplete} ?checked=${todo.complete}> </sp-checkbox>

      <span class="todo-name"> ${index}: ${todo.name} </span>

      <sp-action-button @click=${deleteTodo} quiet title=${localized.deleteTodo}>
        <sp-icon-delete slot="icon"></sp-icon-delete>
      </sp-action-button>
    </div>
  `;
}
