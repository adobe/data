# view

The filter on the page: its buttons, and which todos are listed.

`filterView`, its plugin, defines `<todo-filters>` and runs `setFilter` for its events. `filterRows` has the todos' list show only
the todos the filter keeps, through `onlyDone`, as the filter changes, and `bindFilters` shows the filter on the
buttons, which `findFilters` finds within the app's `root`.
