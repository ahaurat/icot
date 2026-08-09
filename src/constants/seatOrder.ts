// Default seat order for the shared seating layout.
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
// Desks are row-major seatIndex values on a 6x6 grid. DEFAULT_SEAT_ORDER maps a
// student's position in an uploaded list (0-based) to the seatIndex of "seat 1, 2,
// 3, …". This is the default; the in-app editor makes it editable and persisted.
import type { SeatLayout } from "../types";

export const DEFAULT_SEAT_ORDER: number[] = [
  32, 26, 20, 14, 8, 2, // seats 1–6   (column C, bottom→top)
  33, 27, 21, 15, 9, 3, // seats 7–12  (column E, bottom→top)
  34, 28, 22, 16, 10, 4, // seats 13–18 (column F, bottom→top)
  35, 29, 23, 17, 11, 5, // seats 19–24 (column G, bottom→top)
  31, 25, 30, 24, 19, 18, // seats 25–30 (columns B/A, teacher's order)
  13, 7, 12, 6, 1, 0, // seats 31–36 (columns B/A, teacher's order)
];

export const DEFAULT_SEAT_LAYOUT: SeatLayout = {
  rows: 6,
  cols: 6,
  seatOrder: DEFAULT_SEAT_ORDER,
};
