import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  Flag,
  Flame,
  Package,
  Heart,
  Maximize2,
  Music,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Rocket,
  Satellite,
  Settings2,
  Shield,
  Signal,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import {
  COLORS,
  WORLD,
  type Command,
  type GameState,
  type Snapshot,
} from "../shared/types";
import { Space } from "./Space";
import { useSession } from "./useSession";
import {
  audioBlocked,
  audioPrefs,
  onAudioPrefs,
  setMusic,
  setMusicMode,
  setSound,
  unlockAudio,
} from "./audio";

/** One short line per event for the crew feed. */
function shortText(event: GameState["events"][number]) {
  if (event.type === "command")
    return event.command === "shield"
      ? "Shield +18"
      : event.command === "boost"
        ? "Boost"
        : "Repair +8";
  if (event.type === "join")
    return `Joined · ${event.text.split("· ")[1]?.replace(" station", "") ?? "crew"}`;
  if (event.type === "rejected") return event.text.split("· ")[1] ?? event.text;
  if (event.type === "sync") return "ALL HANDS pulse";
  if (event.type === "drop") return event.text.replace("sent a ", "Sent ");
  if (event.type === "meteor") return "Threw a meteor";
  if (event.type === "destroyed") return "Meteor shot down";
  if (event.type === "blocked") return "Impact blocked";
  if (event.type === "hit") return event.text.replace(" Crew, send !repair!", "");
  return event.text;
}
/** Briefly true after a value rises, to pulse the meter that changed. */
function useRise(value: number) {
  const previous = useRef(value);
  const [rise, setRise] = useState(0);
  useEffect(() => {
    if (value > previous.current + 0.5) setRise((n) => n + 1);
    previous.current = value;
  }, [value]);
  return rise;
}
function Station({ command, value }: { command: Command; value: number }) {
  const info = commandInfo[command];
  const Icon = info.icon;
  const rise = useRise(Math.round(value));
  return (
    <div
      className={`command-station ${command} ${value < 25 ? "is-low" : ""}`}
      style={{ "--station": COLORS[command] } as React.CSSProperties}
    >
      <div className="station-top">
        <span className="station-icon">
          <Icon size={18} />
        </span>
        <span className="station-name">{info.name}</span>
        <span className="station-value" key={rise} data-rise={rise > 0}>
          {Math.ceil(value)}
          <small>%</small>
        </span>
      </div>
      <div className="station-meter">
        <span style={{ width: `${value}%` }} />
      </div>
      <div className="station-bottom">
        <code>!{command}</code>
      </div>
    </div>
  );
}

const commandInfo = {
  shield: {
    icon: Shield,
    name: "Shields",
    action: "Absorb the next impact.",
    detail: "+18 shield",
    key: "1",
  },
  boost: {
    icon: Zap,
    name: "Dash fuel",
    action: "Beat the closing jump window.",
    detail: "+22 boost",
    key: "2",
  },
  repair: {
    icon: Heart,
    name: "Repairs",
    action: "Keep the whole crew alive.",
    detail: "+8 hull",
    key: "3",
  },
};
function Brand() {
  return (
    <a className="brand" href="/" aria-label="Last Signal home">
      <span className="brand-mark">
        <Signal size={23} />
      </span>
      <span>
        LAST<span className="brand-thin">SIGNAL</span>
        <small>A TWITCH CO-OP RESCUE</small>
      </span>
    </a>
  );
}
function Timer({ game }: { game: GameState }) {
  const t = Math.max(0, Math.ceil(WORLD.duration - game.elapsed));
  return (
    <span className={t < 25 ? "danger" : ""}>
      {String(Math.floor(t / 60)).padStart(2, "0")}
      <span className="timer-colon">:</span>
      {String(t % 60).padStart(2, "0")}
    </span>
  );
}

