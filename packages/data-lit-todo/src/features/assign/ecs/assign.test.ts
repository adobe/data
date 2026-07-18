// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Exercises the whole feature-extension mechanism: a main database (which only
// `imports` the assign *schema*) is extended at runtime with the feature's full
// plugin — exactly what a lazily-loaded feature element does on connect — and
// then the two indexes are checked for correct many-to-many navigation.
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import type { User } from "../data/user/user.js";
import { ActionDatabase } from "../../main/ecs/action-database.js";
import { ComputedDatabase } from "./computed-database.js";

// main DB + lazy feature extend (the runtime shape a feature element produces).
const createDb = () =>
  Database.create(ActionDatabase.plugin).extend(ComputedDatabase.plugin);

const readUsers = (db: ReturnType<typeof createDb>): readonly User[] => {
  let value: readonly User[] = [];
  const unsub = db.computed.users((v) => { value = v; });
  unsub?.();
  return value;
};

describe("assign feature: indexes + many-to-many", () => {
  it("navigates todo↔user both ways through the indexes", () => {
    const db = createDb();
    db.transactions.addUser({ name: "ada" });
    db.transactions.addUser({ name: "linus" });
    const t1 = db.transactions.createTodo({ name: "ship" });
    const t2 = db.transactions.createTodo({ name: "review" });

    db.transactions.assignUser({ todo: t1, name: "ada" });
    db.transactions.assignUser({ todo: t1, name: "linus" });
    db.transactions.assignUser({ todo: t2, name: "ada" });

    // user → todos (multi-value index over the assignees array)
    expect([...db.indexes.todosByAssignee.find({ assignees: "ada" })].sort())
      .toEqual([t1, t2].sort());
    expect(db.indexes.todosByAssignee.find({ assignees: "linus" })).toEqual([t1]);

    // todo → user (unique index resolves an assignee name to its user entity)
    expect(db.indexes.usersByName.get({ name: "ada" })).not.toBeNull();
    expect(db.indexes.usersByName.get({ name: "nobody" })).toBeNull();

    // unassign is reflected in the index immediately
    db.transactions.unassignUser({ todo: t1, name: "ada" });
    expect(db.indexes.todosByAssignee.find({ assignees: "ada" })).toEqual([t2]);
  });

  it("shares one computation across multiple subscribers (withCache)", () => {
    const db = createDb();
    db.transactions.addUser({ name: "ada" });

    let a: readonly User[] | undefined;
    let b: readonly User[] | undefined;
    const unsubA = db.computed.users((v) => { a = v; });
    const unsubB = db.computed.users((v) => { b = v; });

    // With withCache the second subscriber receives the SAME array instance the
    // first computed — a single shared db.derive run. Without it, each subscriber
    // triggers its own run and gets a distinct (equal but not identical) array.
    expect(a).toBe(b);

    unsubA?.();
    unsubB?.();
  });

  it("keeps user names unique via the unique index", () => {
    const db = createDb();
    db.transactions.addUser({ name: "ada" });
    db.transactions.addUser({ name: "ada" }); // duplicate — silently ignored
    expect(readUsers(db).filter((u) => u.name === "ada")).toHaveLength(1);
  });

  it("the assignee name index scopes to users, not todos that share a name", () => {
    const db = createDb();
    // a todo and a user with the same name must not collide in usersByName
    db.transactions.createTodo({ name: "ada" });
    db.transactions.addUser({ name: "ada" });
    expect(db.indexes.usersByName.get({ name: "ada" })).not.toBeNull();
  });
});
