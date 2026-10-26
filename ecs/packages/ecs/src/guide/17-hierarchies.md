# Hierarchies

A hierarchy is entities pointing at their parent through a reference, here `reference: "owner"`, so a child is
despawned with its parent.

`up: { through: parent }` runs a system's rows parent first, so each row reads its parent's values as the same run
left them. The body's `up` holds what it reads of the parent, or `null` for a row without one.
[`place`](17-hierarchies.ts#L19-L21) adds each offset to its parent's place, so the cup, on the tray, on the table, is
at 13 after one run.

A system with `up` can't also have `order`: both decide the order of its rows.
