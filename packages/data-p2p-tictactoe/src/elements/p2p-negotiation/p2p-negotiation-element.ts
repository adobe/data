// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Bootstrap container for serverless P2P play. Owns the negotiation
// database, builds the synced game database via a sibling controller, and
// hands everything to a pure presentation. All imperative state lives in
// the controller; the element body stays a thin wire.

import { customElement, property } from "lit/decorators.js";
import { Database } from "@adobe/data/ecs";
import { DatabaseElement, useObservableValues, useMemo, useEffect } from "@adobe/data-lit";
import { negotiationPlugin } from "../../state/negotiation-plugin.js";
import { createNegotiationController } from "../../state/negotiation-controller.js";
import { styles } from "./p2p-negotiation.css.js";
import * as presentation from "./p2p-negotiation-presentation.js";
import type { RenderGame, RenderPresence } from "./p2p-negotiation-presentation.js";

const tagName = "p2p-negotiation";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: P2pNegotiationElement;
    }
}

type NegotiationDatabase = Database.Plugin.ToDatabase<typeof negotiationPlugin>;
type GamePlugin = Database.Plugin<any, any, any, any, any, any, any, any>;
type AssignUserId = (role: "host" | "joiner") => string;

/**
 * Owns the negotiation controller for the lifetime of its caller: builds
 * it whenever its inputs change, and disposes it on teardown. The
 * `useMemo` + `useEffect` pair is one concept — give it one name.
 */
function useNegotiationController(
    service: NegotiationDatabase,
    gamePlugin: GamePlugin,
    assignUserId: AssignUserId,
) {
    const controller = useMemo(
        () => createNegotiationController(service, { gamePlugin, assignUserId }),
        [service, gamePlugin, assignUserId],
    );
    useEffect(() => () => controller.dispose(), [controller]);
    return controller;
}

@customElement(tagName)
export class P2pNegotiationElement extends DatabaseElement<typeof negotiationPlugin> {
    static styles = styles;

    @property({ attribute: false })
    gamePlugin!: GamePlugin;

    @property({ attribute: false })
    assignUserId!: AssignUserId;

    @property({ attribute: false })
    renderGame!: RenderGame;

    @property({ attribute: false })
    renderPresence?: RenderPresence;

    get plugin() {
        return negotiationPlugin;
    }

    render() {
        const values = useObservableValues(() => ({
            phase: this.service.observe.resources.phase,
            connection: this.service.observe.resources.connection,
            offerCode: this.service.observe.resources.offerCode,
            answerCode: this.service.observe.resources.answerCode,
            bannerText: this.service.observe.resources.bannerText,
            bannerError: this.service.observe.resources.bannerError,
            hostAnswerInput: this.service.observe.resources.hostAnswerInput,
            joinerOfferInput: this.service.observe.resources.joinerOfferInput,
            gameDb: this.service.observe.resources.gameDb,
        }), []);

        const controller = useNegotiationController(this.service, this.gamePlugin, this.assignUserId);

        if (!values) return undefined;

        return presentation.render({
            ...values,
            renderGame: this.renderGame,
            renderPresence: this.renderPresence,
            startHost: () => controller.startHost(),
            startJoin: () => controller.startJoin(),
            submitAnswer: () => controller.submitAnswer(),
            generateAnswer: () => controller.generateAnswer(),
            setHostAnswerInput: (value) => this.service.transactions.setHostAnswerInput({ value }),
            setJoinerOfferInput: (value) => this.service.transactions.setJoinerOfferInput({ value }),
            copyText: (text) => controller.copyText(text),
            reconnect: () => controller.reconnect(),
        });
    }
}
