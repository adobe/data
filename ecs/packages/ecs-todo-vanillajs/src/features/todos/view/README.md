# view

Todos on the page: rows in its list, and runs for its events.

- `todosPlugin` defines the todos' elements and turns their events into runs of the model's systems; an event from a
  row names its todo through `entityOf`. When the list's range changes as it scrolls, it runs `renderRows`, and once
  disconnected it empties the list.
- The list is a `<virtual-list>`: `renderRows` gives it the todos it shows, in list order, in the range it needs,
  binding only the rows it gives todos that entered, and `bindRows` writes what changed of a todo to its row, where it
  has one. The todos it shows are those whose `done` is `onlyDone`, every todo while that's null.
- `todosResources` finds the page's list, `list`, which the systems wait for.
