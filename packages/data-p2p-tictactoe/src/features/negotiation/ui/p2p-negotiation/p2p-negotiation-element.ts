// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Container for serverless P2P play. The negotiation main-service's `connection`
// service is the imperative signaling machine; this element renders purely from
// observable state and forwards user intent through `service.actions.*`, and tears
// the connection down on unmount. No business logic, no full-database access.

import { customElement, property } from "lit/decorators.js";
import { DatabaseElement, useObservableValues, useEffect } from "@adobe/data-lit";
import { MainService } from "../../ecs/main-service.js";
import { copyText } from "../copy-text.js";
import { styles } from "./p2p-negotiation.css.js";
import * as presentation from "./p2p-negotiation-presentation.js";
import type { RenderGame, RenderPresence } from "./p2p-negotiation-presentation.js";

const tagName = "p2p-negotiation";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: P2pNegotiationElement;
    }
}

@customElement(tagName)
export class P2pNegotiationElement extends DatabaseElement<typeof MainService.plugin> {
    static styles = styles;

    @property({ attribute: false })
    renderGame!: RenderGame;

    @property({ attribute: false })
    renderPresence?: RenderPresence;

    get plugin() {
        return MainService.plugin;
    }

    render() {
        const { observe, actions } = this.service;

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

        // Tear down the WebRTC / sync machinery on unmount.
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
            setHostAnswerInput: (value) => actions.setHostAnswerInput({ value }),
            setJoinerOfferInput: (value) => actions.setJoinerOfferInput({ value }),
            copyText,
        });
    }
}
