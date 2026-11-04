// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement, nothing, TemplateResult, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Service } from '@adobe/data/service';

const tagName = "application-host";

declare global {
   interface HTMLElementTagNameMap {
      'application-host': ApplicationHost;
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

   #pendingService?: Promise<MainService>;

   /**
    * Creates the service once per host: reconnecting, including a DOM move, reuses the
    * service or the in-flight creation. A failed creation is retried on the next connect.
    */
   override async connectedCallback() {
      super.connectedCallback();
      if (this.service) return;
      const pending = this.#pendingService ??= this.createService();
      try {
         const service = await pending;
         this.service ??= service;
      } catch (error) {
         if (this.#pendingService === pending) this.#pendingService = undefined;
         throw error;
      }
   }

   override render() {
      return this.service ? this.renderElement() : nothing;
   }

}