export function App() {
  const spectator = location.pathname === "/overlay";
  const { state, connected, config, notice, setNotice, send, post } =
    useSession(spectator);
  const [modal, setModal] = useState<"connect" | "help" | "broadcast" | null>(
    null,
  );
  const [prefs, updatePrefs] = useState(audioPrefs);
  const sound = prefs.sound;
  const [blocked, setBlocked] = useState(audioBlocked);
  useEffect(() => onAudioPrefs(updatePrefs), []);
  // Browsers only start audio after a gesture: resume on the first click or key press.
  useEffect(() => {
    if (spectator) return;
    const unlock = () => {
      unlockAudio();
      setTimeout(() => setBlocked(audioBlocked()), 150);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [spectator]);
  const [channel, setChannel] = useState(
    () => localStorage.getItem("lastsignal-channel") || "",
  );
  const [name, setName] = useState("space_cadet");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [launching, setLaunching] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLElement>("button, a, input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled)",
        ),
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [modal]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("twitchError")) {
      setNotice(params.get("twitchError")!);
      history.replaceState({}, "", location.pathname);
      setModal("connect");
    } else if (params.has("connected")) {
      setNotice("Twitch authorized. Waiting for the chat subscription…");
      history.replaceState({}, "", location.pathname);
    }
  }, []);
  useEffect(() => {
    if (state?.twitch.channel) setChannel(state.twitch.channel);
  }, [state?.twitch.channel]);
  const action = (a: "start" | "pause" | "reset") => {
    send({ type: "action", action: a });
    if (a === "start" || a === "pause")
      setTimeout(() => stage.current?.querySelector("canvas")?.focus(), 50);
  };
  const toggleSound = () => {
    setSound(!sound);
    setTimeout(() => setBlocked(audioBlocked()), 150);
  };
  const phase = state?.game.phase;
  const storm = state?.game.storm;
  const counting = (state?.game.countdown ?? 0) > 0;
  // Music follows the mission: calm in the lobby, driving in flight, tense in the storm,
  // a fanfare or a sting at the end. The OBS view stays silent to avoid doubled audio.
  useEffect(() => {
    if (spectator || !phase) return;
    setMusicMode(
      phase === "won"
        ? "won"
        : phase === "lost"
          ? "lost"
          : phase === "running" && !counting
            ? storm
              ? "storm"
              : "flight"
            : "lobby",
    );
  }, [spectator, phase, storm, counting]);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("Copy unavailable. Select and copy the displayed URL.");
    }
  };
  const full = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      setNotice(
        "Fullscreen is unavailable in this browser. Use the broadcast view.",
      );
    }
  };
  if (!state)
    return (
      <div className="loading-page">
        <Brand />
        <div className="loading-signal">
          <Radio size={35} />
          <h1>
            Finding your signal<span>…</span>
          </h1>
          <p>Connecting to the local mission server.</p>
          <small>
            If this stays here, start the app with <code>npm start</code>.
          </small>
        </div>
      </div>
    );
  const game = state.game;
  const active = game.phase === "running" || game.phase === "paused";
  const over = game.phase === "won" || game.phase === "lost";
  const live = game.mode === "live";
  const overlayUrl = `${location.origin}/overlay`;
  const connectedTwitch = state.twitch.status === "connected";
  const commands = (["shield", "boost", "repair"] as Command[]).map(
    (command) => (
      <Station
        key={command}
        command={command}
        value={
          command === "shield"
            ? game.ship.shield
            : command === "boost"
              ? game.ship.boost
              : game.ship.hull
        }
      />
    ),
  );
  const lobby = game.crew.slice(-10);
  const soundPrompt = !spectator && (
    <button
      className={`sound-pill ${sound ? "is-on" : ""}`}
      onClick={toggleSound}
      aria-pressed={sound}
    >
      {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
      {sound ? (blocked ? "Sound on · click to start" : "Sound & music on") : "Turn on sound & music"}
    </button>
  );
  const flight = (
    <div className={`flight-stage ${game.phase}`} ref={stage}>
      <Space
        game={game}
        spectator={spectator}
        onInput={
          spectator ? undefined : (input) => send({ type: "input", input })
        }
        onPause={() => action("pause")}
      />
      {game.phase === "ready" && (
        <div className="stage-intro">
          <span className="eyebrow amber">
            <span className="tiny-cross">+</span> INCOMING DISTRESS SIGNAL
          </span>
          <h2>
            Three signals.
            <br />
            One way home.
          </h2>
          <div className="lobby" aria-live="polite">
            <span className="lobby-title">
              <UserPlus size={14} /> CREW BOARDING
              <strong>{String(game.crew.length).padStart(2, "0")}</strong>
            </span>
            {lobby.length ? (
              <div className="lobby-names">
                {lobby.map((c) => (
                  <span key={c.id} style={{ color: c.color }}>
                    {c.name}
                  </span>
                ))}
                {game.crew.length > lobby.length && (
                  <span className="lobby-more">+{game.crew.length - lobby.length}</span>
                )}
              </div>
            ) : (
              <span className="lobby-empty">
                Chat types <code>!join</code> to board
              </span>
            )}
          </div>
          {!spectator && (
            <div className="launch-row">
              <button
                className="button primary launch-button"
                disabled={!connected || launching}
                onClick={() => {
                  setLaunching(true);
                  setTimeout(() => setLaunching(false), 1500);
                  unlockAudio();
                  action("start");
                }}
              >
                <Play size={16} fill="currentColor" /> Launch rescue{" "}
                <ArrowUpRight size={18} />
              </button>
              {soundPrompt}
            </div>
          )}
        </div>
      )}
      {game.phase === "paused" && (
        <div className="stage-shade">
          <Pause size={30} />
          <h2>Holding position.</h2>
          <p>The mission and jump window are paused.</p>
          {!spectator && (
            <button className="button primary" onClick={() => action("pause")}>
              <Play size={16} /> Resume flight
            </button>
          )}
        </div>
      )}
      {over && (
        <Results
          game={game}
          spectator={spectator}
          onReset={() => action("reset")}
        />
      )}
      {active && !spectator && game.elapsed < 8 && (
        <div className="pilot-hint">
          <span className="keycap wide">WASD</span>
          <span>fly</span>
          <i /> <span className="keycap wide">SPACE</span>
          <span>fire</span>
          <i /> <span className="keycap wide">SHIFT</span>
          <span>dash</span>
          <i /> <span className="keycap">E</span>
          <span>power-up</span>
          <i /> <span className="keycap">P</span>
          <span>pause</span>
        </div>
      )}
      {!connected && (
        <div className="connection-lost">
          <Radio size={16} /> Mission server disconnected. Reconnecting…
        </div>
      )}
    </div>
  );
  if (spectator)
    return (
      <main className="broadcast-view">
        <header>
          <Brand />
          <span className={`source-pill ${live ? "live" : ""}`}>
            <span className="status-dot" />
            {live
              ? `TWITCH / ${state.twitch.channel}`
              : "REHEARSAL · SIMULATED CHAT"}
          </span>
          <div className="broadcast-timer">
            <Timer game={game} />
          </div>
        </header>
        {flight}
        <footer>
          <div className="broadcast-instructions">
            <span>YOU ARE THE CREW. TYPE</span>
            <code>!join</code>
            <code>!shield</code>
            <code>!boost</code>
            <code>!repair</code>
            <code className="gift">!drop</code>
            <code className="chaos">!meteor</code>
            <small>Repeat with a word: !boost go</small>
          </div>
          <span>
            {game.crew.length} crew · {game.people} rescued · Built with Codex
          </span>
        </footer>
      </main>
    );
  return (
    <div className="app-shell">
      <header className="site-header">
        <Brand />
        <nav>
          <span className="header-caption">GOOD SIGNAL. GREAT COMPANY.</span>
          <button
            className="button ghost icon-button"
            onClick={() => setModal("help")}
            aria-label="How to play"
          >
            <CircleHelp size={19} />
          </button>
          <span className="header-rule" />
          <button
            className={`button twitch-button ${connectedTwitch ? "is-connected" : ""}`}
            onClick={() => setModal("connect")}
          >
            <TwitchMark />
            {connectedTwitch ? state.twitch.channel : "Connect Twitch"}
            {connectedTwitch ? (
              <span className="status-dot" />
            ) : (
              <ArrowUpRight size={15} />
            )}
          </button>
        </nav>
      </header>
      <main className="main-content">
        {config && !config.operatorKey && (
          <div className="inline-warning">
            <Radio size={16} /> View only. Open this console on the streaming
            computer to fly and control the mission.
          </div>
        )}
        <section className="mission-heading">
          <div>
            <div className="eyebrow">
              <span className="small-dash" /> MULTIPLAYER, ONE SPACESHIP.
            </div>
            <h1>
              You fly. <span>Chat keeps you alive.</span>
            </h1>
          </div>
          <div className="mode-selector" aria-label="Mission source">
            <button
              className={!live ? "selected" : ""}
              disabled={active}
              onClick={() => void post("/api/mode", { mode: "demo" })}
            >
              <Sparkles size={14} /> Rehearsal
            </button>
            <button
              className={live ? "selected" : ""}
              disabled={active}
              onClick={() =>
                connectedTwitch
                  ? void post("/api/mode", { mode: "live" })
                  : setModal("connect")
              }
            >
              <Radio size={14} /> Twitch live
            </button>
          </div>
        </section>
        <div className="workspace">
          <section className="mission-panel">
            <div className="mission-toolbar">
              <div className="mission-title">
                <span className={`status-dot ${active ? "pulse" : ""}`} />
                <span>OPERATION: LAST LIGHT</span>
                <span className="toolbar-divider">/</span>
                <small>MISSION 001</small>
              </div>
              <div className="mission-tools">
                <span className="mission-time">
                  <small>JUMP WINDOW</small>
                  <Timer game={game} />
                </span>
                <button
                  className={`tool-button ${sound ? "is-on" : ""}`}
                  title={sound ? "Mute all sound" : "Turn on sound"}
                  aria-label={sound ? "Mute all sound" : "Turn on sound"}
                  aria-pressed={sound}
                  onClick={toggleSound}
                >
                  {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                <button
                  className={`tool-button ${sound && prefs.music ? "is-on" : ""}`}
                  title={prefs.music ? "Turn music off" : "Turn music on"}
                  aria-label={prefs.music ? "Turn music off" : "Turn music on"}
                  aria-pressed={prefs.music}
                  disabled={!sound}
                  onClick={() => setMusic(!prefs.music)}
                >
                  <Music size={15} />
                </button>
                <button
                  className="tool-button"
                  title="Fullscreen flight"
                  aria-label="Fullscreen flight"
                  onClick={() => void full()}
                >
                  <Maximize2 size={15} />
                </button>
              </div>
            </div>
            {flight}
            <div className="mission-bottom">
              <span className={`source-label ${live ? "live" : ""}`}>
                <span className="status-dot" />
                {live
                  ? `LIVE CHAT · ${state.twitch.channel}`
                  : "SIMULATED CHAT · DEMO MODE"}
              </span>
              <span className="mission-objective">
                <Flag size={13} />
                <span>Recover the pods. Reach the jump gate.</span>
              </span>
              <div className="playback-controls">
                {active && (
                  <button
                    className="text-button"
                    onClick={() => action("pause")}
                  >
                    {game.phase === "paused" ? (
                      <Play size={14} />
                    ) : (
                      <Pause size={14} />
                    )}{" "}
                    {game.phase === "paused" ? "Resume" : "Pause"}
                  </button>
                )}
                <button
                  className="tool-button"
                  title="Reset mission"
                  aria-label="Reset mission"
                  onClick={() => action("reset")}
                  disabled={game.phase === "ready"}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>
            <div className="stations">{commands}</div>
            <div
              className={`all-hands ${game.overdriveUntil > game.elapsed ? "is-active" : ""}`}
            >
              <span className="all-hands-mark">
                <Sparkles size={14} />
              </span>
              <strong>ALL HANDS</strong>
              <div className="sync-links">
                {(["shield", "boost", "repair"] as Command[]).map((c) => (
                  <span
                    key={c}
                    className={
                      game.links.some((l) => l.role === c) ||
                      game.overdriveUntil > game.elapsed
                        ? "lit"
                        : ""
                    }
                    style={{ "--link": COLORS[c] } as React.CSSProperties}
                    title={
                      game.links.find((l) => l.role === c)?.name ||
                      `Waiting for !${c}`
                    }
                  >
                    <span />
                    {c}
                  </span>
                ))}
              </div>
              <span className="all-hands-description">
                {game.overdriveUntil > game.elapsed
                  ? "RESCUE RANGE ×2"
                  : "3 viewers · 3 stations · 6 s"}
              </span>
              <span className="sync-count">
                {game.bursts} {game.bursts === 1 ? "PULSE" : "PULSES"}
              </span>
            </div>
          </section>
          <aside className="crew-panel">
            <div className="crew-heading">
              <div>
                <h2>
                  Your crew
                  <span className="crew-count">
                    {String(game.crew.length).padStart(2, "0")}
                  </span>
                </h2>
              </div>
              <Users size={20} />
            </div>
            <div className="crew-source">
              <span className={`status-dot ${live ? "cyan" : ""}`} />
              <span>
                {live
                  ? connectedTwitch
                    ? state.twitch.transport === "irc"
                      ? "Twitch IRC · read-only"
                      : "Twitch EventSub connected"
                    : "Twitch connection interrupted"
                  : "Rehearsal crew"}
              </span>
              <small>{live ? "LIVE" : "SIM"}</small>
            </div>
            {game.crew.some((c) => c.points > 0) && (
              <div className="leaderboard" aria-label="Top crew">
                {[...game.crew]
                  .sort((a, b) => b.points - a.points)
                  .slice(0, 5)
                  .map((c, i) => (
                    <div className="leader-row" key={c.id}>
                      <span className="leader-rank">{i + 1}</span>
                      <span className="leader-name" style={{ color: c.color }}>
                        {c.name}
                      </span>
                      <span className="leader-points">{c.points}</span>
                    </div>
                  ))}
              </div>
            )}
            <div className="crew-feed" role="log" aria-label="Crew activity">
              {game.events.length === 0 ? (
                <div className="empty-crew">
                  <div className="orbit-icon">
                    <Satellite size={26} />
                    <i />
                    <i />
                  </div>
                  <h3>Waiting for crew</h3>
                  <p>
                    Type <code>!join</code> in chat
                  </p>
                </div>
              ) : (
                [...game.events]
                  .reverse()
                  .slice(0, 8)
                  .map((event) => (
                    <div className={`feed-event ${event.type}`} key={event.id}>
                      <span className="feed-icon" style={{ color: event.color }}>
                        {event.type === "command" &&
                        (event.command === "shield" ||
                          event.command === "boost" ||
                          event.command === "repair") ? (
                          (() => {
                            const Icon = commandInfo[event.command].icon;
                            return <Icon size={14} />;
                          })()
                        ) : event.type === "rescue" ? (
                          <Flag size={14} />
                        ) : event.type === "hit" ? (
                          <Zap size={14} />
                        ) : event.type === "join" ? (
                          <UserPlus size={14} />
                        ) : event.type === "drop" ||
                          event.type === "pickup" ||
                          event.type === "powerup" ? (
                          <Package size={14} />
                        ) : event.type === "meteor" ||
                          event.type === "destroyed" ? (
                          <Flame size={14} />
                        ) : event.type === "rejected" ? (
                          <X size={14} />
                        ) : (
                          <Radio size={14} />
                        )}
                      </span>
                      {event.name && (
                        <strong style={{ color: event.color }}>
                          {event.name}
                          {event.simulated && <small>SIM</small>}
                        </strong>
                      )}
                      <p>{shortText(event)}</p>
                    </div>
                  ))
              )}
            </div>
            <div className="crew-total">
              <span>
                <strong>{game.actions}</strong> crew actions
              </span>
              <span>
                <strong>{game.blocked}</strong> impacts blocked
              </span>
            </div>
            <div className="rescue-manifest">
              <div className="eyebrow">
                DISTRESS MANIFEST<span>{game.rescued} / 3</span>
              </div>
              {game.pods.map((pod) => (
                <div className={`manifest-row ${pod.status}`} key={pod.id}>
                  <span className="pod-indicator">
                    {pod.status === "rescued" ? <Check size={12} /> : <span />}
                  </span>
                  <span>
                    {pod.name}
                    <small>{pod.people} survivors</small>
                  </span>
                  <span className="pod-status">
                    {pod.status === "rescued"
                      ? "ABOARD"
                      : pod.status === "missed"
                        ? "LOST"
                        : "SOS"}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
        <section className="under-flight">
          <div className="command-chips" aria-label="Chat commands">
            <span>
              <code>!join</code> board
            </span>
            <span>
              <code>!shield</code> +18 shield
            </span>
            <span>
              <code>!boost</code> dash fuel
            </span>
            <span>
              <code>!repair</code> +8 hull
            </span>
            <span className="chip-gift">
              <code>!drop</code> send a power-up
            </span>
            <span className="chip-chaos">
              <code>!meteor</code> chaos
            </span>
            <span className="chip-tip">
              repeat with a word: <code>!boost go</code>
            </span>
          </div>
          <button
            className="text-button broadcast-link"
            onClick={() => setModal("broadcast")}
          >
            <ExternalLink size={15} /> Add to OBS <ArrowUpRight size={14} />
          </button>
        </section>
        {!live && (
          <section className="rehearsal-bench">
            <div className="bench-label">
              <Settings2 size={17} />
              <div>
                <strong>Rehearsal controls</strong>
              </div>
            </div>
            <div className="bench-switches">
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={game.simulation}
                  onChange={(e) =>
                    send({
                      type: "action",
                      action: "simulation",
                      value: e.target.checked,
                    })
                  }
                />
                <span className="switch" /> Simulated crew
              </label>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={game.autopilot}
                  onChange={(e) =>
                    send({
                      type: "action",
                      action: "autopilot",
                      value: e.target.checked,
                    })
                  }
                />
                <span className="switch" /> Training pilot
              </label>
            </div>
            <div className="manual-command">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={25}
                aria-label="Simulated viewer name"
                placeholder="your_name"
              />
              {(["join", "shield", "boost", "repair", "drop", "meteor"] as const).map((c) => (
                <button
                  className={`manual-button ${c}`}
                  disabled={!["ready", "running"].includes(game.phase)}
                  key={c}
                  onClick={() => send({ type: "command", command: c, name })}
                >
                  !{c}
                </button>
              ))}
            </div>
          </section>
        )}
        {live && (
          <div className="live-feedback">
            <Radio size={15} />
            <span>
              {state.twitch.lastCommand ? (
                <>
                  <strong>{state.twitch.lastCommand.name}</strong> sent{" "}
                  <code>!{state.twitch.lastCommand.command}</code> ·{" "}
                  {state.twitch.lastCommand.accepted
                    ? "Crew action applied to the ship."
                    : state.twitch.lastCommand.reason}
                </>
              ) : state.twitch.received > 0 ? (
                `${state.twitch.received} real chat messages received. Send !shield or !boost to crew the ship.`
              ) : (
                "Listening to real Twitch chat. Send !shield or !boost to charge your ship before launch."
              )}
            </span>
            <small>{state.twitch.received} MESSAGES</small>
          </div>
        )}
        {live && state.twitch.error && (
          <div className="inline-warning">
            <Radio size={16} />
            {state.twitch.error}
            <button className="text-button" onClick={() => setModal("connect")}>
              Connection settings <ArrowRight size={14} />
            </button>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <span>
          <span className="footer-cross">+</span> NO ONE GETS HOME ALONE.
        </span>
        <span>
          Built with <strong>OpenAI Codex</strong>
          <span className="footer-dot">·</span>Made for Twitch communities
        </span>
        <button className="text-button" onClick={() => setModal("help")}>
          Flight manual <ArrowUpRight size={13} />
        </button>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Radio size={16} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close tool-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "connect" && (
              <>
                <div className="modal-symbol">
                  <TwitchMark />
                </div>
                <span className="eyebrow">GIVE YOUR CHAT A SPACESHIP</span>
                <h2 id="modal-title">Connect your crew.</h2>
                <p>
                  Your viewers become the crew, straight from Twitch chat.
                </p>
                <form
                  className="channel-form anonymous-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    const ok = await post("/api/twitch/anonymous", { channel });
                    setBusy(false);
                    if (ok) {
                      localStorage.setItem("lastsignal-channel", channel);
                      setModal(null);
                      setNotice(
                        "Twitch chat connected. Launch a live rescue, then send a command in your channel.",
                      );
                    }
                  }}
                >
                  <label htmlFor="anon-channel">Your Twitch channel name</label>
                  <div>
                    <input
                      id="anon-channel"
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                      placeholder="your_channel"
                      required
                      pattern="[a-zA-Z0-9_]{1,25}"
                      autoComplete="off"
                    />
                    <button
                      className="button primary"
                      disabled={busy || active}
                    >
                      {busy ? "Joining…" : "Join live chat"}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <span className="setup-note">
                    <Shield size={14} /> Read-only Twitch chat. No keys, login,
                    or 2FA setup needed.
                  </span>
                </form>
                {connectedTwitch && (
                  <div className="connected-account">
                    <span className="status-dot cyan" /> Listening to{" "}
                    <strong>{state.twitch.channel}</strong>
                    <button
                      className="text-button"
                      onClick={async () => {
                        await post("/api/twitch/disconnect");
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                )}
                <details className="advanced-connection">
                  <summary>Optional: OAuth / EventSub connection</summary>
                  {!config?.configured ? (
                    <div className="setup-instructions">
                      <strong>One-time Twitch app setup</strong>
                      <ol>
                        <li>
                          Register a confidential app in the{" "}
                          <a
                            href="https://dev.twitch.tv/console/apps"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Twitch developer console <ArrowUpRight size={12} />
                          </a>
                          .
                        </li>
                        <li>
                          Set this exact OAuth redirect URL:
                          <code className="code-block">
                            {config?.redirectUri ||
                              "http://localhost:3001/auth/twitch/callback"}
                          </code>
                        </li>
                        <li>
                          Copy <code>.env.example</code> to <code>.env</code>.
                          Add <code>TWITCH_CLIENT_ID</code> and{" "}
                          <code>TWITCH_CLIENT_SECRET</code>.
                        </li>
                        <li>
                          Restart the server, then return here to sign in.
                        </li>
                      </ol>
                      <span className="setup-note">
                        <Shield size={14} /> Only user:read:chat. Tokens stay on
                        your local server.
                      </span>
                    </div>
                  ) : (
                    <>
                      <a
                        className="button ghost full-button"
                        href={`${config.appUrl}/auth/twitch?return=${encodeURIComponent(location.origin)}`}
                      >
                        <TwitchMark /> Authorize with Twitch{" "}
                        <ArrowUpRight size={16} />
                      </a>
                      {state.twitch.account &&
                        state.twitch.transport === "eventsub" && (
                          <form
                            className="channel-form"
                            onSubmit={async (e) => {
                              e.preventDefault();
                              setBusy(true);
                              const ok = await post("/api/twitch/channel", {
                                channel,
                              });
                              setBusy(false);
                              if (ok) setModal(null);
                            }}
                          >
                            <label htmlFor="channel">EventSub channel</label>
                            <div>
                              <input
                                id="channel"
                                value={channel}
                                onChange={(e) => setChannel(e.target.value)}
                                placeholder="your_channel"
                                required
                                pattern="[a-zA-Z0-9_]{1,25}"
                              />
                              <button
                                className="button primary"
                                disabled={busy || active}
                              >
                                {busy ? "Connecting…" : "Join channel"}
                              </button>
                            </div>
                          </form>
                        )}
                    </>
                  )}
                </details>
                {state.twitch.error && (
                  <p className="danger">{state.twitch.error}</p>
                )}
                <p className="modal-footnote">
                  {state.twitch.received > 0
                    ? state.twitch.received +
                      " real chat messages received this connection."
                    : "No real Twitch messages received yet."}{" "}
                  Rehearsal always stays separate from live activity.
                </p>
              </>
            )}
            {modal === "help" && (
              <>
                <div className="modal-symbol amber">
                  <Rocket size={26} />
                </div>
                <span className="eyebrow">HOW TO PLAY</span>
                <h2 id="modal-title">One ship. Two sides.</h2>
                <div className="help-cards">
                  <section className="help-card">
                    <h3>
                      <span className="role-number">01</span> You fly
                    </h3>
                    <ul className="help-commands">
                      <li>
                        <kbd>WASD</kbd> steer
                      </li>
                      <li>
                        <kbd>Space</kbd> laser
                      </li>
                      <li>
                        <kbd>Shift</kbd> dash
                      </li>
                      <li>
                        <kbd>E</kbd> power-up
                      </li>
                      <li>
                        <kbd>P</kbd> pause
                      </li>
                      <li>Rings save pods</li>
                    </ul>
                  </section>
                  <section className="help-card">
                    <h3>
                      <span className="role-number cyan-text">02</span> Chat
                      keeps you alive
                    </h3>
                    <ul className="help-commands">
                      <li>
                        <code>!join</code> board
                      </li>
                      <li>
                        <code>!shield</code> +18 shield
                      </li>
                      <li>
                        <code>!boost</code> dash fuel
                      </li>
                      <li>
                        <code>!repair</code> +8 hull
                      </li>
                      <li>
                        <code>!drop</code> power-up
                      </li>
                      <li>
                        <code>!meteor</code> chaos
                      </li>
                    </ul>
                    <p className="help-tip">
                      Repeat with a word: <code>!boost go</code>
                    </p>
                  </section>
                  <section className="help-card">
                    <h3>
                      <span className="role-number">03</span> Win together
                    </h3>
                    <ul>
                      <li>Save 3 pods in 2 minutes</li>
                      <li>Catch crates, blast meteors</li>
                      <li>3 viewers, 3 stations: ALL HANDS</li>
                    </ul>
                  </section>
                </div>
                <button
                  className="button primary full-button"
                  onClick={() => setModal(null)}
                >
                  Ready for launch <ChevronRight size={17} />
                </button>
              </>
            )}
            {modal === "broadcast" && (
              <>
                <div className="modal-symbol">
                  <ExternalLink size={26} />
                </div>
                <span className="eyebrow">READY FOR YOUR NEXT STREAM</span>
                <h2 id="modal-title">Bring the crew on screen.</h2>
                <p>Add this URL as a Browser Source in OBS.</p>
                <label className="field-label">BROWSER SOURCE URL</label>
                <div className="copy-field">
                  <input
                    value={overlayUrl}
                    readOnly
                    aria-label="OBS browser source URL"
                  />
                  <button
                    className="button ghost"
                    onClick={() => void copy(overlayUrl)}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <div className="broadcast-specs">
                  <span>
                    WIDTH<strong>1920</strong>
                  </span>
                  <span>
                    HEIGHT<strong>1080</strong>
                  </span>
                  <span>
                    FRAME RATE<strong>60 fps</strong>
                  </span>
                </div>
                <p className="modal-footnote">
                  Keep this console open. In OBS, untick “Shutdown source when
                  not visible”.
                </p>
                <a
                  className="button primary full-button"
                  href="/overlay"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open broadcast preview <ArrowUpRight size={16} />
                </a>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function TwitchMark() {
  return (
    <svg
      width="18"
      height="19"
      viewBox="0 0 24 26"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 1 1 5v17h6v4l4-4h5l7-7V1H5Z" fill="currentColor" />
      <path d="M7 4h13v10l-4 4h-4l-3 3v-3H5V4h2Z" fill="#101820" />
      <path d="M10 7v6m6-6v6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function CountUp({ to }: { to: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setValue(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return <>{value}</>;
}
function Results({
  game,
  spectator,
  onReset,
}: {
  game: GameState;
  spectator: boolean;
  onReset: () => void;
}) {
  const won = game.phase === "won";
  const crew = [...game.crew].sort((a, b) => b.points - a.points);
  return (
    <div className={`results-layer ${won ? "won" : "lost"}`}>
      <div className="result-medallion">
        {won ? <Flag size={25} /> : <Radio size={25} />}
      </div>
      <span className="eyebrow">
        {won
          ? game.rescued === 3
            ? "PERFECT RESCUE / ALL SIGNALS ANSWERED"
            : "MISSION COMPLETE / JUMP SUCCESSFUL"
          : "MISSION ENDED / SIGNAL LOST"}
      </span>
      <h2>{won ? "You brought them home." : "One more signal."}</h2>
      {!won && <p>{game.reason}</p>}
      <div className="result-cards">
        <div className="result-card">
          <strong>
            <CountUp to={game.people} />
            <small>/13</small>
          </strong>
          <span>SURVIVORS</span>
          <div className="result-pods" aria-label="Escape pods">
            {game.pods.map((pod) => (
              <i key={pod.id} className={pod.status} title={pod.name} />
            ))}
          </div>
        </div>
        <div className="result-card">
          <strong>
            <CountUp to={game.crew.length} />
          </strong>
          <span>CREW</span>
          <em>
            <CountUp to={game.actions} /> actions · <CountUp to={game.destroyed ?? 0} /> rocks
          </em>
        </div>
        {crew[0] && crew[0].points > 0 && (
          <div className="result-card mvp" style={{ color: crew[0].color }}>
            <Trophy size={20} />
            <b>{crew[0].name}</b>
            <span>MVP · {crew[0].points} PTS</span>
          </div>
        )}
      </div>
      {crew.length > 1 && (
        <div className="result-crew">
          {crew.slice(1, 4).map((c) => (
            <span key={c.id} style={{ color: c.color }}>
              {c.name}
            </span>
          ))}
          {crew.length > 4 && <span className="more">+{crew.length - 4} crew</span>}
        </div>
      )}
      {!spectator && (
        <div className="result-actions">
          <button className="button primary" onClick={onReset}>
            <RotateCcw size={15} /> Fly again
          </button>
          <a className="button ghost" href="/api/report" download>
            <Download size={15} /> Mission log
          </a>
        </div>
      )}
      <span className="result-source">
        {game.mode === "demo" ? "REHEARSAL · SIMULATED CHAT" : "TWITCH LIVE CREW"}
      </span>
    </div>
  );
}
