// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement } from "lit";
import { attachDecorator, withHooks } from "@adobe/data-lit";

/**
 * Base for the sample's panel elements: a plain `LitElement` with the
 * `@adobe/data-lit` hooks decorator attached to `render`, so `useObservableValues`
 * works. Each panel receives its `local` service and the `remote` (RPC-projected)
 * peer service as properties — the bootstrap-container DI pattern.
 */
export abstract class RpcPanelElement extends LitElement {
    constructor() {
        super();
        attachDecorator(this, "render", withHooks);
    }

    public override render(): unknown {
        throw new Error("render must be overridden");
    }
}
