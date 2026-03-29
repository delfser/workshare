"use client";

import { useEffect } from "react";

export function PwaInit() {
  useEffect(() => {
    const isLocalhost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const isProduction = process.env.NODE_ENV === "production";
    if (!isProduction && !isLocalhost) {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, []);

  return null;
}
