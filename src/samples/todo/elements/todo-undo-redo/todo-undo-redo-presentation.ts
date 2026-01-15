// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html } from 'lit';

import '@spectrum-web-components/action-button/sp-action-button.js';
import '@spectrum-web-components/action-group/sp-action-group.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-redo.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-undo.js';

// Temporarily disable localization for the sample
// import { Localized, Unlocalized } from '../../../../services/locale-service/locale-service.js';

// Simplified localization for sample - using static strings
const localizedStrings = {
  undo: 'Undo',
  redo: 'Redo',
} as const;

type RenderArgs = {
  localized: typeof localizedStrings;
  hasUndo: boolean;
  hasRedo: boolean;
  undo: () => void;
  redo: () => void;
};

export function render(args: RenderArgs) {
  const { localized, hasUndo, hasRedo, undo, redo } = args;

  return html`
    <sp-action-group>
      <sp-action-button @click=${undo} ?disabled=${!hasUndo} quiet>
        <sp-icon-undo slot="icon"></sp-icon-undo>
        ${localized.undo}
      </sp-action-button>
      <sp-action-button @click=${redo} ?disabled=${!hasRedo} quiet>
        <sp-icon-redo slot="icon"></sp-icon-redo>
        ${localized.redo}
      </sp-action-button>
    </sp-action-group>
  `;
}
