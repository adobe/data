/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

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
