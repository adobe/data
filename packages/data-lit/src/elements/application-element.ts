// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { attachDecorator, withHooks } from '../hooks/index.js';
import { iterateSelfAndAncestors } from '../functions/index.js';
import { Service, isService } from '@adobe/data/service';

export class ApplicationElement<MainService extends Service> extends LitElement {
  @property({ type: Object, reflect: false })
  service!: MainService;

  constructor() {
    super();
    attachDecorator(this, 'render', withHooks);
  }

  connectedCallback(): void {
    super.connectedCallback();

    if (!this.service) {
      const service = this.findAncestorService();
      if (service) {
        this.service = service;
      }
    }
  }

  protected findAncestorService(): MainService | void {
    for (const element of iterateSelfAndAncestors(this)) {
      const { service } = element as Partial<ApplicationElement<MainService>>;
      if (isService(service)) {
        return service;
      }
    }
  }

  public override render() {
    throw new Error('render function must be overridden');
  }

}
