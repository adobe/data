// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement } from 'lit';
import { iterateSelfAndAncestors } from '../functions/index.js';
import { Database } from '@adobe/data/ecs';
import { UIService } from '@adobe/data/service';
import { attachDecorator, withHooks } from '../index.js';

export abstract class DatabaseElement<P extends Database.Plugin> extends LitElement {

  /** Full database, hard-private — invisible to subclasses and external callers. */
  #database!: Database.Plugin.ToDatabase<P>;

  /**
   * The element's database surface.
   *  - SET to inject the full database (DI).
   *  - GET returns the UI-restricted view (every mutator rewritten to
   *    fire-and-forget `void`).
   * Divergent get/set types are intentional: inject full, consume restricted.
   */
  set service(db: Database.Plugin.ToDatabase<P>) {
    const old = this.#database;
    this.#database = db;
    this.requestUpdate('service', old);
  }
  get service(): UIService.FromService<Database.Plugin.ToDatabase<P>> {
    return UIService.restrict(this.#database);
  }

  constructor() {
    super();
    attachDecorator(this, 'render', withHooks);
  }

  abstract get plugin(): P;

  connectedCallback(): void {
    if (!this.#database) {
      const ancestor = this.findAncestorService();
      this.service = ancestor?.extend(this.plugin) ?? Database.create(this.plugin);
    }
    super.connectedCallback();
  }

  protected findAncestorService(): Database | void {
    for (const element of iterateSelfAndAncestors(this)) {
      // Same-class DatabaseElement ancestor: read its private full db directly.
      // Undefined-safe, no getter call, no restrict round-trip, no cast.
      if (#database in element) {
        const db = element.#database;
        if (Database.is(db)) return db;
        continue;
      }
      // Foreign host (e.g. <div .service=${db}>): duck-type the bound value.
      const { service } = element as { service?: unknown };
      if (Database.is(service)) return service;
    }
  }

  public override render() {
    throw new Error('render function must be overridden');
  }

}
