// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Top-level application element. Manages the signaling state machine and
// renders either the connection UI or the live game.
//
// This is a plain LitElement (no hooks needed) — state is driven by Lit's
// own @state reactive properties. Only the in-game child elements (p2p-board,
// p2p-cell, p2p-hud) use the data-lit hook system.

import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Database } from "@adobe/data/ecs";
import { createSyncServer, createSyncClient, createLoopbackTransport } from "@adobe/data-sync";
import type { SyncClient } from "@adobe/data-sync";
import { p2pPlugin, type P2pDatabase, type PlayerMark } from "../../state/p2p-plugin.js";
import { startHostSignaling, startJoinerSignaling } from "../../signaling.js";
import { styles } from "./p2p-app.css.js";
import "../p2p-board/p2p-board.js";
import "../p2p-hud/p2p-hud.js";

type Phase =
    | "idle"
    | "host-signaling"
    | "join-signaling"
    | "game";

export const tagName = "p2p-app";

@customElement(tagName)
export class P2pApp extends LitElement {
    static styles = styles;

    @state() phase: Phase = "idle";
    @state() offerCode = "";
    @state() answerCode = "";
    @state() bannerText = "";
    @state() bannerError = false;
    @state() service?: P2pDatabase;
    @state() syncClient?: SyncClient;
    @state() myMark?: PlayerMark;

    // Resolved by the host to submit the joiner's answer code
    private _submitAnswer?: (code: string) => void;
    private _answerInput = "";

    render() {
        switch (this.phase) {
            case "idle":        return this._renderIdle();
            case "host-signaling": return this._renderHostSignaling();
            case "join-signaling": return this._renderJoinSignaling();
            case "game":        return this._renderGame();
        }
    }

    // -----------------------------------------------------------------------
    // Phase: idle — role selection
    // -----------------------------------------------------------------------

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

    private _startHost() {
        this.phase = "host-signaling";
        this.bannerText = "Generating invite code — please wait…";
        this.bannerError = false;

        const { offerCode, submitAnswer, connected } = startHostSignaling();

        offerCode.then((code) => {
            this.offerCode = code;
            this.bannerText = "";
        }).catch((err: unknown) => {
            this.bannerText = `Error generating offer: ${String(err)}`;
            this.bannerError = true;
        });

        this._submitAnswer = submitAnswer;

        connected.then((serverTransport) => {
            const db = Database.create(p2pPlugin);
            const syncServer = createSyncServer();
            syncServer.connect(serverTransport);
            const { client: loopbackClient, server: loopbackServer } = createLoopbackTransport();
            syncServer.connect(loopbackServer);
            const sc = createSyncClient({ database: db as any, transport: loopbackClient });
            this.service = db;
            this.syncClient = sc;
            this.myMark = "X";
            this.phase = "game";
        }).catch((err: unknown) => {
            this.bannerText = `Connection failed: ${String(err)}`;
            this.bannerError = true;
        });
    }

    // -----------------------------------------------------------------------
    // Phase: host-signaling — show offer code, wait for answer
    // -----------------------------------------------------------------------

    private _renderHostSignaling() {
        return html`
            <div class="signaling">
                <h2>Host a game</h2>
                ${this.bannerText
                    ? html`<div class="banner ${this.bannerError ? "banner--error" : ""}">${this.bannerText}</div>`
                    : ""}
                ${this.offerCode ? html`
                    <p class="step">Step 1 — Send this invite code to your friend:</p>
                    <div class="codebox-wrap">
                        <label class="label">Your invite code</label>
                        <textarea class="codebox" rows="4" readonly .value=${this.offerCode}></textarea>
                        <button class="btn btn--sm" @click=${() => this._copy(this.offerCode)}>Copy</button>
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

    private _submitAnswerCode() {
        if (this._answerInput && this._submitAnswer) {
            this._submitAnswer(this._answerInput);
        }
    }

    // -----------------------------------------------------------------------
    // Phase: join-signaling — paste offer, get answer
    // -----------------------------------------------------------------------

    private _startJoin() {
        this.phase = "join-signaling";
    }

    private _joinStarted = false;

    private _renderJoinSignaling() {
        return html`
            <div class="signaling">
                <h2>Join a game</h2>
                ${this.bannerText
                    ? html`<div class="banner ${this.bannerError ? "banner--error" : ""}">${this.bannerText}</div>`
                    : ""}
                <p class="step">Paste the invite code your friend gave you:</p>
                <div class="codebox-wrap">
                    <label class="label">Host's invite code</label>
                    <textarea class="codebox" rows="4" placeholder="Paste code here…"
                        @input=${(e: Event) => { this._answerInput = (e.target as HTMLTextAreaElement).value.trim(); }}
                    ></textarea>
                    <button class="btn" @click=${this._generateAnswer}>Generate answer →</button>
                </div>
                ${this.answerCode ? html`
                    <p class="step">Send this answer code back to your friend:</p>
                    <div class="codebox-wrap">
                        <label class="label">Your answer code</label>
                        <textarea class="codebox" rows="4" readonly .value=${this.answerCode}></textarea>
                        <button class="btn btn--sm" @click=${() => this._copy(this.answerCode)}>Copy</button>
                    </div>
                    <p class="hint">Once your friend enters it, the game starts automatically.</p>
                ` : ""}
            </div>
        `;
    }

    private _generateAnswer() {
        if (this._joinStarted || !this._answerInput) return;
        this._joinStarted = true;
        this.bannerText = "Generating answer — please wait…";

        const { answerCode, connected } = startJoinerSignaling(this._answerInput);

        answerCode.then((code) => {
            this.answerCode = code;
            this.bannerText = "";
        }).catch((err: unknown) => {
            this.bannerText = `Error creating answer: ${String(err)}`;
            this.bannerError = true;
        });

        connected.then((clientTransport) => {
            const db = Database.create(p2pPlugin);
            const sc = createSyncClient({ database: db as any, transport: clientTransport });
            this.service = db;
            this.syncClient = sc;
            this.myMark = "O";
            this.phase = "game";
        }).catch((err: unknown) => {
            this.bannerText = `Connection failed: ${String(err)}`;
            this.bannerError = true;
        });
    }

    // -----------------------------------------------------------------------
    // Phase: game
    // -----------------------------------------------------------------------

    private _renderGame() {
        if (!this.service || !this.syncClient || !this.myMark) return html``;
        return html`
            <div class="game">
                <p2p-hud
                    .service=${this.service}
                    .syncClient=${this.syncClient}
                    .myMark=${this.myMark}
                ></p2p-hud>
                <p2p-board
                    .service=${this.service}
                    .syncClient=${this.syncClient}
                    .myMark=${this.myMark}
                ></p2p-board>
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private _copy(text: string) {
        navigator.clipboard.writeText(text).catch(() => undefined);
    }
}
