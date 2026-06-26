// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { iterateSelfAndAncestors } from '../functions/index.js';
import { Database } from '@adobe/data/ecs';
import { UIService } from '@adobe/data/service';
import { attachDecorator, withHooks } from '../index.js';

export abstract class DatabaseElement<P extends Database.Plugin> extends LitElement {

  /**
   * @internal DI seam. Set by an ancestor via injection or created from `plugin`
   * on connect. Bootstrap containers (those that own a controller or drive a
   * streaming async-generator transaction) and ancestor injection use this;
   * ordinary consumers inject and read through `service` instead.
   */
  @property({ type: Object, reflect: false })
  database!: Database.Plugin.ToDatabase<P>;

  /**
   * UI-restricted view of the database for rendering. Inject the full database by
   * assigning here (`element.service = db`); reads return the restricted view where
   * every mutator is fire-and-forget `void`.
   */
  get service(): UIService.FromService<Database.Plugin.ToDatabase<P>> {
    return UIService.restrict(this.database);
  }
  set service(db: Database.Plugin.ToDatabase<P>) {
    this.database = db;
  }

  constructor() {
    super();
    attachDecorator(this, 'render', withHooks);
  }

  abstract get plugin(): P;

  connectedCallback(): void {
    if (!this.database) {
      const ancestor = this.findAncestorDatabase();
      this.database = ancestor?.extend(this.plugin) ?? Database.create(this.plugin);
    }
    super.connectedCallback();
  }

  protected findAncestorDatabase(): Database | void {
    for (const element of iterateSelfAndAncestors(this)) {
      const { database } = element as Partial<DatabaseElement<any>>;
      if (Database.is(database)) {
        return database;
      }
    }
  }

  public override render() {
    throw new Error('render function must be overridden');
  }

}
