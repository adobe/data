// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { html } from "lit";
import { Template } from "@adobe/data-lit";
import { render } from "./p2p-negotiation-presentation.js";

const props = (over: Partial<Parameters<typeof render>[0]> = {}) => ({
  phase: "idle" as const,
  connection: "idle" as const,
  offerCode: "",
  answerCode: "",
  bannerText: "",
  bannerError: false,
  hostAnswerInput: "",
  joinerOfferInput: "",
  gameDb: null,
  renderGame: () => html`<div class="game"></div>`,
  renderPresence: undefined,
  startHost: () => {},
  startJoin: () => {},
  submitAnswer: () => {},
  generateAnswer: () => {},
  setHostAnswerInput: () => {},
  setJoinerOfferInput: () => {},
  copyText: () => {},
  reconnect: () => {},
  ...over,
});

describe("p2p-negotiation-presentation", () => {
  it("offers host/join choices in the idle phase and wires them", () => {
    const startHost = () => {};
    const startJoin = () => {};
    const t = Template.from(render(props({ startHost, startJoin })));
    expect(t.text).toContain("Host a game");
    expect(t.text).toContain("Join a game");
    expect(t.values).toContain(startHost);
    expect(t.values).toContain(startJoin);
  });

  it("shows the invite code and copy control in host-signaling", () => {
    const t = Template.from(render(props({ phase: "host-signaling", offerCode: "OFFER-123" })));
    expect(t.text).toContain("invite code");
    expect(t.values).toContain("OFFER-123");
  });

  it("mounts the game view once connected", () => {
    const t = Template.from(render(props({ phase: "game", connection: "connected", gameDb: {} })));
    expect(t.has('class="game"')).toBe(true);
  });

  it("shows the reconnect overlay when the peer disconnects mid-game", () => {
    const reconnect = () => {};
    const t = Template.from(render(props({ phase: "game", connection: "disconnected", reconnect })));
    expect(t.text).toContain("Connection lost");
    expect(t.values).toContain(reconnect);
  });
});
