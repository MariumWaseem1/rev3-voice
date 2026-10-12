"use client";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Play,
  Plug,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Volume2,
  X,
} from "lucide-react";
import type { Room, LocalAudioTrack } from "livekit-client";
import { voices, featuredVoices } from "@/lib/catalogue";
import {
  blankConfiguration,
  missingConfiguration,
  type Configuration,
} from "@/lib/schemas";
import { OwnerEnquiries } from "./company/owner-enquiries";
import { SentimentReport } from "./sentiment-report";
import { Setup } from "./setup";
import { ToolChoices } from "./tool-choices";
import { StudioPhone } from "./studio-phone";
import { VoiceFace } from "./voice-face";
import { StudioWelcome } from "./studio-welcome";
import { Heading, Field, Area, Notice, Badge, Wave } from "./ui";
type SessionView = {
  id: string;
  state: string;
  mode: string;
  snapshot: Configuration;
  activated_at: string | null;
  deadline: string | null;
  ended_at: string | null;
  error: string | null;
};
type Turn = { id: string; session_id: string; role: string; text: string; sentiment?: {model:string; compound:number; label:"positive"|"neutral"|"negative"}|null };
type Booking = {
  id: string;
  service_name: string;
  customer: string;
  starts_at: string;
  timezone: string;
  reference: string;
  status: string;
};
type Action = {
  id: string;
  session_id: string;
  name: string;
  status: string;
  result: { message?: string; [key: string]: unknown };
  created_at: string;
};
type FeedbackForm = {
  id?: string;
  sessionId?: string;
  turnId?: string;
  actionId?: string;
  goal: string;
  understood: number;
  completed: "yes" | "partly" | "no" | "not-tested";
  natural: number;
  confusing: string;
  change: string;
  needs: string;
  failureCategory:
    "none" | "audio" | "connection" | "understanding" | "action" | "other";
};
type Feedback = {
  id: string;
  data: FeedbackForm;
  created_at: string;
  voice: string;
  category: string;
  problems: string[];
  email?: string;
};
type Connections = {
  crm: string;
  calendar: string;
  messaging: string;
  other: string;
  requirements: string;
};
type Workspace = {
  user: { email: string; admin: boolean; development: boolean };
  configuration: { id: string; version: number; data: Configuration } | null;
  voice: string;
  entitlement: { state: string };
  sessions: SessionView[];
  turns: Turn[];
  actions: Action[];
  bookings: Booking[];
  records: {
    id: string;
    kind: string;
    customer: string;
    contact: string;
    details: string;
  }[];
  previews: { id: string; channel: string; body: string; status: string }[];
  feedback: Feedback[];
  connections: Connections | null;
  pilots: { id: string; created_at: string }[];
};
type Status = {
  mode: "live" | "simulation";
  devAuth: boolean;
  liveUnavailable: string | null;
  emailConfigured: boolean;
  repeatTests?: boolean;
};
const emptyFeedback: FeedbackForm = {
  goal: "",
  understood: 3,
  completed: "not-tested",
  natural: 3,
  confusing: "",
  change: "",
  needs: "",
  failureCategory: "none",
};
const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Shape Your Receptionist", icon: SlidersHorizontal },
  { name: "Choose a Voice", icon: AudioLines },
  { name: "Your Voice Test", icon: Mic },
  { name: "Demo Results", icon: ClipboardList },
  { name: "Connections", icon: Plug },
  { name: "Your Feedback", icon: MessageSquare },
];
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/${path}`,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Please try again later.");
  return json as T;
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k) + ":" + stableJson(v)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
const formatDate = (date: string, zone = "Europe/London") =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(date));
export function Platform() {
  const [status, setStatus] = useState<Status | null>(null),
    [workspace, setWorkspace] = useState<Workspace | null>(null),
    [page, setPage] = useState("Overview"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [menu, setMenu] = useState(false),
    [collapsed, setCollapsed] = useState(true),
    [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [configuration, setConfiguration] =
      useState<Configuration>(blankConfiguration);
  const [feedback, setFeedback] = useState<FeedbackForm>(emptyFeedback),
    [connections, setConnections] = useState<Connections>({
      crm: "",
      calendar: "",
      messaging: "",
      other: "",
      requirements: "",
    });
  const [callState, setCallState] = useState("Ready"),
    [muted, setMuted] = useState(false),
    [connected, setConnected] = useState(false),
    [now, setNow] = useState(() => Date.now()),
    [preview, setPreview] = useState("");
  const [simulationDetails, setSimulationDetails] = useState(
      "Please call me back about your services.",
    ),
    [deleteText, setDeleteText] = useState(""),
    [adminFeedback, setAdminFeedback] = useState<Feedback[]>([]),
    [failedSessions, setFailedSessions] = useState<
      { id: string; state: string; error: string }[]
    >([]),
    [adminFilters, setAdminFilters] = useState({
      category: "",
      problem: "",
      voice: "",
      rating: "",
      completed: "",
      failure: "",
    });
  const [resetSession, setResetSession] = useState(""),
    [resetReason, setResetReason] = useState(""),
    [resetVerified, setResetVerified] = useState(false);
  const room = useRef<Room | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    audioArea = useRef<HTMLDivElement | null>(null),
    audioUrl = useRef("");
  const active = workspace?.sessions.find((s) =>
    ["reserved", "active"].includes(s.state),
  );
  const current = workspace?.sessions[0];
  const testConfiguration = active?.snapshot || workspace?.configuration?.data;
  const setupMissing = testConfiguration
    ? missingConfiguration(testConfiguration)
    : ["Saved business setup"];
  const setupReady = setupMissing.length === 0;
  const refresh = useCallback(async (initial = false) => {
    const data = await api<Workspace>("workspace");
    setWorkspace(data);
    if (initial) {
      setConfiguration(
        data.configuration?.data
          ? { ...data.configuration.data, voice: data.voice }
          : { ...blankConfiguration, voice: data.voice },
      );
      if (data.connections) setConnections(data.connections);
    }
    return data;
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api<Status>("status");
        if (cancelled) return;
        setStatus(s);
        try {
          await refresh(true);
        } catch {
          /* A signed-out visitor sees the landing page. */
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Unable to load the platform.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  useEffect(() => {
    if (!workspace) return;
    const timer = setInterval(
      () => {
        setNow(Date.now());
        if (active) refresh().catch(() => setCallState("Reconnecting"));
      },
      active ? 2000 : 10000,
    );
    return () => clearInterval(timer);
  }, [workspace?.user.email, active?.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const navigateAfterCall = useEffectEvent(() => navigate("Demo Results"));
  useEffect(() => {
    if (current && !active && room.current) {
      room.current.disconnect();
      room.current = null;
      setCallState(current.error ? "Failed" : "Completed");
      navigateAfterCall();
      setFeedback((f) => ({ ...f, sessionId: current.id }));
    }
  }, [current, active]);
  useEffect(
    () => () => {
      room.current?.disconnect();
      audio.current?.pause();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    },
    [],
  );
  useEffect(() => {
    if (!loginOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),a[href]",
        ) || [],
      );
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLoginOpen(false);
      if (event.key === "Tab") {
        const items = controls(),
          first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [loginOpen]);
  async function run<T>(
    fn: () => Promise<T>,
    message = "",
  ): Promise<T | undefined> {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await fn();
      if (message) setSuccess(message);
      return result;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function navigate(name: string) {
    const guidePages = ["Overview", "Shape Your Receptionist", "Choose a Voice", "Your Voice Test", "Demo Results", "Connections", "Your Feedback"];
    const selector = "#main-content .talking-orb";
    const source = document.querySelector<HTMLElement>(selector);
    if (name !== page && guidePages.includes(page) && guidePages.includes(name) && source && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const from = source.getBoundingClientRect();
      const traveller = source.cloneNode(true) as HTMLElement;
      traveller.setAttribute("aria-hidden", "true");
      traveller.classList.add("travelling-guide");
      Object.assign(traveller.style, { position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, margin: "0", zIndex: "100", pointerEvents: "none", animation: "none" });
      traveller.querySelectorAll("p, .talking-words, .orb-shine").forEach(p => p.remove());
      traveller.removeAttribute("disabled");
      traveller.style.opacity = "1";
      document.documentElement.classList.add("guide-in-transit");
      document.body.appendChild(traveller);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const destination = document.querySelector<HTMLElement>(selector);
        if (!destination) { traveller.remove(); document.documentElement.classList.remove("guide-in-transit"); return; }
        const to = destination.getBoundingClientRect();
        destination.style.visibility = "hidden";
        const dx = to.left - from.left, dy = to.top - from.top;
        const journey = traveller.animate([
          { transform: "translate(0,0) rotate(0deg)" },
          { transform: `translate(${dx * .5}px,${dy * .5 - 12}px) rotate(-2deg)`, offset: .5 },
          { transform: `translate(${dx}px,${dy}px) rotate(0deg)` }
        ], { duration: 700, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
        const cleanup = () => { destination.style.visibility = ""; traveller.remove(); document.documentElement.classList.remove("guide-in-transit"); };
        journey.finished.then(cleanup, cleanup);
      }));
    }
    setPage(name);
    setMenu(false);
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function signIn() {
    await run(async () => {
      await api("auth/login", { email, ...(sent ? { token: code } : {}) });
      if (sent) {
        await refresh(true);
        setLoginOpen(false);
        setPage("Overview");
      } else setSent(true);
    });
  }
  async function playPreview(id: string) {
    if (preview === id) {
      audio.current?.pause();
      setPreview("");
      return;
    }
    await run(async () => {
      audio.current?.pause();
      setPreview("");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/voice/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice: id }),
        },
      );
      if (!response.ok) throw new Error((await response.json()).error);
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = URL.createObjectURL(await response.blob());
      audio.current = new Audio(audioUrl.current);
      audio.current.onended = () => setPreview("");
      await audio.current.play();
      setPreview(id);
    });
  }
  async function connect(rejoin = false) {
    await run(async () => {
      let local: LocalAudioTrack | undefined;
      let connectedRoom: Room | undefined;
      try {
        setCallState("Preparing");
        const { Room, RoomEvent, Track, createLocalAudioTrack } =
          await import("livekit-client");
        local = await createLocalAudioTrack();
        const connection = await api<{
          id: string;
          url: string;
          token: string;
        }>(
          rejoin ? "session/rejoin" : "session/start",
          rejoin ? { id: active?.id } : { acknowledged: true },
        );
        setCallState("Connecting");
        const r = new Room();
        connectedRoom = r;
        room.current = r;
        r.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio)
            audioArea.current?.appendChild(track.attach());
        });
        r.on(RoomEvent.TrackUnsubscribed, (track) =>
          track.detach().forEach((el) => el.remove()),
        );
        r.on(RoomEvent.Reconnecting, () => setCallState("Reconnecting"));
        r.on(RoomEvent.Reconnected, () => setCallState("Listening"));
        r.on(RoomEvent.Disconnected, () => {
          setConnected(false);
          setCallState("Reconnecting");
        });
        r.on(RoomEvent.ParticipantAttributesChanged, (_, p) => {
          const state = p.attributes["lk.agent.state"];
          if (state)
            setCallState(state.charAt(0).toUpperCase() + state.slice(1));
        });
        await r.connect(connection.url, connection.token);
        await r.startAudio();
        await r.localParticipant.publishTrack(local);
        setConnected(true);
        setCallState("Ready");
        await refresh();
      } catch (e) {
        local?.stop();
        await connectedRoom?.disconnect();
        room.current = null;
        setCallState("Failed");
        await refresh().catch(() => {});
        throw new Error(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Microphone access was refused. Allow microphone access in your browser and try again. Your test has not been reserved."
            : e instanceof Error
              ? e.message
              : "Voice connection failed.",
        );
      }
    });
  }
  async function end() {
    await run(async () => {
      if (active) await api("session/end", { id: active.id });
      await room.current?.disconnect();
      room.current = null;
      setCallState("Completed");
      await refresh();
      navigate("Demo Results");
    });
  }
  const allowance =
    active?.mode === "live"
      ? "Your voice test is in progress."
      : status?.repeatTests && !["reserved", "active"].includes(workspace?.entitlement.state || "")
        ? "Repeat testing enabled."
      : ["active", "consumed"].includes(workspace?.entitlement.state || "")
        ? "Your voice test has been used. Review your results and share feedback."
        : workspace?.entitlement.state === "reserved"
          ? "Your voice test is preparing."
          : "1 voice test available.";
  const remaining = active?.deadline
    ? Math.max(0, Math.ceil((new Date(active.deadline).getTime() - now) / 1000))
    : 180;
  const selectedVoice = voices.find(
    (v) => v.id === (workspace?.voice || configuration.voice),
  );
  const brand = (
    <div className="brand">
      <Image
        className="brand-logo"
        src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/rev3-logo.png`}
        width={39}
        height={39}
        alt="Rev3"
        priority
      />
      <div>
        <strong>
          REV3 <span>STUDIO</span>
        </strong>
        <small>Your voice. Your business.</small>
      </div>
    </div>
  );
  const messages = (
    <>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {success && (
        <div className="alert success" role="status">
          <Check size={17} />
          {success}
        </div>
      )}
    </>
  );
  if (loading)
    return (
      <main className="loading">
        {brand}
        <p>Opening Rev3 Studio…</p>
      </main>
    );
  if (!workspace)
    return (
      <div className="landing">
        <header>
          {brand}
          <button className="secondary" onClick={() => setLoginOpen(true)}>
            Sign in <ArrowUpRight size={16} />
          </button>
        </header>
        {messages}
        <main>
          <div className="landing-copy">
            <p className="eyebrow">
              <span className="live-dot" /> WELCOME TO REV3 STUDIO
            </p>
            <h1>
              Your business.
              <br />
              <em>Now with a voice.</em>
            </h1>
            <p className="landing-lead">
              Create an AI receptionist that sounds like you.
            </p>
            <p>
              Tell us about your business, choose a voice, then talk to your receptionist. We’ll guide you through each step.
            </p>
            <button className="primary" onClick={() => setLoginOpen(true)}>
              Enter the studio <ArrowRight size={18} />
            </button>
            <div className="landing-meta">
              <span>One personalised voice test</span>
              <span>Up to 3 minutes</span>
            </div>
          </div>
          <div className="landing-art">
            <div className="art-label">
              <AudioLines size={20} />
              <span>YOUR BUSINESS. YOUR VOICE.</span>
            </div>
            <div className="orbit">
              <span className="orbit-core">
                <Mic size={45} strokeWidth={1.2} />
              </span>
              <span className="orbit-note note-one">
                <MessageSquare size={16} /> Your ideas
              </span>
              <span className="orbit-note note-two">
                <Check size={16} /> A better next version
              </span>
            </div>
            <Wave />
            <div className="art-bottom">
              <span>SHAPE</span>
              <i />
              <span>TRY</span>
              <i />
              <span>REFLECT</span>
            </div>
          </div>
        </main>
        <section className="landing-bottom">
          <div>
            <span>01</span>
            <h3>Make it yours.</h3>
            <p>Tell us about any business and the calls you want help with.</p>
          </div>
          <div>
            <span>02</span>
            <h3>Have a conversation.</h3>
            <p>Choose a voice and explore one browser demo.</p>
          </div>
          <div>
            <span>03</span>
            <h3>Shape what’s next.</h3>
            <p>Tell us what worked, what didn’t and what you need.</p>
          </div>
        </section>
        <footer>
          You bring your business needs and feedback. Rev3 builds and improves
          the product.
          <br />
          <span>
            A co-creation demo. Live receptionist service is not activated.
          </span>
          <button className="text-button" onClick={() => setLoginOpen(true)}>
            Privacy & sign-in information
          </button>
        </footer>
        {loginOpen && (
          <div className="modal-backdrop">
            <section
              className="login-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="login-heading"
            >
              <button
                className="close icon-button"
                onClick={() => setLoginOpen(false)}
                aria-label="Close sign in"
              >
                <X />
              </button>
              <Badge>Rev3 Studio · Your voice. Your business.</Badge>
              <h2 id="login-heading">Let’s get you started.</h2>
              <p>
                Verify your email to save your setup, try your demo and share
                feedback.
              </p>
              {messages}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  signIn();
                }}
              >
                <Field
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  disabled={sent}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {sent && (
                  <Field
                    label="Your one-time email code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                )}
                <button className="primary full" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : sent
                      ? "Enter Rev3 Studio"
                      : "Email me a sign-in code"}
                  <ArrowRight size={17} />
                </button>
              </form>
              {sent && (
                <button
                  className="text-button"
                  onClick={() => {
                    setSent(false);
                    setCode("");
                  }}
                >
                  Use a different email or request another code
                </button>
              )}
              {status?.devAuth && (
                <button
                  className="secondary full"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("auth/development", {});
                      await refresh(true);
                      setLoginOpen(false);
                    })
                  }
                >
                  Open development simulation
                </button>
              )}
              <p className="privacy-small">
                One verified account receives one live test for this release.
                Email verification does not prove a unique person. Audio is
                processed by configured providers; transcripts and demo records
                are saved for 30 days by default. Use fictional customer
                details. A minimal keyed email hash is retained for this release
                to prevent repeat tests after deletion. Co-creation does not
                confer equity, ownership or a promise to implement suggestions.
              </p>
            </section>
          </div>
        )}
      </div>
    );
  return (
    <div className={`app-shell floating-studio ${["Overview", "Shape Your Receptionist", "Choose a Voice", "Your Voice Test", "Demo Results", "Connections", "Your Feedback"].includes(page) ? "orange-welcome" : ""} ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        {brand}
        <button className="sidebar-toggle icon-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Minimise sidebar"} aria-expanded={!collapsed}>{collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button>
        <div className="workspace-label">YOUR STUDIO JOURNEY</div>
        <nav aria-label="Main navigation">
          {navigation.map((item, i) => (
            <button
              key={item.name}
              title={item.name}
              aria-label={item.name}
              className={page === item.name ? "nav-item active" : "nav-item"}
              aria-current={page === item.name ? "page" : undefined}
              onClick={() => navigate(item.name)}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
              {(i === 1 && setupReady) ||
              (i === 2 && setupReady && workspace.voice) ||
              (i === 3 && workspace.entitlement.state === "consumed") ? (
                <Check className="nav-check" size={14} />
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="allowance-card">
            <span className="tiny-label">YOUR VOICE TEST</span>
            <strong>{allowance}</strong>
            <small>{status?.repeatTests ? "Repeat calls · 3 minutes each" : "One session · up to 3 minutes"}</small>
          </div>
          <button className="nav-item" onClick={() => navigate("Account")}>
            <Settings2 size={17} />
            <span>Account & privacy</span>
          </button>
          {workspace.user.admin && (
            <button
              className="nav-item"
              onClick={() =>
                run(async () => {
                  setAdminFeedback(
                    (await api<{ feedback: Feedback[] }>("admin/feedback"))
                      .feedback,
                  );
                  setFailedSessions(
                    (
                      await api<{
                        sessions: {
                          id: string;
                          state: string;
                          error: string;
                        }[];
                      }>("admin/sessions")
                    ).sessions,
                  );
                  navigate("Owner review");
                })
              }
            >
              <ShieldCheck size={17} />
              <span>Owner review</span>
            </button>
          )}
          <div className="account">
            <span className="avatar">
              {workspace.user.email.slice(0, 1).toUpperCase()}
            </span>
            <span title={workspace.user.email}>
              {workspace.user.email}
              <small>Co-creator</small>
            </span>
            <button
              aria-label="Log out"
              className="icon-button"
              onClick={() =>
                run(async () => {
                  await api("auth/logout", {});
                  await room.current?.disconnect();
                  setWorkspace(null);
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace-main">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setMenu(!menu)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="mobile-brand">
            Rev3 Studio<span>Your voice. Your business.</span>
          </div>
          <div className="breadcrumb">
            Studio <ChevronRight size={14} />
            <span>{page}</span>
          </div>
          <div className="topbar-actions">
            <span className="mode-label">
              <i />
              {status?.mode === "simulation"
                ? "Simulation mode"
                : "Co-creation release"}
            </span>
            <button
              className="secondary compact"
              onClick={() => navigate("Discuss a pilot")}
            >
              Discuss a pilot <ArrowUpRight size={15} />
            </button>
          </div>
        </header>
        <main id="main-content" className="content" tabIndex={-1}>
          {messages}
          {page === "Overview" && <StudioWelcome next={() => navigate("Shape Your Receptionist")} />}
          {page === "Shape Your Receptionist" && (
            <Setup
              value={configuration}
              change={setConfiguration}
              busy={busy}
              saved={
                !!workspace.configuration &&
                stableJson({
                  ...workspace.configuration.data,
                  voice: workspace.voice,
                }) === stableJson(configuration)
              }
              next={() => navigate("Choose a Voice")}
              compose={async (c) =>
                (
                  await api<{ prompt: string }>("prompt", {
                    description: c.description,
                    problems: c.problems,
                    other: c.otherProblem,
                  })
                ).prompt
              }
              generate={(prompt) =>
                api<Configuration>("configuration/generate", { prompt })
              }
              save={async () => {
                const result = await run(async () => {
                  const saved = await api<
                    NonNullable<Workspace["configuration"]>
                  >("configuration", configuration);
                  setWorkspace((previous) =>
                    previous
                      ? {
                          ...previous,
                          configuration: saved,
                          voice: saved.data.voice,
                        }
                      : previous,
                  );
                  setConfiguration(saved.data);
                  return true;
                }, "Your business details have been saved.");
                return result === true;
              }}
            />
          )}
          {page === "Choose a Voice" && (
            <div className="voice-playground">
              <div className="voice-guide-arrival"><div className="talking-orb voice-guide-orb"><svg className="guide-face" viewBox="0 0 80 40" aria-hidden="true"><ellipse fill="currentColor" cx="27" cy="17" rx="5" ry="7"/><ellipse fill="currentColor" cx="53" cy="17" rx="5" ry="7"/></svg><p>{preview ? "How does this sound?" : "Find your voice."}</p></div><div><p className="eyebrow">YOUR VOICE / 02</p><h1>Meet your voices.</h1><p className="voice-page-subtitle">Six voices. Choose your sound.</p></div></div>
              <div className="voice-grid">
                {[...featuredVoices, ...voices.filter(v => v.id === workspace.voice && !featuredVoices.some(f => f.id === v.id))].map((v, i) => (
                  <section
                    key={v.id}
                    className={`voice-bubble-card ${preview === v.id ? "is-speaking" : ""} ${workspace.voice === v.id ? "chosen" : ""}`}
                  >
                    <div className="voice-card-meta"><span>VOICE 0{i + 1}</span><span>{workspace.voice === v.id ? "✓ Your voice" : v.accent}</span></div>
                    <button className={`voice-character character-${i % 3}`} disabled={busy} onClick={() => playPreview(v.id)} aria-label={`${preview === v.id ? "Pause" : "Listen to"} ${v.name}`}>
                      <VoiceFace variant={i} />
                      <span>{preview === v.id ? "Speaking…" : "Tap to listen"}</span>
                    </button>
                    <h2>{v.name}</h2>
                    <p>
                      {v.language} <span className="dot-divider">·</span>{" "}
                      {v.accent}
                    </p>
                    <p className="voice-style">{v.style}</p>
                    <div className="voice-actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        aria-label={`${preview === v.id ? "Stop listening to" : "Listen to sample from"} ${v.name}`}
                        onClick={() => playPreview(v.id)}
                      >
                        {preview === v.id ? (
                          <Pause size={16} />
                        ) : (
                          <Play size={16} />
                        )}
                        {preview === v.id ? "Stop listening" : "Listen"}
                      </button>
                      <button
                        className={
                          workspace.voice === v.id
                            ? "selected-button"
                            : "text-button"
                        }
                        disabled={busy || !!active}
                        onClick={() =>
                          run(async () => {
                            await api("voice", { voice: v.id });
                            setConfiguration((c) => ({ ...c, voice: v.id }));
                            await refresh();
                          }, `${v.name} selected.`)
                        }
                      >
                        {workspace.voice === v.id ? "✓ Selected" : "Use this voice"}
                        {workspace.voice !== v.id && <ArrowRight size={16} />}
                      </button>
                    </div>
                  </section>
                ))}
              </div>
              <div className="form-footer">
                <p className="small muted">
                  Your voice: {voices.find(v => v.id === workspace.voice)?.name || "Choose one above"}
                </p>
                <button
                  className="primary"
                  onClick={() => navigate("Your Voice Test")}
                >
                  Continue to your test <ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}
          {page === "Your Voice Test" && (
            <div className="phone-studio">
              <header className="phone-page-heading"><p className="eyebrow">YOUR FIRST CALL / 03</p><h1>Let’s talk.</h1></header>
              <div className="phone-guide"><div className="talking-orb"><svg className="guide-face" viewBox="0 0 80 40" aria-hidden="true"><ellipse fill="currentColor" cx="27" cy="17" rx="5" ry="7"/><ellipse fill="currentColor" cx="53" cy="17" rx="5" ry="7"/></svg><p>{active ? "I’m listening. What would you like to ask?" : "Pick up the phone to talk to your agent."}</p></div></div>
              <div className="test-grid">
                <section className="card call-card">
                  <div className="section-header">
                    {status?.mode === "simulation" && <Badge>Simulation · no voice call</Badge>}
                    <span className="timer">
                      {String(Math.floor(remaining / 60)).padStart(2, "0")}:
                      {String(remaining % 60).padStart(2, "0")}
                    </span>
                  </div>
                  {active && <StudioPhone lifted /> }
                  {active && <p className="minimal-call-status" role="status">{callState}</p>}
                  {!active && (
                    <>
                      {status?.mode === "live" && status.liveUnavailable && (
                        <Notice>
                          {status.liveUnavailable} Your available test has not
                          been used.
                        </Notice>
                      )}
                      {!setupReady && (
                        <Notice>
                          Complete and save: {setupMissing.join(", ")}.{" "}
                          <button
                            className="text-button"
                            onClick={() => navigate("Shape Your Receptionist")}
                          >
                            Review business setup <ArrowRight size={16} />
                          </button>
                        </Notice>
                      )}
                      <p className="phone-start-disclosure">Picking up starts your call and saves the conversation and results.</p>
                      {status?.mode === "live" ? (
                        <button
                          className="phone-start"
                          aria-label="Pick up the phone to start your three-minute test"
                          disabled={
                            busy ||
                            !setupReady ||
                            !!status.liveUnavailable ||
                            (status.repeatTests ? ["active", "reserved"] : ["active", "consumed", "reserved"]).includes(
                              workspace.entitlement.state,
                            )
                          }
                          onClick={() => connect()}
                        >
                          <StudioPhone />
                          <span>{busy ? "Connecting…" : "Pick up the phone"}</span>
                          <small>Allow microphone access when asked</small>
                        </button>
                      ) : (
                        <button
                          className="primary full"
                          disabled={busy || !setupReady}
                          onClick={() =>
                            run(async () => {
                              await api("simulation/start", {});
                              await refresh();
                              setCallState("Simulation ready");
                            })
                          }
                        >
                          Start workflow simulation <ArrowRight size={17} />
                        </button>
                      )}
                    </>
                  )}
                  {active && (
                    <div className="call-controls">
                      {active.mode === "live" &&
                        (connected ? (
                          <button
                            className="secondary"
                            onClick={() =>
                              run(async () => {
                                await room.current?.localParticipant.setMicrophoneEnabled(
                                  muted,
                                );
                                setMuted(!muted);
                              })
                            }
                          >
                            {muted ? <MicOff size={18} /> : <Mic size={18} />}{" "}
                            {muted ? "Unmute" : "Mute"}
                          </button>
                        ) : (
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() => connect(true)}
                          >
                            Rejoin same test
                          </button>
                        ))}
                      <button className="danger" disabled={busy} onClick={end}>
                        <Square size={16} /> End
                      </button>
                    </div>
                  )}
                  {active?.mode === "simulation" && (
                    <div className="simulation-tools">
                      <Area
                        label="Fictional enquiry to save"
                        value={simulationDetails}
                        onChange={(e) => setSimulationDetails(e.target.value)}
                      />
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api("simulation/action", {
                              id: active.id,
                              tool: {
                                name: "capture_enquiry",
                                key: crypto.randomUUID(),
                                args: {
                                  customer: "Fictional customer",
                                  contact: "demo@example.test",
                                  details: simulationDetails,
                                },
                              },
                            });
                            await refresh();
                          }, "Demo enquiry saved. View it in Demo Results.")
                        }
                      >
                        Save simulated enquiry
                      </button>
                      <p className="small">
                        This writes a real demo record. No speech or caller
                        transcript is simulated.
                      </p>
                    </div>
                  )}
                  <div ref={audioArea} />
                  <button
                    className="text-button"
                    hidden={!active || active.mode !== "live"}
                    onClick={() => room.current?.startAudio()}
                  >
                    Enable audio playback <Volume2 size={15} />
                  </button>
                </section>
                <aside className="test-sidebar">
                  <section className="card">
                    <h3>Your call, at a glance</h3>
                    <dl>
                      <dt>Business</dt>
                      <dd>
                        {workspace.configuration?.data.businessName ||
                          "Not configured"}
                      </dd>
                      <dt>Voice</dt>
                      <dd>
                        {selectedVoice?.name} · {selectedVoice?.accent}
                      </dd>
                      <dt>Tasks</dt>
                      <dd>
                        {workspace.configuration?.data.tasks.join(", ") ||
                          "Review your setup first"}
                      </dd>
                      <dt>Test access</dt>
                      <dd>{allowance}</dd>
                      <dt>Call length</dt><dd>Up to 3 minutes</dd>
                    </dl>
                    <button
                      className="text-button"
                      onClick={() => navigate("Shape Your Receptionist")}
                    >
                      Review setup <ArrowRight size={16} />
                    </button>
                  </section>
                  <section className="note-card">
                    <h3>What will you ask?</h3>
                    <p>
                      Ask a question you supplied in your FAQs. Leave an
                      enquiry, request a callback, or try a demo booking if you
                      enabled appointments.
                    </p>
                    <p className="small">
                      {status?.repeatTests ? "Each call ends after 3 minutes. You can start another call when it finishes." : "The call ends automatically after 3 minutes. Ending early still uses the test once the receptionist starts speaking. A brief reconnect uses the same deadline."}
                    </p>
                  </section>
                </aside>
              </div>
              {status?.liveUnavailable && (
                <Notice>{status.liveUnavailable}</Notice>
              )}
            </div>
          )}
          {page === "Demo Results" && (
            <div className="results-scene">
              <header className="results-guide-intro">
                <div className="talking-orb results-guide-orb"><svg className="guide-face" viewBox="0 0 80 40" aria-hidden="true"><ellipse fill="currentColor" cx="27" cy="17" rx="5" ry="7"/><ellipse fill="currentColor" cx="53" cy="17" rx="5" ry="7"/></svg><p>{current ? "Nice work giving it a go!" : "Your recap will appear here."}</p></div>
                <div className="results-guide-speech"><p className="eyebrow">YOUR CALL / THE RECAP</p><h1>Here’s what happened.</h1><p>{current ? "A quick look at your call." : "Once we’ve talked, I’ll bring your results here."}</p></div>
              </header>
              {!current ? <section className="card"><h2>No calls yet.</h2><p>Make your first call to see your recap.</p><button className="primary" onClick={()=>navigate("Your Voice Test")}>Go to the phone <ArrowRight size={16}/></button></section> : <section className="recap-content card">
                <div className="section-header"><h2>Your conversation at a glance</h2><Badge>{current.state.replaceAll("_"," ")}</Badge></div>
                {current.error && <Notice>{current.error}</Notice>}
                <p className="small muted">A brief view of the saved conversation. Responses are shortened; action outcomes appear separately below.</p>
                <div className="recap-table-scroll"><table className="recap-table"><thead><tr><th scope="col">You asked</th><th scope="col">The key point</th></tr></thead><tbody>
                {workspace.turns.filter(t=>t.session_id===current.id && t.role==="user").map(t=>{
                  const turns=workspace.turns.filter(x=>x.session_id===current.id);
                  const index=turns.findIndex(x=>x.id===t.id);
                  const following=turns[index+1];
                  const answer=following && following.role!=="user" ? following.text : "No response was saved for this question.";
                  const brief=(text:string)=>{const clean=text.replace(/\s+/g," ").trim();const sentence=clean.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || clean;return sentence.length>220?sentence.slice(0,217)+"…":sentence;};
                  return <tr key={t.id}><td>{brief(t.text)}</td><td>{brief(answer)}</td></tr>;
                })}
                {!workspace.turns.some(t=>t.session_id===current.id&&t.role==="user")&&<tr><td colSpan={2}>No caller questions were saved for this call.</td></tr>}
                </tbody></table></div>
                <SentimentReport turns={workspace.turns.filter(t=>t.session_id===current.id)}/>
                <h3 className="recap-actions-title">What your agent did</h3>
                {workspace.actions.some(a=>a.session_id===current.id)?<div className="recap-table-scroll"><table className="recap-table"><thead><tr><th scope="col">Action</th><th scope="col">Outcome</th><th scope="col">Status</th></tr></thead><tbody>{workspace.actions.filter(a=>a.session_id===current.id).map(a=><tr key={a.id}><td>{a.name.replaceAll("_"," ")}</td><td>{a.result.message || "No additional detail recorded."}</td><td>{a.status.replaceAll("_"," ")}</td></tr>)}</tbody></table></div>:<p>No actions were recorded for this call.</p>}
              </section>}
              <div className="form-footer"><p>Next, a little feedback on the tools you use.</p><button className="primary" onClick={()=>navigate("Connections")}>Next: your tools <ArrowRight size={16}/></button></div>
            </div>
          )}
          {page === "Connections" && (
            <div className="guided-tools" key="tools">
              <header className="step-guide-header"><div className="talking-orb"><svg className="guide-face" viewBox="0 0 80 40" aria-hidden="true"><ellipse fill="currentColor" cx="27" cy="17" rx="5" ry="7"/><ellipse fill="currentColor" cx="53" cy="17" rx="5" ry="7"/></svg><p>Which tools do you work with?</p></div><div><p className="eyebrow">YOUR TOOLS / 05</p><h1>Tell us about your tools.</h1><p>Help us plan future connections.</p></div></header>
              <form className="glass-setup-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api("connections",connections);await refresh();navigate("Your Feedback");},"Your tool preferences are saved.");}}>
                <ToolChoices label="CRM" options={["HubSpot","Salesforce","Zoho","Pipedrive","None"]} value={connections.crm} change={crm=>setConnections({...connections,crm})}/>
                <ToolChoices label="Booking system" options={["Calendly","Google Calendar","Microsoft Bookings","Fresha","Square Appointments","None"]} value={connections.calendar} change={calendar=>setConnections({...connections,calendar})}/>
                <ToolChoices label="Messaging" options={["Email","SMS","WhatsApp","Microsoft Teams","None"]} value={connections.messaging} change={messaging=>setConnections({...connections,messaging})}/>
                <p className="small">These choices are part of your feedback. Tell us what you use so we can explore connecting it later. Nothing is connected now.</p>
                <button className="primary" disabled={busy}>{busy?"Saving…":"Save & next"}<ArrowRight size={16}/></button>
              </form>
            </div>
          )}
          {page === "Your Feedback" && (
            <div className="guided-feedback" key="feedback">
              <header className="step-guide-header"><div><p className="eyebrow">YOUR FEEDBACK / 06</p><h1>How was your agent?</h1><p>A few taps. One final thought.</p></div><div className="talking-orb"><svg className="guide-face" viewBox="0 0 80 40" aria-hidden="true"><ellipse fill="currentColor" cx="27" cy="17" rx="5" ry="7"/><ellipse fill="currentColor" cx="53" cy="17" rx="5" ry="7"/></svg><p>What could your agent do better?</p></div></header>
              <div className="setup-grid"><section className="glass-setup-form">
                <form onSubmit={e=>{e.preventDefault();void run(async()=>{await api("feedback",feedback);await refresh();setFeedback({...emptyFeedback,sessionId:current?.id});},"Thank you. Your feedback is saved.");}}>
                  <fieldset><legend>Did your agent help?</legend><div className="choice-pills">{([['yes','Yes'],['partly','Partly'],['no','No'],['not-tested','Not tried yet']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={feedback.completed===value} onClick={()=>setFeedback({...feedback,completed:value})}>{label}</button>)}</div></fieldset>
                  <Rating label="Did it understand you?" value={feedback.understood} onChange={understood=>setFeedback({...feedback,understood})}/>
                  <Rating label="How natural did it sound?" value={feedback.natural} onChange={natural=>setFeedback({...feedback,natural})}/>
                  <fieldset><legend>What needs attention?</legend><div className="choice-pills">{([['none','All good'],['audio','Voice or sound'],['connection','Connection'],['understanding','Understanding me'],['action','Getting things done'],['other','Something else']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={feedback.failureCategory===value} onClick={()=>setFeedback({...feedback,failureCategory:value})}>{label}</button>)}</div></fieldset>
                  <Area label="Anything else? (optional)" placeholder="One thing you’d keep or change…" maxLength={2000} value={feedback.change} onChange={e=>setFeedback({...feedback,change:e.target.value})}/>
                  <button className="primary" disabled={busy}>{busy?"Saving…":feedback.id?"Save changes":"Send feedback"}<ArrowRight size={16}/></button>
                </form>
              </section>
                <aside>
                  <div className="note-card">
                    <MessageSquare size={26} />
                    <h3>Your feedback so far.</h3>
                    <p>
                      You can come back, add a thought or change your response.
                    </p>
                  </div>
                  {workspace.feedback.map((f) => (
                    <section className="card feedback-entry" key={f.id}>
                      <small>{formatDate(f.created_at)}</small>
                      <h3>{f.data.goal || "General feedback"}</h3>
                      <p>
                        {f.data.change ||
                          f.data.needs ||
                          f.data.confusing ||
                          "Ratings saved."}
                      </p>
                      <Badge>Task: {f.data.completed}</Badge>
                      <button
                        className="text-button"
                        onClick={() => {
                          setFeedback({ ...f.data, id: f.id });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Edit feedback <ArrowRight size={16} />
                      </button>
                    </section>
                  ))}
                </aside>
              </div>
            </div>
          )}
          {page === "Discuss a pilot" && (
            <>
              <Heading
                eyebrow="A possible next step"
                title="Let’s discuss your business."
              >
                A pilot would be agreed separately, including tasks,
                connections, pricing and readiness checks.
              </Heading>
              <section className="card narrow">
                <PilotForm
                  email={workspace.user.email}
                  name={configuration.businessName}
                  busy={busy}
                  submit={(data) =>
                    run(async () => {
                      await api("pilot", data);
                      await refresh();
                    }, "Your pilot interest is saved. Submitting does not activate a service. No external notification has been sent.")
                  }
                />
                {workspace.pilots.length > 0 && (
                  <p className="small muted">
                    {workspace.pilots.length} pilot request
                    {workspace.pilots.length === 1 ? "" : "s"} saved in your
                    workspace.
                  </p>
                )}
              </section>
            </>
          )}
          {page === "Account" && (
            <>
              <Heading
                eyebrow="Your data, your choices"
                title="Account & privacy."
              >
                Manage your co-creation workspace and understand what is saved.
              </Heading>
              <section className="card narrow">
                <h2>{workspace.user.email}</h2>
                <Badge>
                  {workspace.user.development
                    ? "Development simulation account : email not verified"
                    : "Verified email account"}
                </Badge>
                <p>
                  During voice calls, audio is processed by our voice connection, speech and
                  AI service providers. Raw audio is not recorded by this
                  application.
                </p>
                <p>
                  Transcripts, business configuration and call records are
                  stored with a default 30-day retention period. You can delete
                  your saved data or your account here. No UK or EU data-residency
                  guarantee is made.
                </p>
                <Notice>
                  A minimal keyed email hash and test entitlement are retained
                  for the lifetime of this co-creation release, then removed
                  within 90 days of release closure. Deleting data, deleting an
                  account, or signing out does not restore a used voice test.
                  This record is separate from transcripts and business data.
                </Notice>
                <p className="small">
                  Email verification confirms access to an address, not a unique
                  human. Co-creation does not grant equity or ownership in Rev3
                  and does not guarantee that a suggestion will be implemented.
                </p>
                <h3>Delete your data</h3>
                <Field
                  label="Type DELETE to confirm"
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  autoComplete="off"
                />
                <div className="button-row">
                  <button
                    className="danger"
                    disabled={deleteText !== "DELETE" || busy}
                    onClick={() =>
                      run(async () => {
                        await api("delete", {
                          confirmation: deleteText,
                          account: false,
                        });
                        setDeleteText("");
                        await refresh(true);
                      }, "Saved data deleted. Your test access record is unchanged.")
                    }
                  >
                    Delete saved data
                  </button>
                  <button
                    className="danger"
                    disabled={deleteText !== "DELETE" || busy}
                    onClick={() =>
                      run(async () => {
                        await api("delete", {
                          confirmation: deleteText,
                          account: true,
                        });
                        setWorkspace(null);
                      })
                    }
                  >
                    Delete account
                  </button>
                </div>
              </section>
            </>
          )}
          {page === "Owner review" && workspace.user.admin && (
            <>
              <Heading
                eyebrow="Owner access"
                title="Listen to your co-creators."
              >
                Review applications, enquiries, feedback and technical failures.
              </Heading>
              <OwnerEnquiries/>
              <section className="card">
                <div className="form-grid">
                  {Object.keys(adminFilters).map((k) => (
                    <Field
                      key={k}
                      label={`Filter by ${k}`}
                      value={adminFilters[k as keyof typeof adminFilters]}
                      onChange={(e) =>
                        setAdminFilters({
                          ...adminFilters,
                          [k]: e.target.value,
                        })
                      }
                    />
                  ))}
                </div>
                <Link
                  className="secondary"
                  href="/api/admin/export"
                  download
                  prefetch={false}
                >
                  Export feedback CSV
                </Link>
                {adminFeedback
                  .filter(
                    (f) =>
                      f.category
                        .toLowerCase()
                        .includes(adminFilters.category.toLowerCase()) &&
                      f.voice.includes(adminFilters.voice) &&
                      f.problems
                        .join(" ")
                        .toLowerCase()
                        .includes(adminFilters.problem.toLowerCase()) &&
                      String(f.data.understood).includes(adminFilters.rating) &&
                      f.data.completed.includes(adminFilters.completed) &&
                      f.data.failureCategory.includes(adminFilters.failure),
                  )
                  .map((f) => (
                    <article className="record" key={f.id}>
                      <h3>
                        {f.email} · {f.category}
                      </h3>
                      <p>{f.data.goal}</p>
                      <p>{f.data.change}</p>
                      <small>
                        {f.voice} · understood {f.data.understood}/5 · task{" "}
                        {f.data.completed} · {f.data.failureCategory}
                      </small>
                    </article>
                  ))}
              </section>
              <section className="card">
                <h2>Audited technical-failure reset</h2>
                {failedSessions.map((s) => (
                  <div className="record" key={s.id}>
                    <strong>{s.state}</strong>
                    <p>{s.error}</p>
                    <button
                      className="text-button"
                      onClick={() => setResetSession(s.id)}
                    >
                      Review session {s.id}
                    </button>
                  </div>
                ))}
                <Field
                  label="Failed session ID"
                  value={resetSession}
                  onChange={(e) => setResetSession(e.target.value)}
                />
                <Area
                  label="Evidence and reason (at least 20 characters)"
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                />
                <label className="acknowledgement">
                  <input
                    type="checkbox"
                    checked={resetVerified}
                    onChange={(e) => setResetVerified(e.target.checked)}
                  />
                  I have verified a technical failure, rather than an early
                  voluntary end.
                </label>
                <button
                  className="danger"
                  disabled={!resetVerified || busy}
                  onClick={() =>
                    run(
                      () =>
                        api("admin/reset", {
                          sessionId: resetSession,
                          reason: resetReason,
                          verifiedTechnicalFailure: true,
                        }),
                      "Reset audited and saved.",
                    )
                  }
                >
                  Reset failed test entitlement
                </button>
              </section>
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>REV3 : VOICE TECHNOLOGY</span>
          <span>Rev3 Studio · Your voice. Your business.</span>
        </footer>
      </div>
    </div>
  );
}
function Rating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className="rating">
      <legend>{label}</legend>
      <div>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={value === n ? "selected" : ""}>
            <input
              type="radio"
              name={label}
              checked={value === n}
              onChange={() => onChange(n)}
            />
            {n}
          </label>
        ))}
      </div>
      <small>
        1 : Not at all <span>5 : Very much</span>
      </small>
    </fieldset>
  );
}
function PilotForm({
  email,
  name,
  busy,
  submit,
}: {
  email: string;
  name: string;
  busy: boolean;
  submit: (data: unknown) => Promise<unknown>;
}) {
  const [form, setForm] = useState({
    businessName: name,
    contactName: "",
    phone: "",
    description: "",
    callVolume: "",
    mainProblem: "",
    systems: "",
    contactTime: "",
    permission: false,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <div className="form-grid">
        <Field
          label="Business name"
          value={form.businessName}
          required
          onChange={(e) => setForm({ ...form, businessName: e.target.value })}
        />
        <Field
          label="Contact name"
          value={form.contactName}
          required
          onChange={(e) => setForm({ ...form, contactName: e.target.value })}
        />
        <Field label="Verified account email" value={email} readOnly />
        <Field
          label="Phone (optional)"
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </div>
      <Area
        label="Business description"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <Field
        label="Approximate call volume"
        placeholder="For example, 20 calls a week"
        value={form.callVolume}
        onChange={(e) => setForm({ ...form, callVolume: e.target.value })}
      />
      <Area
        label="Main problem"
        value={form.mainProblem}
        onChange={(e) => setForm({ ...form, mainProblem: e.target.value })}
      />
      <Area
        label="Required systems"
        value={form.systems}
        onChange={(e) => setForm({ ...form, systems: e.target.value })}
      />
      <Field
        label="Preferred contact time"
        value={form.contactTime}
        onChange={(e) => setForm({ ...form, contactTime: e.target.value })}
      />
      <label className="acknowledgement">
        <input
          type="checkbox"
          required
          checked={form.permission}
          onChange={(e) => setForm({ ...form, permission: e.target.checked })}
        />
        I give Rev3 permission to contact me about this pilot request.
      </label>
      <button className="primary" disabled={busy}>
        Save pilot interest <ArrowUpRight size={17} />
      </button>
      <p className="privacy-small">
        Submitting this request does not activate a receptionist service or send
        external notifications.
      </p>
    </form>
  );
}
