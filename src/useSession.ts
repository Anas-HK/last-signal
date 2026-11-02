import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, Snapshot } from "../shared/types";
export type Config = {
  configured: boolean;
  operatorKey: string;
  redirectUri: string;
  appUrl: string;
};
export function useSession(spectator: boolean) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [notice, setNotice] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const pending = useRef<
    Partial<Record<"simulation" | "autopilot", { value: boolean; at: number }>>
  >({});
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let retries = 0;
    const connect = async () => {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) throw new Error("The mission server is unavailable.");
        const cfg = (await response.json()) as Config;
        if (cancelled) return;
        setConfig(cfg);
        const ws = new WebSocket(
          `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws${spectator ? "" : `?key=${encodeURIComponent(cfg.operatorKey)}`}`,
        );
        socket.current = ws;
        ws.onopen = () => {
          if (cancelled) {
            ws.close();
            return;
          }
          retries = 0;
          setConnected(true);
        };
        ws.onmessage = (event) => {
          if (cancelled) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === "state") {
              for (const key of ["simulation", "autopilot"] as const) {
                const p = pending.current[key];
                if (!p) continue;
                if (data.game[key] === p.value || Date.now() - p.at > 1500)
                  delete pending.current[key];
                else data.game[key] = p.value;
              }
              setState(data);
            } else if (data.type === "notice") setNotice(data.text);
          } catch {
            /* Ignore a malformed transport frame; next snapshot recovers. */
          }
        };
        ws.onclose = () => {
          if (cancelled) return;
          setConnected(false);
          timer = setTimeout(connect, Math.min(8000, 1000 * 2 ** retries++));
        };
        ws.onerror = () => ws.close();
      } catch {
        if (!cancelled) {
          setConnected(false);
          timer = setTimeout(connect, Math.min(8000, 1000 * 2 ** retries++));
        }
      }
    };
    void connect();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      socket.current?.close();
    };
  }, [spectator]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const send = useCallback((message: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      if (
        message.type === "action" &&
        (message.action === "simulation" || message.action === "autopilot")
      ) {
        const key = message.action,
          value = Boolean(message.value);
        pending.current[key] = { value, at: Date.now() };
        setState((previous) =>
          previous
            ? { ...previous, game: { ...previous.game, [key]: value } }
            : previous,
        );
      }
      if (message.type === "action" && message.action === "reset")
        pending.current = {};
      socket.current.send(JSON.stringify(message));
    } else setNotice("Mission server disconnected. Reconnecting…");
  }, []);
  const post = useCallback(
    async (path: string, body: unknown = {}) => {
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Operator-Key": config?.operatorKey || "",
          },
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Request failed.");
        return true;
      } catch (e) {
        setNotice(
          e instanceof Error
            ? e.message
            : "Could not reach the mission server.",
        );
        return false;
      }
    },
    [config],
  );
  return { state, connected, config, notice, setNotice, send, post };
}
