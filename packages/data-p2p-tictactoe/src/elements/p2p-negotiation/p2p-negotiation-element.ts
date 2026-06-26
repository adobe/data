// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Bootstrap container for serverless P2P play. Builds the negotiation database
// for the injected game (the imperative signaling machine lives in that
// database's `negotiation` service), then renders purely from observable
// state and forwards user intent through `service.actions.*`. No business
// logic, no full-database access.

import { customElement, property } from "lit/decorators.js";
import { Database } from "@adobe/data/ecs";
import { DatabaseElement, useObservableValues, useEffect } from "@adobe/data-lit";
import { createNegotiationPlugin, type NegotiationPlugin } from "../../state/negotiation-plugin.js";
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
export class P2pNegotiationElement extends DatabaseElement<NegotiationPlugin> {
    static styles = styles;

    // Bootstrap config: which game to negotiate and how to assign peer ids.
    // Game-specific, so the composition root injects it; it feeds plugin
    // construction below and is never read inside render branching.
    @property({ attribute: false })
    gamePlugin!: GamePlugin;

    @property({ attribute: false })
    assignUserId!: AssignUserId;

    @property({ attribute: false })
    renderGame!: RenderGame;

    @property({ attribute: false })
    renderPresence?: RenderPresence;

    #plugin?: NegotiationPlugin;
    get plugin(): NegotiationPlugin {
        return (this.#plugin ??= createNegotiationPlugin({
            gamePlugin: this.gamePlugin,
            assignUserId: this.assignUserId,
        }));
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

        // Tear down the WebRTC / sync machinery when this container unmounts.
        useEffect(() => () => actions.dispose(), []);

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
