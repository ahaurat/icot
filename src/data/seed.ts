import type { AppData, ClassRoom, Student } from "../types";
import { DEFAULT_SEAT_LAYOUT } from "../constants/seatOrder";
import { placementForLayout } from "../utils/seatLayout";
import { newId } from "../utils/id";
import { withSettingsDefaults } from "./store";

// A small, entirely fictional demo class so the app looks alive on first run.
// Teachers replace this with their own students via Settings → Roster upload
// (or Manage roster). No real student data ships in this repo.
const DEMO_CLASS = "Period 1";
const DEMO_STUDENTS = [
  { firstName: "Ada", lastName: "Lovelace" },
  { firstName: "Alan", lastName: "Turing" },
  { firstName: "Grace", lastName: "Hopper" },
  { firstName: "Katherine", lastName: "Johnson" },
  { firstName: "Rosalind", lastName: "Franklin" },
  { firstName: "Charles", lastName: "Babbage" },
  { firstName: "Marie", lastName: "Curie" },
  { firstName: "Nikola", lastName: "Tesla" },
  { firstName: "Hedy", lastName: "Lamarr" },
  { firstName: "Claude", lastName: "Shannon" },
  { firstName: "Dorothy", lastName: "Vaughan" },
  { firstName: "George", lastName: "Boole" },
];

/** Build the initial AppData (used the first time the app runs with empty storage). */
export function buildSeedData(): AppData {
  const classId = newId();
  const classes: ClassRoom[] = [
    { id: classId, name: DEMO_CLASS, seatRows: 6, seatCols: 6, archivedAt: null },
  ];

  // Seat the demo students along the default seat order (seat 1, 2, 3, …).
  const placement = placementForLayout(DEFAULT_SEAT_LAYOUT, DEMO_STUDENTS.length);
  const students: Student[] = DEMO_STUDENTS.map(({ firstName, lastName }, i) => ({
    id: newId(),
    classId,
    firstName,
    lastName,
    seatIndex: placement[i],
    active: true,
  }));

  return {
    classes,
    students,
    events: [],
    settings: withSettingsDefaults(null),
  };
}
