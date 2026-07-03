"use client";

import { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";

export function ClientToaster() {
  const [position, setPosition] = useState<"top-center" | "bottom-right">("top-center");

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setPosition("bottom-right");
      } else {
        setPosition("top-center");
      }
    };
    handleResize(); // Initial check
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return <Toaster position={position} />;
}
