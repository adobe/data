// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Generic P2P negotiation element. Handles WebRTC signaling and bootstraps a
// synced game database. Completely game-agnostic — game-specific details are
// injected via properties.

import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createRef, ref } from "lit/directives/ref.js";
import { Database } from "@adobe/data/ecs";
import { DatabaseElement, useObservableValues } from "@adobe/data-lit";
import { createSyncServer, createSyncService, createLoopbackTransport, type SyncService } from "@adobe/data-sync";
import { negotiationPlugin } from "../../state/negotiation-plugin.js";
import { startHostSignaling, startJoinerSignaling } from "../../signaling.js";
import { styles } from "./p2p-negotiation.css.js";

export const tagName = "p2p-negotiation";

/**
 * A game-agnostic P2P negotiation element.
 *
 * It manages its own isolated in-memory ECS database for negotiation state
 * (phase, codes, banners). Once both peers have completed WebRTC signaling,
 * it creates a *second*, synced ECS database with the consumer-supplied
 * `gamePlugin` and mounts the consumer-supplied `gameTagName` element with
 * `.service` set to that synced database.
 *
 * @example
 * ```html
 * <p2p-negotiation
 *   .gamePlugin=${combinedPlugin}
 *   .gameTagName=${"tictactoe-app"}
 *   .assignUserId=${(role) => role === "host" ? "X" : "O"}
 * ></p2p-negotiation>
 * ```
 */
@customElement(tagName)
export class P2pNegotiation extends DatabaseElement<typeof negotiationPlugin> {
    static styles = styles;

    /** The ECS plugin to use for the synced game database. */
    @property({ attribute: false })
    gamePlugin!: Database.Plugin<any, any, any, any, any, any, any, any>;

    /** Custom element tag name to instantiate as the game element. */
    @property({ type: String })
    gameTagName!: string;

    /**
     * Maps the negotiated role to a userId string for the synced game
     * database. In Tic-Tac-Toe: `(role) => role === "host" ? "X" : "O"`.
     */
    @property({ attribute: false })
    assignUserId!: (role: "host" | "joiner") => string;

    /**
     * Optional custom element tag name for a presence overlay wrapper. When
     * set, the game element is nested inside the overlay via the overlay's
     * `<slot>`, and both receive `.service = gameDb`. The overlay is what
     * gets mounted as the top-level game mount.
     *
     * @example
     * ```ts
     * <p2p-negotiation presenceTagName="p2p-presence-overlay" ...>
     * ```
     */
    @property({ type: String })
    presenceTagName?: string;

    get plugin() {
        return negotiationPlugin;
    }

    // -------------------------------------------------------------------------
    // Private state (procedural, not in ECS)
    // -------------------------------------------------------------------------

    private _gameEl?: HTMLElement;
    private _gameMountRef = createRef<HTMLDivElement>();

    private _submitAnswer?: (code: string) => void;
    private _answerInput = "";
    private _joinStarted = false;
    private _syncService?: SyncService;
    private _syncServer?: ReturnType<typeof createSyncServer>;

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    override connectedCallback(): void {
        if (!this.service) {
            // Always create an isolated local-only DB. Negotiation state is
            // strictly local to this peer — no ancestor search needed.
            this.service = Database.create(negotiationPlugin) as unknown as typeof this.service;
        }
        super.connectedCallback();
    }

    override disconnectedCallback(): void {
        this._syncService?.dispose();
        this._syncServer?.dispose();
        super.disconnectedCallback();
    }

    override updated() {
        // Mount the game element into the stable container once it is
        // rendered. Guard with firstChild so we never double-mount.
        const container = this._gameMountRef.value;
        if (container && this._gameEl && !container.firstChild) {
            container.appendChild(this._gameEl);
        }
    }

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

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
            case "game":           return html`<div class="game-mount" ${ref(this._gameMountRef)}></div>`;
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
            this.service.transactions.setBanner({
                text: `Error generating offer: ${String(err)}`,
                error: true,
            });
        });

        this._submitAnswer = submitAnswer;

        connected.then((serverTransport) => {
            const userId = this.assignUserId("host");
            this._mountGame(userId, (gameDb) => {
                // Host runs the SyncServer in-process.
                const { client: loopbackClient, server: loopbackServer } = createLoopbackTransport();
                this._syncServer = createSyncServer();
                this._syncServer.connect(serverTransport);
                this._syncServer.connect(loopbackServer);
                this._syncService = createSyncService({ database: gameDb, transport: loopbackClient });
            });
            this.service.transactions.connected();
        }).catch((err: unknown) => {
            this.service.transactions.setBanner({
                text: `Connection failed: ${String(err)}`,
                error: true,
            });
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
            this.service.transactions.setBanner({
                text: `Error creating answer: ${String(err)}`,
                error: true,
            });
        });

        connected.then((clientTransport) => {
            const userId = this.assignUserId("joiner");
            this._mountGame(userId, (gameDb) => {
                this._syncService = createSyncService({ database: gameDb, transport: clientTransport });
            });
            this.service.transactions.connected();
        }).catch((err: unknown) => {
            this.service.transactions.setBanner({
                text: `Connection failed: ${String(err)}`,
                error: true,
            });
        });
    };

    // -------------------------------------------------------------------------
    // Game mounting
    // -------------------------------------------------------------------------

    /**
     * Creates the synced game database, runs the provided wiring function to
     * attach sync transport(s), then creates the game element (optionally
     * wrapped in a presence overlay) and stores it for mounting.
     */
    private _mountGame(
        userId: string,
        wireSyncTransports: (gameDb: Database<any, any, any, any, any, any, any, any>) => void,
    ) {
        const gameDb = Database.create(this.gamePlugin, { sync: { userId } });
        wireSyncTransports(gameDb);

        const gameEl = document.createElement(this.gameTagName) as HTMLElement & { service: typeof gameDb };
        (gameEl as any).service = gameDb;

        if (this.presenceTagName) {
            // Wrap the game element inside the presence overlay so the overlay
            // can render cursor dots on top via <slot> + absolute positioning.
            const overlayEl = document.createElement(this.presenceTagName) as HTMLElement & { service: typeof gameDb };
            (overlayEl as any).service = gameDb;
            overlayEl.appendChild(gameEl);
            this._gameEl = overlayEl;
        } else {
            this._gameEl = gameEl;
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private _copy(text: string) {
        navigator.clipboard.writeText(text).catch(() => undefined);
    }
}
