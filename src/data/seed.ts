import type { AppData, ClassRoom, Student } from "../types";
import { seatIndexForPosition } from "../constants/seatOrder";
import { newId } from "../utils/id";
import { defaultSchoolYearStart } from "../utils/time";

// A small, entirely fictional demo class so the app looks alive on first run.
// Teachers replace this with their own students via Settings → Roster upload
// (or Manage roster). No real student data ships in this repo.
const DEMO_CLASS = "Period 1";
const DEMO_STUDENTS = [
  "Ada Lovelace",
  "Alan Turing",
  "Grace Hopper",
  "Katherine Johnson",
  "Rosalind Franklin",
  "Charles Babbage",
  "Marie Curie",
  "Nikola Tesla",
  "Hedy Lamarr",
  "Claude Shannon",
  "Dorothy Vaughan",
  "George Boole",
];

/** Build the initial AppData (used the first time the app runs with empty storage). */
export function buildSeedData(): AppData {
  const classId = "period-1";
  const classes: ClassRoom[] = [
    { id: classId, name: DEMO_CLASS, seatRows: 6, seatCols: 6, archivedAt: null },
  ];

  // Seat the demo students along the custom seat order (seat 1, 2, 3, …).
  const students: Student[] = DEMO_STUDENTS.map((name, i) => ({
    id: newId(),
    classId,
    name,
    seatIndex: seatIndexForPosition(i),
    active: true,
  }));

  return {
    classes,
    students,
    events: [],
    settings: { schoolYearStart: defaultSchoolYearStart() },
  };
}
