import { useState, useEffect } from "react";

export interface DuplicateReport {
  id: string;
  category: string;
  description: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  status?: number;
  createdAt?: number;
  imageUrl?: string;
}

export function useDuplicateChecker(
  category: string,
  location: { lat: number; lng: number } | null
) {
  const [duplicates, setDuplicates] = useState<DuplicateReport[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!location || !category) {
      setDuplicates([]);
      return;
    }

    let isMounted = true;
    setIsChecking(true);

    const checkDuplicates = async () => {
      try {
        const res = await fetch("/api/reports/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            lat: location.lat,
            lng: location.lng,
          }),
        });

        if (!res.ok) {
          if (isMounted) setIsChecking(false);
          return;
        }

        const data = await res.json();
        if (isMounted && data.success) {
          setDuplicates(data.duplicates || []);
        }
      } catch (error) {
        console.error("Failed to check duplicates:", error);
      } finally {
        if (isMounted) setIsChecking(false);
      }
    };

    // Small debounce (300ms) when location or category changes
    const timer = setTimeout(checkDuplicates, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [category, location?.lat, location?.lng]);

  return { duplicates, setDuplicates, isChecking };
}
