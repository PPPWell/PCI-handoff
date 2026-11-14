"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function LiveVoucherRefresh() {
  const router=useRouter();
  useEffect(()=>{
    let last=0;
    // Returning to the app fires focus and visibilitychange together; one full page refresh is enough.
    const refresh=()=>{const now=Date.now();if(navigator.onLine&&document.visibilityState==="visible"&&now-last>3000){last=now;router.refresh();}};
    const timer=setInterval(refresh,30000);window.addEventListener("pci:voucher-changed",refresh);window.addEventListener("online",refresh);window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    return ()=>{clearInterval(timer);window.removeEventListener("pci:voucher-changed",refresh);window.removeEventListener("online",refresh);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[router]);return null;
}
