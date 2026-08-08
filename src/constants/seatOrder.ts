// Custom seat order for roster uploads.
//
// The teacher's room numbers seats bottom-to-top up each column, in this
// physical layout (aisle between the 3rd and 4th columns):
//
//    A    B    C  ‖   E    F    G
//   36   35    6  ‖  12   18   24
//   34   32    5  ‖  11   17   23
//   33   31    4  ‖  10   16   22
//   30   29    3  ‖   9   15   21
//   28   26    2  ‖   8   14   20
//   27   25    1  ‖   7   13   19
//
// The app stores desks as a row-major seatIndex on a 6x6 grid (columns
// A,B,C,E,F,G = indices 0..5; the aisle is visual only). SHARED_SEAT_ORDER maps
// a student's position in the uploaded list (0-based) to the row-major seatIndex
// of the desk that is "seat 1, 2, 3, …". So the 1st student on the list lands on
// seat 1 (bottom of column C = row-major index 32), the 2nd on seat 2, and so on.
//
// This is currently a single shared layout for every period. The in-app
// seat-order editor (separate feature) will make it editable and persisted.
export const SHARED_SEAT_ORDER: number[] = [
  32, 26, 20, 14, 8, 2, // seats 1–6   (column C, bottom→top)
  33, 27, 21, 15, 9, 3, // seats 7–12  (column E, bottom→top)
  34, 28, 22, 16, 10, 4, // seats 13–18 (column F, bottom→top)
  35, 29, 23, 17, 11, 5, // seats 19–24 (column G, bottom→top)
  31, 25, 30, 24, 19, 18, // seats 25–30 (columns B/A, teacher's order)
  13, 7, 12, 6, 1, 0, // seats 31–36 (columns B/A, teacher's order)
];

export const SEAT_ORDER_GRID_SIZE = 36;

/**
 * The row-major seatIndex for the Nth student (0-based) in an uploaded roster.
 * Beyond the 36 defined seats, falls back to sequential row-major placement.
 */
export function seatIndexForPosition(position: number): number {
  return position < SHARED_SEAT_ORDER.length ? SHARED_SEAT_ORDER[position] : position;
}
