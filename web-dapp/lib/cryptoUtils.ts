"use client";

const ITERATIONS = 600000;
const KEY_LENGTH = 256;

// Convert string to Uint8Array
function strToBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Convert Uint8Array to string
function bufferToStr(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

// Convert base64 to ArrayBuffer
function base64ToBuffer(b64: string): ArrayBuffer {
  const binStr = atob(b64);
  const arr = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    arr[i] = binStr.charCodeAt(i);
  }
  return arr.buffer;
}

// Convert ArrayBuffer to base64
function bufferToBase64(buffer: ArrayBuffer): string {
  let binStr = "";
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < arr.byteLength; i++) {
    binStr += String.fromCharCode(arr[i]);
  }
  return btoa(binStr);
}

/**
 * Derives a strong 256-bit AES-GCM key from a short PIN using PBKDF2 with 600,000 iterations.
 */
async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    strToBuffer(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a string of data using AES-GCM and a PIN.
 * Returns a base64 encoded string format: "salt:iv:ciphertext"
 */
export async function encryptSessionData(data: string, pin: string): Promise<string> {
  if (typeof window === "undefined") throw new Error("Encryption only available on client");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const key = await deriveKey(pin, salt);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    strToBuffer(data)
  );

  return [
    bufferToBase64(salt),
    bufferToBase64(iv),
    bufferToBase64(encrypted)
  ].join(":");
}

/**
 * Decrypts a base64 encoded string format "salt:iv:ciphertext" back into the original data string using the PIN.
 */
export async function decryptSessionData(encryptedBlob: string, pin: string): Promise<string> {
  if (typeof window === "undefined") throw new Error("Decryption only available on client");

  const parts = encryptedBlob.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted blob format");
  }

  const salt = new Uint8Array(base64ToBuffer(parts[0]));
  const iv = new Uint8Array(base64ToBuffer(parts[1]));
  const ciphertext = base64ToBuffer(parts[2]);

  const key = await deriveKey(pin, salt);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return bufferToStr(decrypted);
}
