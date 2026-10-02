import { useEffect, useState } from "react";
import { type AppConfig, configAPI } from "../services/api";

// Öffentliche Server-Konfiguration (/api/config), einmal pro Seitenaufruf
// geladen und zwischen allen Komponenten geteilt.
let cached: Promise<AppConfig | null> | null = null;

function loadConfig() {
  if (!cached) {
    cached = configAPI
      .get()
      .then(({ data }) => data)
      .catch(() => {
        cached = null;
        return null;
      });
  }
  return cached;
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    loadConfig().then((data) => {
      if (active) {
        setConfig(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return { config, loading };
}
