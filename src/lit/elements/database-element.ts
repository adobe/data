// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { iterateSelfAndAncestors } from '../functions/index.js';
import { Database } from '../../ecs/index.js';
import { attachDecorator, withHooks } from '../index.js';

export abstract class DatabaseElement<P extends Database.Plugin> extends LitElement {

  @property({ type: Object, reflect: false })
  service!: Database.Plugin.ToDatabase<P>;

  constructor() {
    super();
    attachDecorator(this, 'render', withHooks);
  }

  abstract get plugin(): P;

  connectedCallback(): void {
    super.connectedCallback();

    if (!this.service) {
      const service = this.findAncestorDatabase();
      this.service = (service?.extend(this.plugin) ?? Database.create(this.plugin)) as unknown as Database.Plugin.ToDatabase<P>;
    }
  }

  protected findAncestorDatabase(): Database | void {
    for (const element of iterateSelfAndAncestors(this)) {
      const { service } = element as Partial<DatabaseElement<any>>;
      if (Database.is(service)) {
        return service;
      }
    }
  }

  public override render() {
    throw new Error('render function must be overridden');
  }

}
