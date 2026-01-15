// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as presentation from './todo-row-presentation.js';
import { styles } from './todo-row.css.js';
import { Entity } from '../../../../ecs/index.js';
import { customElement, property } from 'lit/decorators.js';

import { useObservableValues } from '../../../../lit/hooks/index.js';
import { TodoElement } from '../../todo-element.js';

export const tagName = 'data-todo-row';

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: TodoRow;
  }
}

@customElement(tagName)
export class TodoRow extends TodoElement {
  static styles = styles;

  @property({ type: Number })
  entity!: Entity;

  @property({ type: Number })
  index!: number;

  render() {
    const localized = { toggleComplete: 'Toggle complete', deleteTodo: 'Delete' } as const;
    const values = useObservableValues(() => ({
      todo: this.service.state.observe.entity(this.entity, this.service.state.archetypes.Todo),
    }));

    if (!values || !values.todo) return;

    return presentation.render({
      ...values,
      localized,
      todo: values.todo,
      toggleComplete: () => this.service.state.transactions.toggleComplete(this.entity),
      deleteTodo: () => this.service.state.transactions.deleteTodo(this.entity),
      dragTodo: this.service.state.transactions.dragTodo,
      index: this.index,
    });
  }
}
