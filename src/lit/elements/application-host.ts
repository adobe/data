// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement, nothing, TemplateResult, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Service } from '../../service/index.js';
import { ApplicationElement } from './application-element.js';

const tagName = "application-host";

declare global {
   interface HTMLElementTagNameMap {
      'application-element': ApplicationElement<Service>;
   }
}

@customElement(tagName)
export class ApplicationHost<MainService extends Service = Service> extends LitElement {
   static styles = css`
        :host {
            display: flex;
            flex: 1 1 auto;
        }
    `;

   @property()
   createService!: () => Promise<MainService>;

   @property({})
   renderElement!: () => TemplateResult;

   @property({ attribute: false })
   public service!: MainService;

   override async connectedCallback() {
      super.connectedCallback();
      this.service = await this.createService();
   }

   override render() {
      return this.service ? this.renderElement() : nothing;
   }

}
