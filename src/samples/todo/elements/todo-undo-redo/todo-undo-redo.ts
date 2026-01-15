// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as presentation from './todo-undo-redo-presentation.js';
import { styles } from './todo-undo-redo.css.js';
import { customElement } from 'lit/decorators.js';

import { useObservableValues } from '../../../../lit/hooks/index.js';
import { TodoElement } from '../../todo-element.js';

export const tagName = 'data-todo-undo-redo';

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: TodoUndoRedo;
  }
}

@customElement(tagName)
export class TodoUndoRedo extends TodoElement {
  static styles = styles;

  render() {
    const localized = { undo: 'Undo', redo: 'Redo' } as const;
    const values = useObservableValues(() => ({
      hasUndo: this.service.undoRedo.undoEnabled,
      hasRedo: this.service.undoRedo.redoEnabled,
    }));

    if (!values) return;

    return presentation.render({
      ...values,
      localized,
      undo: this.service.undoRedo.undo,
      redo: this.service.undoRedo.redo,
    });
  }
}
