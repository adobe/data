// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { RpcPanelElement } from "../ui/rpc-panel-element.js";
import { panelStyles } from "../ui/panel.css.js";
import type { MainService } from "../shared/main-service.js";
import type { SubService } from "../shared/sub-service.js";

const tagName = "sub-panel";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: SubPanelElement;
    }
}

/**
 * The SUB frame's panel — mirror of the main panel. Observes its own
 * `status`/`inbox` (local) and the main's `time` (remote), and drives the main's
 * promise / generator / void members.
 */
@customElement(tagName)
export class SubPanelElement extends RpcPanelElement {
    static styles = panelStyles;

    @property({ attribute: false }) local!: SubService;
    @property({ attribute: false }) remote!: MainService;

    @state() private echoResult = "";
    @state() private streamOut: readonly number[] = [];

    render() {
        const v = useObservableValues(
            () => ({ status: this.local.status, inbox: this.local.inbox, time: this.remote.time }),
            [this.local, this.remote],
        );
        return html`
            <h2>Sub frame (iframe)</h2>
            <div class="row"><span class="label">Status (local):</span><span class="value">${v?.status ?? "…"}</span></div>
            <div class="row"><span class="label">Main clock (observe):</span><span class="value">${v?.time ?? 0}</span></div>
            <div class="row"><span class="label">Inbox from main (void):</span></div>
            <ul>${(v?.inbox ?? []).map((m) => html`<li>${m}</li>`)}</ul>
            <div class="row">
                <button @click=${this.doEcho}>echo → main (promise)</button>
                <span class="value">${this.echoResult}</span>
            </div>
            <div class="row">
                <button @click=${this.doStream}>countUp ← main (generator)</button>
                <span class="value">${this.streamOut.join(" ")}</span>
            </div>
            <div class="row">
                <button @click=${this.doLog}>log → main (void)</button>
            </div>
        `;
    }

    private doEcho = async () => {
        this.echoResult = await this.remote.echo(`hi from sub @${new Date().toLocaleTimeString()}`);
    };

    private doStream = async () => {
        this.streamOut = [];
        for await (const n of this.remote.countUp(5)) this.streamOut = [...this.streamOut, n];
    };

    private doLog = () => {
        this.remote.log(`hello from sub @${new Date().toLocaleTimeString()}`);
    };
}
