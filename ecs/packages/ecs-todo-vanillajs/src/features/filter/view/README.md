# view

The filter on the page: its buttons, and which todos are listed.

`filterPlugin` defines `<todo-filters>` and runs `setFilter` for its events. `filterRows` has the todos' list show only
the todos the filter keeps, through `onlyDone`, as the filter changes, and `bindFilters` shows the filter on the
buttons, which `filterResources` finds on the page.
