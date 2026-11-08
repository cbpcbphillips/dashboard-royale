"use client";

import { useEffect } from "react";

/** Opens the collapsed claim a link points at (#C18) and scrolls to it, on load and whenever the hash changes. */
export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      const d = el?.querySelector("details") ?? (el?.tagName === "DETAILS" ? el : null);
      if (d && !(d as HTMLDetailsElement).open) {
        (d as HTMLDetailsElement).open = true;
        el?.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
