import { useState } from "react";

interface ImageModalProps {
  src: string;
  alt: string;
  children: React.ReactNode;
}

export function ImageModal({ src, alt, children }: ImageModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div
        className="cursor-pointer transition-transform hover:scale-105"
        onClick={() => setIsOpen(true)}
      >
        {children}
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-3xl rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 rounded-full bg-ink-900 p-2 text-white hover:bg-ink-800"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <img
              src={src}
              alt={alt}
              className="h-full w-full rounded-3xl object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
