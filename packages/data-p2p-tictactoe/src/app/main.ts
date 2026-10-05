// © 2026 Adobe. MIT License. See /LICENSE for details.
import { render } from "lit";
import { Tictactoe, PlayerMark } from "data-lit-tictactoe";
import { GameSchema } from "./schema.js";
import type { GameService } from "../features/negotiation/services/game-service/game-service.js";
import { Negotiation } from "../features/negotiation/ui/p2p-negotiation/p2p-negotiation.js";
import { PresenceOverlay } from "../features/presence/ui/p2p-presence-overlay/p2p-presence-overlay.js";

// The game negotiation connects peers into, injected into the negotiation database:
// the host plays X, the joiner O.
const game: GameService<typeof GameSchema.plugin> = {
  serviceName: "game",
  plugin: GameSchema.plugin,
  assignUserId: (role) => PlayerMark.values[role === "host" ? 0 : 1],
};

const app = document.getElementById("app");
if (app) {
  render(
    Negotiation({
      game,
      renderGame: ({ service }) => Tictactoe({ service }),
      renderPresence: ({ service, children }) => PresenceOverlay({ service, children }),
    }),
    app,
  );
}
