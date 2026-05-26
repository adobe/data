// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { attachDecorator, withHooks } from '../hooks/index.js';
import { iterateSelfAndAncestors } from '../functions/index.js';
import { Service, isService } from '@adobe/data/service';

export class ApplicationElement<MainService extends Service> extends LitElement {
  @property({ type: Object, reflect: false })
  service!: MainService;

  // Defaults to `isService`: any Service in the ancestor chain is acceptable.
  // Subclasses with a more specific MainService should override this with a
  // narrower guard so unrelated services in the chain are skipped over. The
  // cast is sound because callers that *don't* override are by definition
  // accepting any Service as a valid MainService.
  @property({ attribute: false })
  typeGuard: (service: unknown) => service is MainService =
    isService as (service: unknown) => service is MainService;

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
    const { typeGuard } = this;
    for (const element of iterateSelfAndAncestors(this)) {
      const { service } = element as Partial<ApplicationElement<MainService>>;
      if (typeGuard(service)) {
        return service;
      }
    }
  }

  public override render() {
    throw new Error('render function must be overridden');
  }

}
