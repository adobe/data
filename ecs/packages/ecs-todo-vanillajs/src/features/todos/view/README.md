# view

Todos on the page: rows in its list, and runs for its events.

- `todosPlugin` defines the todos' elements and turns their events into runs of the model's systems; an event from a
  row names its todo through `entityOf`.
- Its systems make a row for each new todo (`createRows`), write what changed of a todo to its row (`bindRows`) and
  place new and moved rows in list order (`placeRows`). A removed system, `removeRows`, removes a row when its todo
  goes; it's listed with `createRows`, which makes the rows it removes.
- `todosResources` finds the page's list, `list`, which the systems wait for.
