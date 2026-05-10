// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Top-level application element. Manages the WebRTC signaling flow and
// transitions to the live game — all reactive state lives in the ECS service.
//
// As the DOM root, we override `connectedCallback` to call
// `Database.create(p2pPlugin, { userId })` ourselves, where `userId` is a
// fresh UUID per browser tab. The sync layer's reconciler uses
// `(userId, id)` as its compound transient-replace key so two tabs never
// clobber each other's transients on the wire.

import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { Database } from "@adobe/data/ecs";
import { useObservableValues } from "@adobe/data-lit";
import { createSyncServer, createSyncService, createLoopbackTransport, type SyncService } from "@adobe/data-sync";
import { startHostSignaling, startJoinerSignaling } from "../../signaling.js";
import { p2pPlugin } from "../../state/p2p-plugin.js";
import { P2pElement } from "../p2p-element.js";
import { styles } from "./p2p-app.css.js";
import "../p2p-board/p2p-board.js";
import "../p2p-hud/p2p-hud.js";

export const tagName = "p2p-app";

@customElement(tagName)
export class P2pApp extends P2pElement {
    static styles = styles;

    // Procedural signaling plumbing — not reactive state.
    private _submitAnswer?: (code: string) => void;
    private _answerInput = "";
    private _joinStarted = false;
    private _syncService?: SyncService;
    private _syncServer?: ReturnType<typeof createSyncServer>;

    override connectedCallback(): void {
        if (!this.service) {
            // Each tab/peer must have a unique userId — the reconciler keys
            // its transient queue by (userId, id) and would collide if two
            // peers happened to pick the same id-counter values.
            this.service = Database.create(p2pPlugin, {
                userId: crypto.randomUUID(),
            }) as unknown as typeof this.service;
        }
        super.connectedCallback();
    }

    override disconnectedCallback(): void {
        this._syncService?.dispose();
        this._syncServer?.dispose();
        super.disconnectedCallback();
    }

    render() {
        const values = useObservableValues(
            () => ({
                phase:       this.service.observe.resources.phase,
                offerCode:   this.service.observe.resources.offerCode,
                answerCode:  this.service.observe.resources.answerCode,
                bannerText:  this.service.observe.resources.bannerText,
                bannerError: this.service.observe.resources.bannerError,
            }),
            [],
        );

        const phase       = values?.phase       ?? "idle";
        const offerCode   = values?.offerCode   ?? "";
        const answerCode  = values?.answerCode  ?? "";
        const bannerText  = values?.bannerText  ?? "";
        const bannerError = values?.bannerError ?? false;

        switch (phase) {
            case "idle":           return this._renderIdle();
            case "host-signaling": return this._renderHostSignaling(offerCode, bannerText, bannerError);
            case "join-signaling": return this._renderJoinSignaling(answerCode, bannerText, bannerError);
            case "game":           return this._renderGame();
        }
    }

    // -------------------------------------------------------------------------
    // Phase: idle
    // -------------------------------------------------------------------------

    private _renderIdle() {
        return html`
            <div class="role-select">
                <h2>Serverless P2P Tic-Tac-Toe</h2>
                <p class="subtitle">
                    No server needed — connect directly with a friend using
                    a pair of copy-pastes.
                </p>
                <div class="role-buttons">
                    <button class="btn btn--role" @click=${this._startHost}>Host a game</button>
                    <button class="btn btn--role btn--secondary" @click=${this._startJoin}>Join a game</button>
                </div>
                <p class="hint">Host = plays as X · Joiner = plays as O</p>
            </div>
        `;
    }

    private _startHost = () => {
        this.service.transactions.startHostSignaling();

        const { offerCode, submitAnswer, connected } = startHostSignaling();

        offerCode.then((code) => {
            this.service.transactions.setOfferCode({ code });
        }).catch((err: unknown) => {
            this.service.transactions.setBanner({ text: `Error generating offer: ${String(err)}`, error: true });
        });

        this._submitAnswer = submitAnswer;

        connected.then((serverTransport) => {
            // Host runs the SyncServer in-process and connects:
            //   - the WebRTC server transport (joiner's link)
            //   - a loopback transport pair, with the loopback-client end
            //     given to the host's own SyncService.
            const { client: loopbackClient, server: loopbackServer } = createLoopbackTransport();
            this._syncServer = createSyncServer();
            this._syncServer.connect(serverTransport);
            this._syncServer.connect(loopbackServer);
            this._syncService = createSyncService({ database: this.service, transport: loopbackClient });
            this.service.transactions.connected({ myMark: "X" });
        }).catch((err: unknown) => {
            this.service.transactions.setBanner({ text: `Connection failed: ${String(err)}`, error: true });
        });
    };

