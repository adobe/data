// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement } from 'lit';
import { iterateSelfAndAncestors } from '../functions/index.js';
import { Database } from '@adobe/data/ecs';
import { UIService } from '@adobe/data/service';
import { attachDecorator, withHooks } from '../index.js';

export abstract class DatabaseElement<P extends Database.Plugin> extends LitElement {

  /** Full database, hard-private. Exposed to subclasses only through the
   *  restricted {@link service} getter and the {@link database} accessor. */
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

  /**
   * The full, unrestricted database — for imperative-rendering subclasses
   * (a canvas / WebGL draw loop that reads columns synchronously each frame,
   * where the reactive `observe` surface can't help because systems mutate
   * columns in place without firing observers). Presentations and external
   * callers still receive only the restricted {@link service}; this privileged
   * read path is confined to container element authors via `protected`.
   */
  protected get database(): Database.Plugin.ToDatabase<P> {
    return this.#database;
  }

  constructor() {
    super();
    attachDecorator(this, 'render', withHooks);
  }

  abstract get plugin(): P;

  connectedCallback(): void {
    this.#upgradeServiceProperty();
    if (!this.#database) {
      const ancestor = this.findAncestorService();
      this.service = ancestor?.extend(this.plugin) ?? Database.create(this.plugin);
    }
    super.connectedCallback();
  }

  /**
   * A lazy wrapper binds `.service` *before* this element's class is upgraded
   * (the element module is dynamically imported), so the value lands as an own
   * data property that shadows the `service` accessor: `set service` never runs
   * (`#database` stays unset, `database` reads `undefined`) and `get service`
   * returns the raw injected database instead of the restricted view. Reassign
   * the shadowed value through the accessor so the setter runs — `#database` is
   * populated and the UI restriction is actually enforced.
   */
  #upgradeServiceProperty(): void {
    if (!Object.prototype.hasOwnProperty.call(this, "service")) return;
    // The own property was bound by the wrapper as the full database (DI); the
    // `service` accessor's declared type hides that, hence the widening view.
    const self = this as unknown as { service?: Database.Plugin.ToDatabase<P> };
    const injected = self.service;
    delete self.service;
    if (injected !== undefined) {
      this.service = injected;
    }
  }

  protected findAncestorService(): Database | void {
    for (const element of iterateSelfAndAncestors(this)) {
      // Read each ancestor's `service`. A DatabaseElement returns its full
      // database here (UIService.restrict is identity at runtime); a foreign
      // host (`<div .service=${db}>`) returns whatever was bound. Database.is
      // keeps only a real database, skipping unconnected elements (undefined)
      // and unrelated services (e.g. an ApplicationElement's MainService).
      const { service } = element as { service?: unknown };
      if (Database.is(service)) return service;
    }
  }

  public override render() {
    throw new Error('render function must be overridden');
  }

}
