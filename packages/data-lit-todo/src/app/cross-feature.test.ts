// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { AppSchema } from "./schema.js";
import { MainService as AssignService } from "../features/assign/ecs/main-service.js";

// Every feature's entities share one store, so an id-addressed op must check the
// entity's kind: a user id passed to a todo op changes nothing.
describe("cross-feature entity ids", () => {
  const setup = () => {
    const db = Database.create(AppSchema.plugin).extend(AssignService.plugin);
    db.actions.addUser({ name: "ada" });
    return { db, user: db.select(db.archetypes.User.components)[0]! };
  };

  it("todo ops ignore a user id", () => {
    const { db, user } = setup();
    db.actions.toggleComplete({ id: user });
    db.actions.selectTodo({ id: user });
    db.actions.deleteTodo({ id: user });
    expect(db.read(user)).toEqual({ user: true, name: "ada" });
    expect(db.resources.selectedTodo).not.toBe(user);
  });

  it("assign ops ignore a user id", () => {
    const { db, user } = setup();
    db.actions.assignUser({ todo: user, name: "ada" });
    expect(db.read(user)?.assignees).toBeUndefined();
  });
});
