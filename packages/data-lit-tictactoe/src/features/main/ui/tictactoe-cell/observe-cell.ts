// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "@adobe/data/observe";
import type { UIService } from "@adobe/data/service";
import { BoardCell } from "../../data/board-cell/board-cell.js";
import { GameStatus } from "../../data/game-status/game-status.js";
import type { ComputedDatabase } from "../../ecs/computed-database/computed-database.js";

// Reactive per-cell view. The mark is looked up through the `byCell` index —
// the cell binds to whichever entity occupies its board position — while
// winning-line membership and playability come from the game-level computeds.
export const observeCell = (
  db: UIService.FromService<ComputedDatabase>,
  index: number,
) =>
  Observe.withMap(
    Observe.fromProperties({
      occupants: Observe.fromKeys(
        db.indexes.byCell.observe({ index }),
        (id) => db.observe.entity(id),
      ),
      winningLine: db.computed.winningLine,
      status: db.computed.status,
    }),
    ({ occupants, winningLine, status }) => {
      const cell: BoardCell = occupants[0]?.mark ?? BoardCell.blank;
      return {
        cell,
        isWinning: winningLine?.includes(index) ?? false,
        isPlayable: GameStatus.isActive(status) && cell === BoardCell.blank,
      };
    },
  );
