"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { db, auth, googleProvider } from "./lib/firebase";
import { ref, get, set, update, onValue, off } from "firebase/database";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

import { geography } from "./data/geography";
import { science } from "./data/science";
import { history } from "./data/history";
import { math } from "./data/math";
import { sports } from "./data/sports";
import { entertainment } from "./data/entertainment";

// Normalize solo questions (wrong -> w) to unified shape
const toQ = (arr: any[]) =>
  arr.map((x) => ({ q: x.q, a: x.a, w: x.w ?? x.wrong ?? [] }));

const CATEGORY_MAP: Record<string, { label: string; emoji: string; questions: any[] }> = {
  all:           { label: "All Categories",  emoji: "🌎", questions: [...geography, ...science, ...history, ...math, ...sports, ...entertainment] },
  geography:     { label: "Geography",       emoji: "🗺️", questions: geography },
  science:       { label: "Science",         emoji: "🔬", questions: science },
  history:       { label: "History",         emoji: "📜", questions: history },
  math:          { label: "Math",            emoji: "🔢", questions: math },
  sports:        { label: "Sports",          emoji: "⚽", questions: sports },
  entertainment: { label: "Entertainment",   emoji: "🎬", questions: entertainment },
};

const ROUND_SIZES = [10, 20, 30];
// timer speed options
const TIMER_OPTIONS = [
  { label: "3s",  value: 3 },
  { label: "5s",  value: 5 },
  { label: "10s", value: 10 },
  { label: "15s", value: 15 },
  { label: "∞",   value: 0 },
];

