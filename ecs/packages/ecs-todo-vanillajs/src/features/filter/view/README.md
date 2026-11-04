# view

The filter on the page: its buttons, and the rows it hides.

`filterPlugin` defines `<todo-filters>` and runs `setFilter` for its events. `filterRows` hides each row the filter
leaves out, as its todo or the filter changes, moving focus off it, and `bindFilters` shows the filter on the
buttons, which `filterResources` finds on the page.
