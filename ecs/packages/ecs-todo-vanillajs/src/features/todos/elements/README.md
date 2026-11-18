# elements

The todos' elements: the entry, the list and its rows.

They take properties and dispatch DOM events, and never change a property their owner writes: a checkbox click
dispatches `todo-toggle` and leaves the row's `done` until the world writes it back. `<todo-list>` is a
`<virtual-list>` of `<todo-row>`s, all one height, and dispatches `todo-move` for a row dragged or moved by keyboard.
