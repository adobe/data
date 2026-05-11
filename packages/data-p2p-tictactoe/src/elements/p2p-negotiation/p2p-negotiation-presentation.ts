// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, nothing, type TemplateResult } from "lit";
import type { Phase } from "../../types/phase/phase.js";
import type { ConnectionState } from "../../state/negotiation-plugin.js";

export type RenderGame = (args: { service: unknown }) => TemplateResult;
export type RenderPresence = (args: { service: unknown; children: TemplateResult }) => TemplateResult;

export function render({
    phase,
    connection,
    offerCode,
    answerCode,
    bannerText,
    bannerError,
    hostAnswerInput,
    joinerOfferInput,
    gameDb,
    renderGame,
    renderPresence,
    startHost,
    startJoin,
    submitAnswer,
    generateAnswer,
    setHostAnswerInput,
    setJoinerOfferInput,
    copyText,
    reconnect,
}: {
    phase: Phase;
    connection: ConnectionState;
    offerCode: string;
    answerCode: string;
    bannerText: string;
    bannerError: boolean;
    hostAnswerInput: string;
    joinerOfferInput: string;
    gameDb: unknown;
    renderGame: RenderGame;
    renderPresence?: RenderPresence;
    startHost: () => void;
    startJoin: () => void;
    submitAnswer: () => void;
    generateAnswer: () => void;
    setHostAnswerInput: (value: string) => void;
    setJoinerOfferInput: (value: string) => void;
    copyText: (text: string) => void;
    reconnect: () => void;
}): TemplateResult | typeof nothing {
    // Disconnected overlay sits on top of the game view regardless of phase.
    if (connection === "disconnected" && phase === "game") {
        return renderDisconnected({ reconnect });
    }

    // When reconnecting, fall through to the normal signaling UI so the new
    // invite/answer code is visible. A banner at the top explains the context.
    const reconnecting = connection === "reconnecting";
    const reconnectBannerForPhase =
        phase === "host-signaling"
            ? "Reconnecting — copy the new invite code and send it to your friend."
            : "Reconnecting — ask your friend for their new invite code, then paste it below.";
    const effectiveBannerText = reconnecting ? reconnectBannerForPhase : bannerText;
    const effectiveBannerError = reconnecting ? false : bannerError;

    switch (phase) {
        case "idle":
            return renderIdle({ startHost, startJoin });
        case "host-signaling":
            return renderHostSignaling({
                offerCode,
                bannerText: effectiveBannerText,
                bannerError: effectiveBannerError,
                reconnecting,
                hostAnswerInput, setHostAnswerInput, submitAnswer, copyText,
            });
        case "join-signaling":
            return renderJoinSignaling({
                answerCode,
                bannerText: effectiveBannerText,
                bannerError: effectiveBannerError,
                reconnecting,
                joinerOfferInput, setJoinerOfferInput, generateAnswer, copyText,
            });
        case "game":
            return renderGameMount({ gameDb, renderGame, renderPresence });
    }
}

const banner = (text: string, error: boolean, reconnecting = false) =>
    text ? html`<div class="banner ${error ? "banner--error" : reconnecting ? "banner--reconnect" : ""}">${text}</div>` : nothing;

const inputValue = (e: Event) => (e.target as HTMLTextAreaElement).value;

function renderIdle({
    startHost,
    startJoin,
}: {
    startHost: () => void;
    startJoin: () => void;
}) {
    return html`
        <div class="role-select">
            <h2>Serverless P2P Tic-Tac-Toe</h2>
            <p class="subtitle">
                No server needed — connect directly with a friend using
                a pair of copy-pastes.
            </p>
            <div class="role-buttons">
                <button class="btn btn--role" @click=${startHost}>Host a game</button>
                <button class="btn btn--role btn--secondary" @click=${startJoin}>Join a game</button>
            </div>
            <p class="hint">Host = plays as X · Joiner = plays as O</p>
        </div>
    `;
}

