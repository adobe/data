// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as presentation from './todo-toolbar-presentation.js';
import { styles } from './todo-toolbar.css.js';
import { Observe } from "@adobe/data/observe";
import { customElement } from 'lit/decorators.js';
import { css } from 'lit';

import { useObservableValues } from "@adobe/data-lit";
import { TodoElement } from '../../todo-element.js';

export const tagName = 'data-todo-toolbar';

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: TodoToolbar;
  }
}

@customElement(tagName)
export class TodoToolbar extends TodoElement {
  static styles = [
    styles,
    css`
      :host {
        display: block;
        flex-shrink: 0;
        width: 100%;
      }
    `
  ];

  render() {
    const localized = {
      add1Todo: 'Add 1 Todo',
      add10Todos: 'Add 10 Todos',
      add1000Todos: 'Add 1000 Todos',
      clearCompleted: 'Clear Completed',
      toggleAll: 'Toggle All',
      todoCount: 'todos',
      completedCount: 'completed',
    } as const;
    const values = useObservableValues(() => ({
      completedCount: Observe.withMap(this.service.dependentState.completeTodos, (todos: unknown) => (todos as { length: number }).length),
      todoCount: Observe.withMap(this.service.dependentState.allTodos, (todos: unknown) => (todos as { length: number }).length),
    }));

    if (!values) return;

    return presentation.render({
      ...values,
      localized,
      isGenerating: false,
      createBulkTodos: this.service.state.transactions.createBulkTodos,
      clearCompleted: () => {
        // Placeholder - would need to implement this transaction
      },
      toggleAll: () => {
        // Placeholder - would need to implement this transaction
      },
    });
  }
}