    // -------------------------------------------------------------------------
    // Phase: host-signaling
    // -------------------------------------------------------------------------

    private _renderHostSignaling(offerCode: string, bannerText: string, bannerError: boolean) {
        return html`
            <div class="signaling">
                <h2>Host a game</h2>
                ${bannerText
                    ? html`<div class="banner ${bannerError ? "banner--error" : ""}">${bannerText}</div>`
                    : ""}
                ${offerCode ? html`
                    <p class="step">Step 1 — Send this invite code to your friend:</p>
                    <div class="codebox-wrap">
                        <label class="label">Your invite code</label>
                        <textarea class="codebox" rows="4" readonly .value=${offerCode}></textarea>
                        <button class="btn btn--sm" @click=${() => this._copy(offerCode)}>Copy</button>
                    </div>
                    <p class="step">Step 2 — Paste the code your friend sends back:</p>
                    <div class="codebox-wrap">
                        <label class="label">Friend's answer code</label>
                        <textarea class="codebox" rows="4" placeholder="Paste code here…"
                            @input=${(e: Event) => { this._answerInput = (e.target as HTMLTextAreaElement).value.trim(); }}
                        ></textarea>
                        <button class="btn" @click=${this._submitAnswerCode}>Connect →</button>
                    </div>
                    <p class="hint">Waiting for connection…</p>
                ` : ""}
            </div>
        `;
    }

    private _submitAnswerCode = () => {
        if (this._answerInput && this._submitAnswer) {
            this._submitAnswer(this._answerInput);
        }
    };

    // -------------------------------------------------------------------------
    // Phase: join-signaling
    // -------------------------------------------------------------------------

    private _startJoin = () => {
        this.service.transactions.startJoinSignaling();
    };

    private _renderJoinSignaling(answerCode: string, bannerText: string, bannerError: boolean) {
        return html`
            <div class="signaling">
                <h2>Join a game</h2>
                ${bannerText
                    ? html`<div class="banner ${bannerError ? "banner--error" : ""}">${bannerText}</div>`
                    : ""}
                <p class="step">Paste the invite code your friend gave you:</p>
                <div class="codebox-wrap">
                    <label class="label">Host's invite code</label>
                    <textarea class="codebox" rows="4" placeholder="Paste code here…"
                        @input=${(e: Event) => { this._answerInput = (e.target as HTMLTextAreaElement).value.trim(); }}
                    ></textarea>
                    <button class="btn" @click=${this._generateAnswer}>Generate answer →</button>
                </div>
                ${answerCode ? html`
                    <p class="step">Send this answer code back to your friend:</p>
                    <div class="codebox-wrap">
                        <label class="label">Your answer code</label>
                        <textarea class="codebox" rows="4" readonly .value=${answerCode}></textarea>
                        <button class="btn btn--sm" @click=${() => this._copy(answerCode)}>Copy</button>
                    </div>
                    <p class="hint">Once your friend enters it, the game starts automatically.</p>
                ` : ""}
            </div>
        `;
    }

    private _generateAnswer = () => {
        if (this._joinStarted || !this._answerInput) return;
        this._joinStarted = true;
        this.service.transactions.setBanner({ text: "Generating answer — please wait…" });

        const { answerCode, connected } = startJoinerSignaling(this._answerInput);

        answerCode.then((code) => {
            this.service.transactions.setAnswerCode({ code });
        }).catch((err: unknown) => {
            this.service.transactions.setBanner({ text: `Error creating answer: ${String(err)}`, error: true });
        });

        connected.then((clientTransport) => {
            this._syncService = createSyncService({ database: this.service, transport: clientTransport });
            this.service.transactions.connected({ myMark: "O" });
        }).catch((err: unknown) => {
            this.service.transactions.setBanner({ text: `Connection failed: ${String(err)}`, error: true });
        });
    };

    // -------------------------------------------------------------------------
    // Phase: game
    // -------------------------------------------------------------------------

    private _renderGame() {
        return html`
            <div class="game">
                <p2p-hud></p2p-hud>
                <p2p-board></p2p-board>
            </div>
        `;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private _copy(text: string) {
        navigator.clipboard.writeText(text).catch(() => undefined);
    }
}
