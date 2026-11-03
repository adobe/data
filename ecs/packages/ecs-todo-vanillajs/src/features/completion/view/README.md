# view

Completion on the page: its counts, toggle-all and clear.

`completionPlugin` defines `<todo-summary>` and `<todo-toggle-all>` and runs `toggleAll` and `clearCompleted` for their
events. `bindCompletion` writes the counts, read off `byDone`, only after a pass in which a todo was added, removed or
toggled. `completionResources` finds the summary and the checkbox on the page.
