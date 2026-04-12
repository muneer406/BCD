import type { ReactNode } from "react";

interface SimpleModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function SimpleModal({ open, onClose, children }: SimpleModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full relative animate-fade-in">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-ink-500 hover:text-ink-900 text-lg font-bold"
          aria-label="Close"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
