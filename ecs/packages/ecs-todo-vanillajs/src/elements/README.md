# elements

The app's foundation of elements: a scrolling list keeping only the rows near the view in the DOM.

`<virtual-list>` shows `count` items of `itemHeight` pixels, the rows in view and half a screen's height more above and
below (`overscan`). It knows nothing of what its items are: `range` names the items it needs, `virtual-range` says when
scrolling or resizing changed it, and its owner calls `render(start, keys, bind, keep)` with their keys.

- A row keeps the key it shows while that key stays in the range, and is moved, absolutely positioned, only when its
  index changes; `bind` is called only for a row given a new key. Scrolling down reuses the rows from the top for the
  keys entering at the bottom, and the other way up, so their DOM order isn't the list's: `indexOf` and `elementAt`
  map between rows and items.
- `elementOf(key)` finds the row showing a key, for its owner to write what changed of it.
- The focused row stays when its key leaves the range while `keep` gives the index its key is at, as it scrolls out of
  view; when `keep` gives -1, its key gone, the row now at its index, or else the one before, takes the focus.
