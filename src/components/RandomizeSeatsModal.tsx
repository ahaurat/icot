import { useAppStore } from "../state/useAppStore";
import Modal from "./Modal";

export default function RandomizeSeatsModal({
  classId,
  onClose,
}: {
  classId: string;
  onClose: () => void;
}) {
  const randomizeSeats = useAppStore((s) => s.randomizeSeats);

  function handle(mode: "save" | "temporary") {
    randomizeSeats(classId, mode);
    onClose();
  }

  return (
    <Modal title="Randomize seats" onClose={onClose} maxWidthClass="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          Shuffle where currently-seated students sit. Choose whether this becomes the new
          main chart, or stays until you clear it.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => handle("save")}
            className="rounded bg-blue-500 px-4 py-2 text-sm text-white"
          >
            Save as new main chart
          </button>
          <button
            type="button"
            onClick={() => handle("temporary")}
            className="rounded border px-4 py-2 text-sm"
          >
            Just temporarily
          </button>
        </div>
      </div>
    </Modal>
  );
}
