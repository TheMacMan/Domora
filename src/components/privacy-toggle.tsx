"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "vermietie:privacy";

export function PrivacyToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(false);

  // Initial: aus localStorage lesen und auf <html> anwenden
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) === "on";
    setOn(stored);
    document.documentElement.dataset.privacy = stored ? "on" : "off";
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    document.documentElement.dataset.privacy = next ? "on" : "off";
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={on ? "Personenbezogene Daten anzeigen" : "Personenbezogene Daten ausblenden"}
      aria-label={on ? "Personenbezogene Daten anzeigen" : "Personenbezogene Daten ausblenden"}
      aria-pressed={on}
      className={cn("size-9", className)}
    >
      {on ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4 text-muted-foreground" />}
    </Button>
  );
}
