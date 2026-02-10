// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { createMainService } from './services/main-service/create-main-service.js';
import './todo-main-element.js';  // Side effect: registers custom elements
import "@adobe/data-lit"; // Side effect: registers ApplicationHost and other elements

export const tagName = 'todo-host';

@customElement(tagName)
export class TodoHost extends LitElement {
    static styles = css`
        :host {
            display: flex;
            flex: 1 1 auto;
            color: red;
        }
    `;

    render() {
        return html`
            <application-host 
                .createService=${createMainService} 
                .renderElement=${() => html`<data-todo></data-todo>`}>
            </application-host>
        `;
    }
}
