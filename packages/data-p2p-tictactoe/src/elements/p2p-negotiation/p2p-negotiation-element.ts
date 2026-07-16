// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Container for serverless P2P play. The negotiation database's `negotiation`
// service is the imperative signaling machine; this element renders purely
// from observable state and forwards user intent through `service.actions.*`.
// It supplies the game-specific config once after mount and tears the service
// down on unmount. No business logic, no full-database access.

import { customElement, property } from "lit/decorators.js";
import { Database } from "@adobe/data/ecs";
import { DatabaseElement, useObservableValues, useEffect } from "@adobe/data-lit";
import { NegotiationDatabase } from "../../negotiation/database/negotiation-database.js";
import { copyText } from "../../copy-text.js";
import { styles } from "./p2p-negotiation.css.js";
import * as presentation from "./p2p-negotiation-presentation.js";
import type { RenderGame, RenderPresence } from "./p2p-negotiation-presentation.js";

const tagName = "p2p-negotiation";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: P2pNegotiationElement;
    }
}

type GamePlugin = Database.Plugin<any, any, any, any, any, any, any, any>;
type AssignUserId = (role: "host" | "joiner") => string;

@customElement(tagName)
export class P2pNegotiationElement extends DatabaseElement<typeof NegotiationDatabase.plugin> {
    static styles = styles;

    // Game-specific config: which game to negotiate and how to assign peer ids.
    // Supplied to the service via `configure` after mount (props do not exist
    // when the database is created during connectedCallback).
    @property({ attribute: false })
    gamePlugin!: GamePlugin;

    @property({ attribute: false })
    assignUserId!: AssignUserId;

    @property({ attribute: false })
    renderGame!: RenderGame;

    @property({ attribute: false })
    renderPresence?: RenderPresence;

    get plugin() {
        return NegotiationDatabase.plugin;
    }

    render() {
        const { observe, actions, transactions } = this.service;

        const values = useObservableValues(() => ({
            phase: observe.resources.phase,
            connection: observe.resources.connection,
            offerCode: observe.resources.offerCode,
            answerCode: observe.resources.answerCode,
            bannerText: observe.resources.bannerText,
            bannerError: observe.resources.bannerError,
            hostAnswerInput: observe.resources.hostAnswerInput,
            joinerOfferInput: observe.resources.joinerOfferInput,
            gameDb: observe.resources.gameDb,
        }), []);

        // Configure the service for this game on mount; tear down its WebRTC /
        // sync machinery on unmount.
        useEffect(() => {
            actions.configure({ gamePlugin: this.gamePlugin, assignUserId: this.assignUserId });
            return () => actions.dispose();
        }, []);

        if (!values) return undefined;

        return presentation.render({
            ...values,
            renderGame: this.renderGame,
            renderPresence: this.renderPresence,
            startHost: () => actions.startHost(),
            startJoin: () => actions.startJoin(),
            submitAnswer: () => actions.submitAnswer(),
            generateAnswer: () => actions.generateAnswer(),
            reconnect: () => actions.reconnect(),
            setHostAnswerInput: (value) => transactions.setHostAnswerInput({ value }),
            setJoinerOfferInput: (value) => transactions.setJoinerOfferInput({ value }),
            copyText,
        });
    }
}
