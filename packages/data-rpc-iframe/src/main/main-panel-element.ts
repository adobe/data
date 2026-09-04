// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { RpcPanelElement } from "../ui/rpc-panel-element.js";
import { panelStyles } from "../ui/panel.css.js";
import type { MainService } from "../shared/main-service.js";
import type { SubService } from "../shared/sub-service.js";

const tagName = "main-panel";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: MainPanelElement;
    }
}

/**
 * The MAIN frame's panel. Observes its own `time`/`logs` (local) and the sub's
 * `status` (remote), and drives the sub's promise / generator / void members.
 */
@customElement(tagName)
export class MainPanelElement extends RpcPanelElement {
    static styles = panelStyles;

    @property({ attribute: false }) local!: MainService;
    @property({ attribute: false }) remote!: SubService;

    @state() private echoResult = "";
    @state() private streamOut: readonly number[] = [];
    @state() private calcResult = "";

    render() {
        const v = useObservableValues(
            () => ({
                time: this.local.time,
                logs: this.local.logs,
                status: this.remote.status,
                calcTotal: this.remote.calc.total, // NESTED observe across the boundary
            }),
            [this.local, this.remote],
        );
        return html`
            <h2>Main frame</h2>
            <div class="row"><span class="label">Clock (local):</span><span class="value">${v?.time ?? 0}</span></div>
            <div class="row"><span class="label">Sub status (observe):</span><span class="value">${v?.status ?? "…"}</span></div>
            <div class="row"><span class="label">Logs from sub (void):</span></div>
            <ul>${(v?.logs ?? []).map((m) => html`<li>${m}</li>`)}</ul>
            <div class="row">
                <button @click=${this.doEcho}>echo → sub (promise)</button>
                <span class="value">${this.echoResult}</span>
            </div>
            <div class="row">
                <button @click=${this.doStream}>countUp ← sub (generator)</button>
                <span class="value">${this.streamOut.join(" ")}</span>
            </div>
            <div class="row">
                <button @click=${this.doNotify}>notify → sub (void)</button>
            </div>
            <div class="row"><span class="label">sub.calc.total (nested observe):</span><span class="value">${v?.calcTotal ?? 0}</span></div>
            <div class="row">
                <button @click=${this.doCalcAdd}>calc.add(5) → sub (nested promise)</button>
                <span class="value">${this.calcResult}</span>
                <button @click=${this.doCalcReset}>calc.reset → sub (nested void)</button>
            </div>
        `;
    }

    private doEcho = async () => {
        this.echoResult = await this.remote.echo(`hi from main @${new Date().toLocaleTimeString()}`);
    };

    private doStream = async () => {
        this.streamOut = [];
        for await (const n of this.remote.countUp(5)) this.streamOut = [...this.streamOut, n];
    };

    private doNotify = () => {
        this.remote.notify(`hello from main @${new Date().toLocaleTimeString()}`);
    };

    private doCalcAdd = async () => {
        this.calcResult = `= ${await this.remote.calc.add(5)}`;
    };

    private doCalcReset = () => {
        this.remote.calc.reset();
        this.calcResult = "";
    };
}
