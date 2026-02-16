import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
} from "react";

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

  const setImage = useCallback((image: CaptureImage) => {
    // Add new image without removing previous ones of the same type
    setImages((prev) => [...prev, image]);
  }, []);

  const removeImage = useCallback((type: string) => {
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
      // Properly clean up the object URL
      try {
        URL.revokeObjectURL(target.previewUrl);
      } catch {
        // Cleanup failure is non-critical
      }

      return prev.filter((_, i) => i !== lastIndex);
    });
  }, []);

  const clearDraft = useCallback(() => {
    setImages((prev) => {
      prev.forEach((entry) => {
        try {
          URL.revokeObjectURL(entry.previewUrl);
        } catch {
          // Cleanup failure is non-critical
        }
      });
      return [];
    });
  }, []);

  const value = useMemo(
    () => ({ images, setImage, removeImage, clearDraft }),
    [images, setImage, removeImage, clearDraft],
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
