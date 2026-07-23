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
      toastOptions={{
        style: {
          background: 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
          border: '1px solid rgba(255, 255, 255, 0.9)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.4)',
          borderRight: '1px solid rgba(255, 255, 255, 0.4)',
          color: '#0f172a',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 1)',
          borderRadius: '100px',
          padding: '16px 28px',
          fontWeight: '600',
          fontSize: '15px',
          letterSpacing: '-0.01em',
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