function shuffle(arr: any[]): any[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Firebase global leaderboard ──────────────────────────────────────────────
async function saveToGlobalLB(name: string, score: number, streak: number, category: string) {
  try {
    const lbRef = ref(db, "leaderboard");
    const snap = await get(lbRef);
    const existing: any[] = snap.exists() ? Object.values(snap.val()) : [];
    // Only save if it's a personal best for this name
    const prev = existing.find((e) => e.name === name);
    if (prev && prev.score >= score) return;
    const key = name.replace(/[.#$[\]]/g, "_");
    await set(ref(db, `leaderboard/${key}`), { name, score, streak, category, date: new Date().toLocaleDateString() });
  } catch {}
}

export default function Home() {
  const [screen, setScreen] = useState("home");
  const [questions, setQuestions] = useState<any[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(3);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [showStreak, setShowStreak] = useState(false);
  const [name, setName] = useState("");
  const [anim, setAnim] = useState("");
  const [globalLB, setGlobalLB] = useState<any[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [modal, setModal] = useState<"about"|"updates"|null>(null);

  // Settings
  const [category, setCategory] = useState("all");
  const [roundSize, setRoundSize] = useState(20);
  const [timerDuration, setTimerDuration] = useState(3);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerRef = useRef(false);
  const resultsRef = useRef({ score: 0, correct: 0, total: 0, bestStreak: 0, category: "all" });

  // Live refs so timer closure always reads latest values
  const gameStateRef = useRef({ streak: 0, bestStreak: 0, score: 0, correct: 0, total: 0, category: "all", timerDuration: 3 });

  // Load name from localStorage
  useEffect(() => {
    try {
      setName(localStorage.getItem("onetap_name") || "");
      const savedCat = localStorage.getItem("onetap_category");
      if (savedCat && CATEGORY_MAP[savedCat]) setCategory(savedCat);
      const savedSize = localStorage.getItem("onetap_round");
      if (savedSize) setRoundSize(Number(savedSize));
      const savedTimer = localStorage.getItem("onetap_timer");
      if (savedTimer !== null) setTimerDuration(Number(savedTimer));
    } catch {}
  }, []);

  // Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u && !name) {
        const displayName = u.displayName?.split(" ")[0] || u.email?.split("@")[0] || "";
        setName(displayName);
        try { localStorage.setItem("onetap_name", displayName); } catch {}
      }
    });
    return () => unsub();
  }, []);

  // Footer modal event listener
  useEffect(() => {
    const handler = (e: Event) => setModal((e as CustomEvent).detail);
    window.addEventListener("onetap-modal", handler);
    return () => window.removeEventListener("onetap-modal", handler);
  }, []);

  // Subscribe to global leaderboard
  useEffect(() => {
    const lbRef = ref(db, "leaderboard");
    const unsub = onValue(lbRef, (snap) => {
      if (!snap.exists()) return;
      const entries: any[] = Object.values(snap.val());
      setGlobalLB(entries.sort((a, b) => b.score - a.score).slice(0, 10));
    });
    return () => off(lbRef);
  }, []);

  const endGame = useCallback(
    (finalScore: number, finalBest: number, finalCorrect: number, finalTotal: number, finalCat: string) => {
      if (timerRef.current) clearInterval(timerRef.current);
      resultsRef.current = { score: finalScore, correct: finalCorrect, total: finalTotal, bestStreak: finalBest, category: finalCat };
      const lbName = user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || name || "Anonymous";
      saveToGlobalLB(lbName, finalScore, finalBest, finalCat);
      setScore(finalScore);
      setCorrect(finalCorrect);
      setTotal(finalTotal);
      setBestStreak(finalBest);
      setScreen("result");
    },
    [name]
  );

  const handleAnswer = useCallback(
    (ans: string, qs: any[], idx: number) => {
      if (answerRef.current) return;
      answerRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      setSelected(ans);
      const { streak: curStreak, score: curScore, correct: curCorrect, total: curTotal, bestStreak: curBest, category: curCat } = gameStateRef.current;
      const isCorrect = ans === qs[idx].a;
      const newStreak = isCorrect ? curStreak + 1 : 0;
      const newScore = isCorrect ? curScore + 10 + Math.min(newStreak, 5) * 10 : curScore;
      const newCorrect = isCorrect ? curCorrect + 1 : curCorrect;
      const newTotal = curTotal + 1;
      const newBest = Math.max(newStreak, curBest);
      // Update ref immediately so next call sees latest values
      gameStateRef.current = { streak: newStreak, bestStreak: newBest, score: newScore, correct: newCorrect, total: newTotal, category: curCat, timerDuration: gameStateRef.current.timerDuration };
      setStreak(newStreak);
      setAnim(isCorrect ? "pop" : "shake");
      if (isCorrect && newStreak > 1) {
        setShowStreak(true);
        setTimeout(() => setShowStreak(false), 900);
      }
      setTimeout(() => {
        if (idx + 1 >= qs.length) {
          endGame(newScore, newBest, newCorrect, newTotal, curCat);
        } else {
          const next = qs[idx + 1];
          setQIndex(idx + 1);
          setOptions(shuffle([next.a, ...next.w]));
          setSelected(null);
          const td = gameStateRef.current.timerDuration; setTimeLeft(td === 0 ? 99 : td);
          setAnim("");
          answerRef.current = false;
        }
      }, 800);
    },
    [endGame]
  );

  useEffect(() => {
    if (screen !== "game" || selected !== null) return;
    if (gameStateRef.current.timerDuration === 0) return; // no timer mode
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleAnswer("__timeout__", questions, qIndex);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, qIndex, selected, questions, handleAnswer]);

  function startGame(cat = category, size = roundSize, timer = timerDuration) {
    const pool = toQ(CATEGORY_MAP[cat]?.questions ?? CATEGORY_MAP.all.questions);
    const qs = shuffle(pool).slice(0, size);
    const firstOpts = shuffle([qs[0].a, ...qs[0].w]);
    gameStateRef.current = { streak: 0, bestStreak: 0, score: 0, correct: 0, total: 0, category: cat, timerDuration: timer };
    setQuestions(qs);
    setQIndex(0);
    setOptions(firstOpts);
    setSelected(null);
    setTimeLeft(timer === 0 ? 99 : timer);
    setStreak(0);
    setBestStreak(0);
    setScore(0);
    setCorrect(0);
    setTotal(0);
    setAnim("");
    answerRef.current = false;
    setScreen("game");
  }

  const q = questions[qIndex];
  const pct = (qIndex / (questions.length || 1)) * 100;
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

  // ── MODALS ──────────────────────────────────────────────────────────────
  const Modal = ({ type }: { type: "about"|"updates" }) => (
    <div
      onClick={() => setModal(null)}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:20, padding:"28px 24px", width:"100%", maxWidth:400, position:"relative", color:"#fff" }}
      >
        <button
          onClick={() => setModal(null)}
          style={{ position:"absolute", top:14, right:16, background:"transparent", border:"none", color:"#6b7280", fontSize:20, cursor:"pointer", lineHeight:1 }}
        >×</button>

        {type === "about" && (<>
          <div style={{ fontSize:"1.4rem", fontWeight:900, marginBottom:16 }}>⚡ About</div>
          <p style={{ color:"#d1d5db", lineHeight:1.7, marginBottom:12 }}>
            <strong style={{ color:"#f59e0b" }}>QuicTriv</strong> is a fast-paced trivia game built for people who hate slow trivia games. 3 seconds. One tap. No mercy.
          </p>
          <p style={{ color:"#d1d5db", lineHeight:1.7, marginBottom:12 }}>
            Play solo across 6 categories — Geography, Science, History, Math, Sports, and Entertainment — or go head-to-head with friends in real-time multiplayer.
          </p>
          <p style={{ color:"#d1d5db", lineHeight:1.7, marginBottom:20 }}>
            Built with Next.js, Firebase, and a lot of caffeine. Free to play, no ads, no nonsense.
          </p>
          <div style={{ borderTop:"1px solid #2d2d44", paddingTop:16, fontSize:13, color:"#4b5563" }}>
            Made by chris0622ha · 2025
          </div>
        </>)}

        {type === "updates" && (<>
          <div style={{ fontSize:"1.4rem", fontWeight:900, marginBottom:16 }}>🆕 Updates</div>
          {[
            { version:"v1.3", date:"Jun 2025", items:["Google sign-in added", "About & Updates modals"] },
            { version:"v1.2", date:"Jun 2025", items:["Global Firebase leaderboard (live across all players)", "Bug fix: result screen showing 0/total"] },
            { version:"v1.1", date:"Jun 2025", items:["Category picker (Geography, Science, History, Math, Sports, Entertainment)", "Round size selector: 10 / 20 / 30 questions", "Play Again now replays same category & round size"] },
            { version:"v1.0", date:"Jun 2025", items:["Initial launch: solo mode + real-time multiplayer", "3-second timer, streak bonuses, leaderboard"] },
          ].map(({ version, date, items }) => (
            <div key={version} style={{ marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6 }}>
                <span style={{ color:"#f59e0b", fontWeight:800, fontSize:14 }}>{version}</span>
                <span style={{ color:"#4b5563", fontSize:12 }}>{date}</span>
              </div>
              {items.map(item => (
                <div key={item} style={{ color:"#d1d5db", fontSize:13, lineHeight:1.6, paddingLeft:12, borderLeft:"2px solid #2d2d44", marginBottom:3 }}>
                  {item}
                </div>
              ))}
            </div>
          ))}
        </>)}
      </div>
    </div>
  );

  // ── AUTH HEADER ─────────────────────────────────────────────────────────
  const AuthHeader = () => (
    <div style={{ position: "fixed", top: 0, right: 0, padding: "12px 16px", zIndex: 200, display: "flex", alignItems: "center", gap: 10 }}>
      {authLoading ? null : user ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {user.photoURL && (
            <img src={user.photoURL} alt="" width={30} height={30}
              style={{ borderRadius: "50%", border: "2px solid #f59e0b" }} />
          )}
          <span style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 600, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.displayName?.split(" ")[0] || user.email?.split("@")[0]}
          </span>
          <button
            onClick={() => signOut(auth)}
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid #2d2d44", borderRadius: 8, color: "#9ca3af", fontSize: 12, fontWeight: 600, padding: "5px 12px", cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <button
          onClick={async () => {
            try { await signInWithPopup(auth, googleProvider); } catch {}
          }}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "none", borderRadius: 8, color: "#1f2937", fontSize: 13, fontWeight: 700, padding: "8px 14px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}
        >
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.7 29.3 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.1-2.7-.4-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 16.3 3 9.7 7.9 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 45c5.3 0 10.2-1.9 13.9-5.1l-6.4-5.4C29.6 36.1 26.9 37 24 37c-5.2 0-9.6-3.3-11.3-8H6.2C9.5 38.9 16.2 45 24 45z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.4 5.4C41.2 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Log in / Sign up
        </button>
      )}
    </div>
  );

  // ── LEADERBOARD WIDGET ───────────────────────────────────────────────────
  const LeaderboardView = () =>
    globalLB.length > 0 ? (
      <div style={{ width: "100%", maxWidth: 400, background: "#1a1a2e", borderRadius: 16, padding: "20px" }}>
        <div style={{ fontSize: 13, color: "#f59e0b", marginBottom: 14, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>
          🏆 Global Leaderboard
        </div>
        {globalLB.slice(0, 5).map((e, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 6px", borderBottom: i < 4 ? "1px solid #2d2d44" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, width: 24 }}>{medals[i]}</span>
              <div>
                <span style={{ color: "#e5e7eb", fontWeight: 600 }}>{e.name}</span>
                <div style={{ fontSize: 10, color: "#4b5563" }}>{CATEGORY_MAP[e.category]?.emoji} {CATEGORY_MAP[e.category]?.label ?? e.category}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#f59e0b", fontWeight: 800, fontSize: 18 }}>{e.score}</div>
              <div style={{ color: "#6b7280", fontSize: 11 }}>🔥{e.streak}</div>
            </div>
          </div>
        ))}
      </div>
    ) : null;

  // ── HOME ─────────────────────────────────────────────────────────────────
  if (screen === "home") return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px", color: "#fff" }}>
      <AuthHeader />
      {modal && <Modal type={modal} />}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>⚡</div>
        <h1 style={{ fontSize: "2.8rem", fontWeight: 900, letterSpacing: "-0.03em", margin: 0, background: "linear-gradient(135deg, #f59e0b, #ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          QuicTriv
        </h1>
        <p style={{ color: "#6b7280", marginTop: 8, fontSize: "1.1rem" }}>3 seconds. One tap. No mercy.</p>
      </div>

      {/* Name field — full width above columns */}
      <div style={{ width: "100%", maxWidth: 860, background: "#1a1a2e", borderRadius: 16, padding: "16px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>Your name</div>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); try { localStorage.setItem("onetap_name", e.target.value); } catch {} }}
          placeholder="Enter your name..."
          style={{ width: "100%", background: "#0f0f1a", border: "1px solid #2d2d44", borderRadius: 10, color: "#fff", fontSize: 16, padding: "12px 16px", outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* Two-column layout */}
      <div style={{ width: "100%", maxWidth: 860, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

        {/* LEFT — Solo */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", paddingLeft: 4 }}>⚡ Solo</div>

          {/* Category picker */}
          <div style={{ background: "#1a1a2e", borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>Category</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {Object.entries(CATEGORY_MAP).map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => { setCategory(key); try { localStorage.setItem("onetap_category", key); } catch {} }}
                  style={{
                    background: category === key ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${category === key ? "#f59e0b" : "#2d2d44"}`,
                    borderRadius: 10, color: category === key ? "#f59e0b" : "#9ca3af",
                    fontSize: 12, fontWeight: 600, padding: "9px 6px", cursor: "pointer", transition: "all 0.15s",
                    gridColumn: key === "all" ? "span 2" : "span 1",
                  }}
                >
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Round size */}
          <div style={{ background: "#1a1a2e", borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>Questions per round</div>
            <div style={{ display: "flex", gap: 8 }}>
              {ROUND_SIZES.map((n) => (
                <button
                  key={n}
                  onClick={() => { setRoundSize(n); try { localStorage.setItem("onetap_round", String(n)); } catch {} }}
                  style={{
                    flex: 1, background: roundSize === n ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${roundSize === n ? "#f59e0b" : "#2d2d44"}`,
                    borderRadius: 10, color: roundSize === n ? "#f59e0b" : "#9ca3af",
                    fontSize: 15, fontWeight: 700, padding: "10px 0", cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Timer speed */}
          <div style={{ background: "#1a1a2e", borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>Timer (seconds)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={timerDuration === 0 ? "" : String(timerDuration)}
                placeholder="e.g. 3"
                disabled={timerDuration === 0}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "∞") { setTimerDuration(0); try { localStorage.setItem("onetap_timer", "0"); } catch {} return; }
                  const cleaned = raw.replace(/[^0-9]/g, "");
                  const num = Math.min(900, Math.max(1, Number(cleaned) || 1));
                  if (cleaned === "") return;
                  setTimerDuration(num);
                  try { localStorage.setItem("onetap_timer", String(num)); } catch {}
                }}
                style={{
                  flex: 1, background: timerDuration === 0 ? "rgba(255,255,255,0.02)" : "#0f0f1a",
                  border: `1px solid ${timerDuration === 0 ? "#2d2d44" : "#f59e0b"}`,
                  borderRadius: 10, color: timerDuration === 0 ? "#4b5563" : "#fff",
                  fontSize: 18, fontWeight: 700, padding: "10px 14px", outline: "none",
                  textAlign: "center", opacity: timerDuration === 0 ? 0.4 : 1,
                }}
              />
              <button
                onClick={() => {
                  const next = timerDuration === 0 ? 3 : 0;
                  setTimerDuration(next);
                  try { localStorage.setItem("onetap_timer", String(next)); } catch {}
                }}
                style={{
                  background: timerDuration === 0 ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${timerDuration === 0 ? "#f59e0b" : "#2d2d44"}`,
                  borderRadius: 10, color: timerDuration === 0 ? "#f59e0b" : "#9ca3af",
                  fontSize: 20, fontWeight: 700, padding: "10px 18px", cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
                }}
              >
                ∞
              </button>
            </div>
          </div>

          <button
            onClick={() => startGame(category, roundSize, timerDuration)}
            style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", border: "none", borderRadius: 14, color: "#fff", fontSize: "1.1rem", fontWeight: 800, padding: "16px", cursor: "pointer", width: "100%" }}
          >
            START GAME ⚡
          </button>
        </div>

        {/* RIGHT — Multiplayer */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", paddingLeft: 4 }}>🎮 Multiplayer</div>

          <div style={{ background: "#1a1a2e", borderRadius: 16, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            <a href="/multiplayer" style={{ display: "block", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 10, color: "#10b981", fontSize: "1rem", fontWeight: 800, padding: "13px", cursor: "pointer", textAlign: "center", textDecoration: "none" }}>
              🎮 Host a Game
            </a>
            <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", letterSpacing: "0.05em" }}>— or join with a code —</div>
            <input id="jc" maxLength={6} placeholder="GAME CODE"
              style={{ width: "100%", background: "#0f0f1a", border: "1px solid #2d2d44", borderRadius: 10, color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: "0.3em", padding: "11px 14px", outline: "none", textTransform: "uppercase", boxSizing: "border-box", textAlign: "center" }} />
            <button
              onClick={() => { const c = (document.getElementById("jc") as HTMLInputElement).value.trim().toUpperCase(); window.location.href = c ? `/multiplayer?join=${c}` : "/multiplayer"; }}
              style={{ width: "100%", background: "linear-gradient(135deg,#10b981,#059669)", border: "none", borderRadius: 10, color: "#fff", fontSize: "1rem", fontWeight: 800, padding: "13px", cursor: "pointer" }}
            >
              Join Game →
            </button>
          </div>

          {/* Leaderboard on the right below multiplayer */}
          <LeaderboardView />
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", gap: 8, marginTop: 24, marginBottom: 8 }}>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("onetap-modal", { detail: "about" }))}
          style={{ background: "transparent", border: "1px solid #2d2d44", borderRadius: 8, color: "#4b5563", fontSize: 12, fontWeight: 600, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.04em" }}
        >
          About
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("onetap-modal", { detail: "updates" }))}
          style={{ background: "transparent", border: "1px solid #2d2d44", borderRadius: 8, color: "#4b5563", fontSize: 12, fontWeight: 600, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.04em" }}
        >
          Updates
        </button>
      </div>
    </div>
  );

  // ── RESULT ───────────────────────────────────────────────────────────────
  if (screen === "result") {
    const r = resultsRef.current;
    const acc = Math.round((r.correct / (r.total || 1)) * 100);
    const emoji = r.correct >= Math.round(r.total * 0.85) ? "🏆" : r.correct >= Math.round(r.total * 0.6) ? "🔥" : r.correct >= Math.round(r.total * 0.35) ? "👍" : "💀";
    const msg = r.correct >= Math.round(r.total * 0.85) ? "Legendary!" : r.correct >= Math.round(r.total * 0.6) ? "On Fire!" : r.correct >= Math.round(r.total * 0.35) ? "Not Bad!" : "Keep Practicing!";
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px", color: "#fff" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>{emoji}</div>
          <h2 style={{ fontSize: "2rem", fontWeight: 900, margin: 0 }}>{msg}</h2>
          <p style={{ color: "#6b7280", marginTop: 6 }}>{r.correct}/{r.total} correct · {CATEGORY_MAP[r.category]?.emoji} {CATEGORY_MAP[r.category]?.label}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 32, width: "100%", maxWidth: 400 }}>
          {([["Score", r.score, "#f59e0b"], ["Best Streak", `${r.bestStreak}🔥`, "#ef4444"], ["Accuracy", `${acc}%`, "#10b981"]] as [string,any,string][]).map(([label, val, color]) => (
            <div key={label} style={{ background: "#1a1a2e", borderRadius: 12, padding: "16px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color }}>{val}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
          <button onClick={() => startGame(r.category, roundSize, timerDuration)} style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", border: "none", borderRadius: 12, color: "#fff", fontSize: "1rem", fontWeight: 800, padding: "14px 28px", cursor: "pointer" }}>
            PLAY AGAIN ⚡
          </button>
          <button onClick={() => setScreen("home")} style={{ background: "#1a1a2e", border: "1px solid #2d2d44", borderRadius: 12, color: "#9ca3af", fontSize: "1rem", fontWeight: 600, padding: "14px 28px", cursor: "pointer" }}>
            Home
          </button>
        </div>
        <LeaderboardView />
      </div>
    );
  }

  // ── GAME ─────────────────────────────────────────────────────────────────
  if (!q) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px", color: "#fff" }}>
      <AuthHeader />
      <div style={{ width: "100%", maxWidth: 480, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#f59e0b" }}>{score}</div>
        <div style={{ fontSize: 13, color: "#6b7280" }}>{qIndex + 1} / {questions.length}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: streak > 0 ? "#ef4444" : "#4b5563" }}>🔥{streak}</div>
      </div>
      <div style={{ width: "100%", maxWidth: 480, height: 4, background: "#1a1a2e", borderRadius: 2, marginBottom: 24, overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct + "%", background: "linear-gradient(90deg, #f59e0b, #ef4444)", borderRadius: 2, transition: "width 0.3s" }} />
      </div>

      {/* Category pill */}
      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 16, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {CATEGORY_MAP[category]?.emoji} {CATEGORY_MAP[category]?.label}
      </div>

      {/* Timer */}
      {gameStateRef.current.timerDuration !== 0 && <div style={{ position: "relative", width: 80, height: 80, marginBottom: 24 }}>
        <svg width="80" height="80" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="40" cy="40" r="34" fill="none" stroke="#1a1a2e" strokeWidth="6" />
          <circle cx="40" cy="40" r="34" fill="none"
            stroke={timeLeft <= 1 ? "#ef4444" : timeLeft <= 2 ? "#f59e0b" : "#10b981"}
            strokeWidth="6" strokeDasharray={213.6} strokeDashoffset={213.6 * (1 - timeLeft / 3)}
            style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: timeLeft <= 1 ? "#ef4444" : "#fff" }}>
          {selected ? "✓" : timeLeft}
        </div>
      </div>}

      {showStreak && (
        <div style={{ position: "fixed", top: "30%", left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #f59e0b, #ef4444)", borderRadius: 16, padding: "12px 24px", fontSize: 22, fontWeight: 900, zIndex: 100 }}>
          🔥 {streak}x STREAK!
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 480, background: "#1a1a2e", borderRadius: 20, padding: "28px 24px", marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: "1.3rem", fontWeight: 700, lineHeight: 1.4 }}>{q.q}</div>
      </div>

      <div style={{ width: "100%", maxWidth: 480, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {options.map((opt, i) => {
          const isCorrect = opt === q.a;
          const isWrong = selected === opt && !isCorrect;
          const showResult = selected !== null;
          return (
            <button key={i}
              onClick={() => handleAnswer(opt, questions, qIndex)}
              disabled={!!selected}
              className={selected === opt ? anim : ""}
              style={{
                background: showResult && isCorrect ? "#064e3b" : showResult && isWrong ? "#450a0a" : "#1a1a2e",
                border: `2px solid ${showResult && isCorrect ? "#10b981" : showResult && isWrong ? "#ef4444" : "#2d2d44"}`,
                borderRadius: 14, color: showResult && isCorrect ? "#10b981" : showResult && isWrong ? "#ef4444" : "#e5e7eb",
                fontSize: "1rem", fontWeight: 700, padding: "20px 16px", cursor: selected ? "default" : "pointer", transition: "all 0.2s", lineHeight: 1.3,
              }}>
              {opt}
            </button>
          );
        })}
      </div>

      {selected === "__timeout__" && (
        <div style={{ marginTop: 20, color: "#ef4444", fontWeight: 700, fontSize: "1.1rem" }}>
          ⏰ Too slow! Answer: <span style={{ color: "#10b981" }}>{q.a}</span>
        </div>
      )}
    </div>
  );
}


