// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "../../transaction-database/transaction-database.js";
import { SignalingService } from "../../../signaling-service/signaling-service.js";
import { createConnectionService } from "./create-connection-service.js";

// A microtask/timer flush so the fake signaling promises resolve.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("connection service (deterministic fake signaling)", () => {
  it("startHost enters host-signaling and records the invite code", async () => {
    const db = Database.create(TransactionDatabase.plugin);
    const service = createConnectionService(db, SignalingService.createFake);

    service.startHost();
    expect(db.resources.phase).toBe("host-signaling");
    expect(db.resources.role).toBe("host");
    expect(db.resources.connection).toBe("connecting");

    await flush();
    expect(db.resources.offerCode).toBe("fake-invite-code");
  });

  it("generateAnswer records the answer code", async () => {
    const db = Database.create(TransactionDatabase.plugin);
    const service = createConnectionService(db, SignalingService.createFake);

    db.transactions.setJoinerOfferInput({ value: "OFFER-xyz" });
    service.startJoin();
    expect(db.resources.phase).toBe("join-signaling");

    service.generateAnswer();
    await flush();
    expect(db.resources.answerCode).toBe("fake-answer-code");
  });
});
