# model

Undo and redo of the voxels, instances and the selection. It knows nothing of the edits that change them: `historyModel` records,
on the tick after a change, the state before it as a step, by comparing snapshots of every model's size, every voxel (its cell, material
and parent) and every selected face (its cell and side). Changes to the selection alone, one after another, make one
step, so a drag over many ticks is undone at once; a change to the voxels is always a step of its own. A new change
leaves nothing to redo, and at most 200 steps are kept.

`undo` and `redo` put the state they step to in place of the voxels and faces there now, and remember it as the last
recorded, so restoring isn't recorded as a change. `history` holds the steps, replaced whenever they change, so a
view can bind it only after a pass that changed it, to show whether there
is anything to undo or redo.
