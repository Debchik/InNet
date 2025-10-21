// components/QRScanner.tsx
"use client";
import { useEffect, useRef } from "react";


export type QRScannerProps = {
onScan: (decodedText: string) => void;
onError?: (error: unknown) => void;
};


export default function QRScanner({ onScan, onError }: QRScannerProps) {
const startedRef = useRef(false);


useEffect(() => {
let qr: any;
let isMounted = true;


const start = async () => {
if (startedRef.current) return;
if (typeof window === "undefined") return;
if (!navigator?.mediaDevices?.getUserMedia) {
onError?.(new Error("getUserMedia недоступен. Нужен браузер с поддержкой камеры и HTTPS."));
return;
}


startedRef.current = true;
try {
const mod = await import("html5-qrcode");
const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod as unknown as {
Html5Qrcode: new (elementId: string) => any;
Html5QrcodeSupportedFormats: Record<string, number>;
};


if (!Html5Qrcode) throw new Error("Html5Qrcode не найден в модуле html5-qrcode");


qr = new Html5Qrcode("reader");
await qr.start(
{ facingMode: "environment" },
{ fps: 10, qrbox: 240, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] },
(decoded: string) => isMounted && onScan(decoded),
(err: unknown) => isMounted && onError?.(err)
);
} catch (e) {
onError?.(e);
}
};


start();


return () => {
isMounted = false;
if (qr) {
qr.stop().then(() => qr.clear()).catch(() => {});
}
};
}, [onScan, onError]);


return <div id="reader" className="w-full max-w-xs bg-gray-800 p-4 rounded-lg shadow" />;
}