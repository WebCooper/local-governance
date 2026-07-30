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

  return (
    <Toaster 
      position={position} 
      containerStyle={{
        top: 16,
        bottom: 80,
        left: 16,
        right: 16,
      }}
      toastOptions={{
        style: {
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          color: '#0f172a',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          borderRadius: '20px',
          padding: '12px 20px',
          fontWeight: '600',
          fontSize: '14px',
          letterSpacing: '-0.01em',
          maxWidth: 'calc(100vw - 32px)',
          wordBreak: 'break-word',
        },
        success: {
          iconTheme: {
            primary: '#2563eb', // blue-600
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
        },
      }}
    />
  );
}
