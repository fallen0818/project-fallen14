"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const el = document.documentElement;
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore storage errors (private mode etc.)
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-secondary"
      style={{ width: "100%", justifyContent: "center", padding: "0.5rem", marginBottom: "0.5rem" }}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? "☀  Light mode" : "☾  Dark mode"}
    </button>
  );
}
