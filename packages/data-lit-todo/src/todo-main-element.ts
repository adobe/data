// © 2026 Adobe. MIT License. See /LICENSE for details.
import './elements/todo-list/todo-list.js';
import './elements/todo-row/todo-row.js';
import './elements/todo-toolbar/todo-toolbar.js';
import './elements/todo-undo-redo/todo-undo-redo.js';
import { TodoElement } from './todo-element.js';
import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

export const tagName = 'data-todo';

@customElement(tagName)
export class TodoMainElement extends TodoElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 400px;
      max-height: 400px;
      overflow: hidden;
    }
    
    data-todo-toolbar {
      flex-shrink: 0;
    }
    
    data-todo-list {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }
  `;

  render() {
    return html`
      <data-todo-toolbar></data-todo-toolbar>
      <data-todo-list></data-todo-list>
    `;
  }
}
