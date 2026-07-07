import { useEffect, useState } from "react";

// small hook for the dark mode toggle. the actual class flip happens on
// <html> so Tailwind's dark: variants work everywhere.
// _document.tsx has a matching inline script that sets the class before
// React loads, otherwise you get a white flash on refresh in dark mode
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("novabank_theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (stored === "dark" || (!stored && prefersDark)) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // localStorage only gets written when the user actually flips the switch,
  // not on load - writing it on load kept overwriting the saved choice
  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem("novabank_theme", next);
      return next;
    });
  }

  return { theme, toggleTheme };
}
