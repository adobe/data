# view

The toolbar's undo and redo buttons: `historyView` finds `[data-history="undo"]` and `[data-history="redo"]` within the
app's root, runs `undo` or `redo` as one is clicked, and disables each while there's nothing to undo or redo.
