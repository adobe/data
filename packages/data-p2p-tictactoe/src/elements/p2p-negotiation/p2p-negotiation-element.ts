// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Bootstrap container for serverless P2P play. Owns the negotiation
// database, builds the synced game database via a sibling controller, and
// hands everything to a pure presentation. All imperative state lives in
// the controller; the element body stays a thin wire.

import { customElement, property } from "lit/decorators.js";
import { Database } from "@adobe/data/ecs";
import { UIService } from "@adobe/data/service";
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

    // This bootstrap container owns the negotiation controller (business logic),
    // which drives awaitable transactions the restricted `service` view voids
    // out. It captures the full database as it flows through the injection
    // setter (the base creates-or-injects via `this.service = …`) and keeps it
    // private to this element — the database stays unreachable through the API.
    #fullDatabase!: NegotiationDatabase;

    override get service(): UIService.FromService<NegotiationDatabase> {
        return super.service;
    }
    override set service(db: NegotiationDatabase) {
        this.#fullDatabase = db;
        super.service = db;
    }

    get plugin() {
        return negotiationPlugin;
    }

    render() {
        const service = this.#fullDatabase;

        const values = useObservableValues(() => ({
            phase: service.observe.resources.phase,
            connection: service.observe.resources.connection,
            offerCode: service.observe.resources.offerCode,
            answerCode: service.observe.resources.answerCode,
            bannerText: service.observe.resources.bannerText,
            bannerError: service.observe.resources.bannerError,
            hostAnswerInput: service.observe.resources.hostAnswerInput,
            joinerOfferInput: service.observe.resources.joinerOfferInput,
            gameDb: service.observe.resources.gameDb,
        }), []);

        const controller = useNegotiationController(service, this.gamePlugin, this.assignUserId);

        if (!values) return undefined;

        return presentation.render({
            ...values,
            renderGame: this.renderGame,
            renderPresence: this.renderPresence,
            startHost: () => controller.startHost(),
            startJoin: () => controller.startJoin(),
            submitAnswer: () => controller.submitAnswer(),
            generateAnswer: () => controller.generateAnswer(),
            setHostAnswerInput: (value) => service.transactions.setHostAnswerInput({ value }),
            setJoinerOfferInput: (value) => service.transactions.setJoinerOfferInput({ value }),
            copyText: (text) => controller.copyText(text),
            reconnect: () => controller.reconnect(),
        });
    }
}
