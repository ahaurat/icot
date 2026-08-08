import { useEffect, type ReactNode } from "react";

interface ModalProps {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
}

export default function Modal({ title, onClose, children, maxWidthClass = "max-w-lg" }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4"
      onClick={onClose}
    >
      <div
        className={`mt-12 w-full ${maxWidthClass} rounded-lg bg-white p-5 shadow-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="text-xl font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 cursor-pointer p-1 text-lg text-gray-500 hover:text-gray-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
