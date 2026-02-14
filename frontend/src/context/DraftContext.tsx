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
    // Add new image without removing previous ones of the same type
    setImages((prev) => [...prev, image]);
  };

  const removeImage = (type: string) => {
    // Remove only the LAST image of this type
    setImages((prev) => {
      let lastIndex = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].type === type) {
          lastIndex = i;
          break;
        }
      }
      if (lastIndex === -1) return prev;

      const target = prev[lastIndex];
      URL.revokeObjectURL(target.previewUrl);

      return prev.filter((_, i) => i !== lastIndex);
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
