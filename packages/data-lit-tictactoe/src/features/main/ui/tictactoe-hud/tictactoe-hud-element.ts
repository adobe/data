// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { PlayerMark } from "../../data/player-mark/player-mark.js";
import { TictactoeElement } from "../tictactoe-element.js";
import { styles } from "./tictactoe-hud.css.js";
import * as presentation from "./tictactoe-hud-presentation.js";

const tagName = "tictactoe-hud";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: TictactoeHudElement;
    }
}

@customElement(tagName)
export class TictactoeHudElement extends TictactoeElement {
    static styles = styles;

    render() {
        const values = useObservableValues(
            () => ({
                status: this.service.computed.status,
                winner: this.service.computed.winner,
                currentPlayer: this.service.computed.currentPlayer,
                xWins: this.service.observe.resources.xWins,
                oWins: this.service.observe.resources.oWins,
                draws: this.service.observe.resources.draws,
            }),
            [],
        );

        return presentation.render({
            status: values?.status ?? "idle",
            winner: values?.winner ?? null,
            currentPlayer: values?.currentPlayer ?? PlayerMark.values[0],
            xWins: values?.xWins ?? 0,
            oWins: values?.oWins ?? 0,
            draws: values?.draws ?? 0,
            restartGame: () => this.service.transactions.restartGame(),
        });
    }
}