function renderHostSignaling({
    offerCode,
    bannerText,
    bannerError,
    reconnecting,
    hostAnswerInput,
    setHostAnswerInput,
    submitAnswer,
    copyText,
}: {
    offerCode: string;
    bannerText: string;
    bannerError: boolean;
    reconnecting: boolean;
    hostAnswerInput: string;
    setHostAnswerInput: (value: string) => void;
    submitAnswer: () => void;
    copyText: (text: string) => void;
}) {
    return html`
        <div class="signaling">
            <h2>${reconnecting ? "Reconnect — Host" : "Host a game"}</h2>
            ${banner(bannerText, bannerError, reconnecting)}
            ${offerCode ? html`
                <p class="step">Step 1 — Send this invite code to your friend:</p>
                <div class="codebox-wrap">
                    <label class="label">Your invite code</label>
                    <textarea class="codebox" rows="4" readonly .value=${offerCode}></textarea>
                    <button class="btn btn--sm" @click=${() => copyText(offerCode)}>Copy</button>
                </div>
                <p class="step">Step 2 — Paste the code your friend sends back:</p>
                <div class="codebox-wrap">
                    <label class="label">Friend's answer code</label>
                    <textarea class="codebox" rows="4" placeholder="Paste code here…"
                        .value=${hostAnswerInput}
                        @input=${(e: Event) => setHostAnswerInput(inputValue(e))}
                    ></textarea>
                    <button class="btn" @click=${submitAnswer}>Connect →</button>
                </div>
                <p class="hint">Waiting for connection…</p>
            ` : nothing}
        </div>
    `;
}

function renderJoinSignaling({
    answerCode,
    bannerText,
    bannerError,
    reconnecting,
    joinerOfferInput,
    setJoinerOfferInput,
    generateAnswer,
    copyText,
}: {
    answerCode: string;
    bannerText: string;
    bannerError: boolean;
    reconnecting: boolean;
    joinerOfferInput: string;
    setJoinerOfferInput: (value: string) => void;
    generateAnswer: () => void;
    copyText: (text: string) => void;
}) {
    return html`
        <div class="signaling">
            <h2>${reconnecting ? "Reconnect — Joiner" : "Join a game"}</h2>
            ${banner(bannerText, bannerError, reconnecting)}
            <p class="step">Paste the invite code your friend gave you:</p>
            <div class="codebox-wrap">
                <label class="label">Host's invite code</label>
                <textarea class="codebox" rows="4" placeholder="Paste code here…"
                    .value=${joinerOfferInput}
                    @input=${(e: Event) => setJoinerOfferInput(inputValue(e))}
                ></textarea>
                <button class="btn" @click=${generateAnswer}>Generate answer →</button>
            </div>
            ${answerCode ? html`
                <p class="step">Send this answer code back to your friend:</p>
                <div class="codebox-wrap">
                    <label class="label">Your answer code</label>
                    <textarea class="codebox" rows="4" readonly .value=${answerCode}></textarea>
                    <button class="btn btn--sm" @click=${() => copyText(answerCode)}>Copy</button>
                </div>
                <p class="hint">Once your friend enters it, the game starts automatically.</p>
            ` : nothing}
        </div>
    `;
}

function renderGameMount({
    gameDb,
    renderGame,
    renderPresence,
}: {
    gameDb: unknown;
    renderGame: RenderGame;
    renderPresence?: RenderPresence;
}) {
    if (!gameDb) return nothing;
    const game = renderGame({ service: gameDb });
    return renderPresence ? renderPresence({ service: gameDb, children: game }) : game;
}

function renderDisconnected({ reconnect }: { reconnect: () => void }) {
    return html`
        <div class="disconnected-overlay">
            <div class="disconnected-card">
                <h2>Connection lost</h2>
                <p>Your peer disconnected. You can try to reconnect — the game state is preserved.</p>
                <button class="btn btn--role" @click=${reconnect}>Reconnect</button>
            </div>
        </div>
    `;
}

