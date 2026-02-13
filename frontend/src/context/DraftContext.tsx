import { createContext, useContext, useMemo, useState } from "react";

export type CaptureImage = {
  type: string;
  label: string;
  file: File;
  previewUrl: string;
};

type DraftContextValue = {
  images: CaptureImage[];
  setImage: (image: CaptureImage) => void;
  removeImage: (type: string) => void;
  clearDraft: () => void;
};

const DraftContext = createContext<DraftContextValue | undefined>(undefined);

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [images, setImages] = useState<CaptureImage[]>([]);

  const setImage = (image: CaptureImage) => {
    setImages((prev) => {
      const existing = prev.find((entry) => entry.type === image.type);
      if (existing) {
        URL.revokeObjectURL(existing.previewUrl);
      }
      const next = prev.filter((entry) => entry.type !== image.type);
      return [...next, image];
    });
  };

  const removeImage = (type: string) => {
    setImages((prev) => {
      const target = prev.find((entry) => entry.type === type);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((entry) => entry.type !== type);
    });
  };

  const clearDraft = () => {
    setImages((prev) => {
      prev.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
      return [];
    });
  };

  const value = useMemo(
    () => ({ images, setImage, removeImage, clearDraft }),
    [images],
  );

  return (
    <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
  );
}

export function useDraft() {
  const context = useContext(DraftContext);
  if (!context) {
    throw new Error("useDraft must be used within DraftProvider");
  }
  return context;
}
