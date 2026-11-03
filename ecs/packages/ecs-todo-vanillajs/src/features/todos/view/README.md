# view

Todos on the page: rows in its list, and runs for its events.

- `todosPlugin` defines the todos' elements and turns their events into runs of the model's systems; an event from a
  row names its todo through `entityOf`.
- Its systems make a row for each new todo (`createRows`), write what changed of a todo to its row (`bindRows`) and
  place new and moved rows in list order (`placeRows`). A finalizer on `row` removes a row when its todo goes.
- `todosResources` finds the page's list, `list`, which the systems wait for.
