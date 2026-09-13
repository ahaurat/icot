import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./useAppStore";

function seedOneStudent() {
  useAppStore.setState({
    classes: [{ id: "c1", name: "Period 1", seatRows: 5, seatCols: 6, archivedAt: null }],
    students: [
      {
        id: "s1",
        classId: "c1",
        firstName: "Alex",
        lastName: "Rivera",
        seatIndex: 0,
        active: true,
        groupColor: null,
      },
    ],
    events: [],
  });
}

describe("logDuration", () => {
  beforeEach(() => {
    seedOneStudent();
  });

  it("creates a closed timed event with the given duration", () => {
    useAppStore.getState().logDuration("s1", "tardy", 7);

    const events = useAppStore.getState().events;
    expect(events).toHaveLength(1);

    const e = events[0];
    expect(e.studentId).toBe("s1");
    expect(e.classId).toBe("c1");
    expect(e.categoryKey).toBe("tardy");
    expect(e.type).toBe("timed");
    expect(e.open).toBe(false);
    expect(e.durationSeconds).toBe(420);
    expect(e.endedAt).not.toBeNull();
    expect(new Date(e.endedAt!).getTime() - new Date(e.startedAt).getTime()).toBe(420_000);
  });

  it("does nothing for a count-type category", () => {
    useAppStore.getState().logDuration("s1", "cellphone", 5);
    expect(useAppStore.getState().events).toHaveLength(0);
  });

  it("does nothing for an unknown student", () => {
    useAppStore.getState().logDuration("does-not-exist", "tardy", 5);
    expect(useAppStore.getState().events).toHaveLength(0);
  });
});

describe("addStudent", () => {
  beforeEach(() => {
    useAppStore.setState({
      classes: [{ id: "c1", name: "Period 1", seatRows: 5, seatCols: 6, archivedAt: null }],
      students: [],
      events: [],
    });
  });

  it("stores first and last name separately", () => {
    useAppStore.getState().addStudent("c1", "Ada", "Lovelace", 0);
    const [student] = useAppStore.getState().students;
    expect(student.firstName).toBe("Ada");
    expect(student.lastName).toBe("Lovelace");
    expect(student.seatIndex).toBe(0);
  });
});

describe("renameStudent", () => {
  beforeEach(() => {
    seedOneStudent();
  });

  it("updates first and last name independently", () => {
    useAppStore.getState().renameStudent("s1", "Alexis", "Rivera");
    const student = useAppStore.getState().students.find((s) => s.id === "s1")!;
    expect(student.firstName).toBe("Alexis");
    expect(student.lastName).toBe("Rivera");
  });
});
