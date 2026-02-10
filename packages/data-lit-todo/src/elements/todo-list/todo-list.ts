// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as presentation from './todo-list-presentation.js';
import { styles } from './todo-list.css.js';
import { customElement } from 'lit/decorators.js';
import { css } from 'lit';

import { useObservableValues } from "@adobe/data-lit";
import { TodoElement } from '../../todo-element.js';
import '../todo-row/todo-row.js';

export const tagName = 'data-todo-list';

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: TodoList;
  }
}

@customElement(tagName)
export class TodoList extends TodoElement {
  static styles = [
    styles,
    css`
      :host {
        display: block;
        height: 100%;
        width: 100%;
        overflow-y: auto;
        position: relative;
      }
    `
  ];

  render() {
    const values = useObservableValues(() => ({
      todos: this.service.dependentState.allTodos,
    }));

    if (!values) return;

    return presentation.render({
      ...values,
    });
  }
}
