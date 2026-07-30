"use client";

import React, { useState, useEffect } from 'react';
import { useCitizen } from '@/context/CitizenContext';
import { Lock, Delete, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter, useSearchParams } from 'next/navigation';

export function PinScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEmbed =
    searchParams?.get("embed") === "true" ||
    (typeof window !== "undefined" && window.self !== window.top);
  const { isLocked, isSettingPin, setupLock, unlockSession, logout } = useCitizen();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset state if mode changes
  useEffect(() => {
    setPin("");
    setConfirmPin("");
    setStep("enter");
    setIsProcessing(false);
  }, [isLocked, isSettingPin]);

  if (isEmbed || (!isLocked && !isSettingPin)) return null;

  const mode = isSettingPin ? "setup" : "unlock";

  const handleKeyPress = (num: string) => {
    if (isProcessing) return;
    
    if (step === "enter" && pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) {
        handlePinComplete(newPin, "enter");
      }
    } else if (step === "confirm" && confirmPin.length < 4) {
      const newPin = confirmPin + num;
      setConfirmPin(newPin);
      if (newPin.length === 4) {
        handlePinComplete(newPin, "confirm");
      }
    }
  };

  const handleDelete = () => {
    if (isProcessing) return;
    if (step === "enter") setPin(pin.slice(0, -1));
    else setConfirmPin(confirmPin.slice(0, -1));
  };

  const handlePinComplete = async (completedPin: string, currentStep: "enter" | "confirm") => {
    if (mode === "unlock") {
      setIsProcessing(true);
      const success = await unlockSession(completedPin);
      if (!success) {
        toast.error("Incorrect PIN");
        setPin("");
        setIsProcessing(false);
      } else {
        toast.success("Session unlocked");
      }
    } else if (mode === "setup") {
      if (currentStep === "enter") {
        setTimeout(() => setStep("confirm"), 300);
      } else {
        if (pin === completedPin) {
          setIsProcessing(true);
          try {
            await setupLock(pin);
            toast.success("PIN set successfully");
          } catch (e) {
            toast.error("Failed to secure session");
            setPin("");
            setConfirmPin("");
            setStep("enter");
            setIsProcessing(false);
          }
        } else {
          toast.error("PINs do not match");
          setConfirmPin("");
        }
      }
    }
  };

  const handleForgotPin = () => {
    logout();
    router.push("/login"); // or auth, but let's push to /login since we found app/login/page.tsx
  };

  const displayPin = step === "enter" ? pin : confirmPin;
  
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-md px-3 py-4">
      <div className="bg-white/95 border border-white/50 shadow-2xl rounded-3xl p-5 sm:p-8 w-full max-w-[340px] sm:max-w-sm text-center flex flex-col items-center max-h-[90vh] overflow-y-auto">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 sm:mb-6 shadow-sm shrink-0">
          <Lock className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
        </div>
        
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1 sm:mb-2">
          {mode === "setup" 
            ? (step === "enter" ? "Create PIN" : "Confirm PIN") 
            : "Unlock Session"}
        </h2>
        <p className="text-slate-500 text-xs sm:text-sm mb-4 sm:mb-8 px-2">
          {mode === "setup"
            ? "Create a 4-digit PIN and use it when a page refresh happens so you can restore your data."
            : "Enter the 4-digit PIN you set up to restore your session."}
        </p>

        {/* PIN Indicators */}
        <div className="flex gap-3 sm:gap-4 mb-5 sm:mb-8">
          {[0, 1, 2, 3].map(i => (
            <div 
              key={i} 
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 transition-all duration-200 ${
                displayPin.length > i 
                  ? "bg-blue-600 border-blue-600 scale-110" 
                  : "border-slate-300 bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:gap-x-6 sm:gap-y-4 mb-4 sm:mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handleKeyPress(num.toString())}
              disabled={isProcessing}
              className="w-13 h-13 sm:w-16 sm:h-16 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-xl sm:text-2xl font-semibold text-slate-800 transition-colors shadow-sm flex items-center justify-center"
            >
              {num}
            </button>
          ))}
          <div /> {/* Empty space */}
          <button
            onClick={() => handleKeyPress("0")}
            disabled={isProcessing}
            className="w-13 h-13 sm:w-16 sm:h-16 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-xl sm:text-2xl font-semibold text-slate-800 transition-colors shadow-sm flex items-center justify-center"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            disabled={isProcessing || displayPin.length === 0}
            className="w-13 h-13 sm:w-16 sm:h-16 rounded-full text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors flex items-center justify-center disabled:opacity-50"
          >
            <Delete className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Forgot PIN / Cancel */}
        {mode === "unlock" && (
          <button 
            onClick={handleForgotPin}
            className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-500 hover:text-red-600 transition-colors mt-1"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Forgot PIN? Login with GovID
          </button>
        )}
      </div>
    </div>
  );
}
