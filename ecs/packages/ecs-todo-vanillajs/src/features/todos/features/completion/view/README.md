# view

Completion on the page: its counts, toggle-all and clear.

`completionView`, its plugin, defines `<todo-summary>` and `<todo-toggle-all>` and runs `toggleAll` and `clearCompleted` for their
events. `bindCompletion` writes the counts, read off `byDoneInOrder`, only after a pass in which a todo was added, removed or
toggled. `findCompletion` finds the summary and the checkbox within the app's `root`.
