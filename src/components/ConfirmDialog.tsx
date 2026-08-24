import Modal from "./Modal";

interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel} maxWidthClass="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-700">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border px-3 py-2 text-sm">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded px-4 py-2 text-sm text-white ${
              danger ? "bg-red-600" : "bg-blue-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
