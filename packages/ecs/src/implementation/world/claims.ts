import { lineWords } from './protocol.js';

/**
 * Pieces of a claimed split, as a home range per participant: one Int32 per participant, each on its own cache line,
 * holding its next piece (`front`, low 16 bits) and the end of its range (`back`, high 16 bits). An owner takes pieces
 * from its front, in order, so it streams forward through rows it ran last tier; a participant whose range is empty
 * steals from the back of the fullest other range, so owner and thief meet only at the end. Every change is one
 * compare-and-swap of the whole word, so a piece is claimed exactly once.
 */

/** Split pieces into at most 32767, so a range's bounds fit its word. */
export const maximumPieces = 0x7fff;

const rangeWord = (front: number, back: number): number => (back << 16) | front;

/** Gives each of `participants` an equal home range of `pieces`, in order. */
export const startRanges = (words: Int32Array, participants: number, pieces: number): void => {
    for (let i = 0; i < participants; i++) {
        Atomics.store(words, i * lineWords, rangeWord(Math.floor(i * pieces / participants), Math.floor((i + 1) * pieces / participants)));
    }
};

/** Claims the next piece for participant `self`: its own front, else the back of the fullest other range; -1 once none are left. */
export const claimPiece = (words: Int32Array, self: number, participants: number): number => {
    for (;;) {
        const own = Atomics.load(words, self * lineWords);
        const front = own & 0xffff;
        const back = own >>> 16;
        if (front < back) {
            if (Atomics.compareExchange(words, self * lineWords, own, rangeWord(front + 1, back)) === own) return front;
            continue;
        }
        let victim = -1;
        let most = 0;
        let word = 0;
        for (let i = 0; i < participants; i++) {
            if (i === self) continue;
            const other = Atomics.load(words, i * lineWords);
            const left = (other >>> 16) - (other & 0xffff);
            if (left > most) {
                most = left;
                victim = i;
                word = other;
            }
        }
        if (victim < 0) return -1;
        const last = (word >>> 16) - 1;
        if (Atomics.compareExchange(words, victim * lineWords, word, rangeWord(word & 0xffff, last)) === word) return last;
    }
};
