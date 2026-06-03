"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";

import { db } from "../lib/firebase";
import { ref, set, get, onValue, update, remove, push, off } from "firebase/database";
import { geography } from "../data/geography";
import { science } from "../data/science";
import { history } from "../data/history";
import { sports } from "../data/sports";
import { entertainment } from "../data/entertainment";
import { math } from "../data/math";

const ALL_QUESTIONS = [...geography, ...science, ...history, ...sports, ...entertainment, ...math];
const CATEGORY_MAP: Record<string, any[]> = {
  all: ALL_QUESTIONS, geography, science, history, sports, entertainment, math
};

const FUNNY_NAMES = ["QuizWizard","TriviaKing","BrainBlast","SmartCookie","FactMachine","QuizNinja","BrainBox","TriviaBot","WisdomSeeker","FactChecker","QuizMaster","BrainStorm","TriviaTitan","KnowledgeBomb","QuizChamp"];

function shuffle(arr: any[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeGameId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function makePlayerId() {
  return Math.random().toString(36).slice(2, 12);
}

const s = {
  page: { minHeight:"100vh", background:"#0f0f1a", color:"#fff", fontFamily:"system-ui,sans-serif", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", padding:"20px" },
  card: { width:"100%", maxWidth:460, background:"#1a1a2e", borderRadius:16, padding:"28px 24px" },
  title: { fontSize:"2rem", fontWeight:900, background:"linear-gradient(135deg,#f59e0b,#ef4444)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:4, textAlign:"center" as const },
  sub: { color:"#6b7280", fontSize:"0.9rem", textAlign:"center" as const, marginBottom:24 },
  label: { fontSize:12, color:"#6b7280", textTransform:"uppercase" as const, letterSpacing:"0.05em", marginBottom:6, display:"block" },
  input: { width:"100%", background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:10, color:"#fff", fontSize:15, padding:"11px 14px", outline:"none", marginBottom:14 },
  btn: (color="#f59e0b") => ({ background:`linear-gradient(135deg,${color},${color=="#f59e0b"?"#ef4444":"#dc2626"})`, border:"none", borderRadius:10, color:"#fff", fontSize:"1rem", fontWeight:800, padding:"13px 24px", cursor:"pointer", width:"100%", marginBottom:10 }),
  ghostBtn: { background:"transparent", border:"1px solid #2d2d44", borderRadius:10, color:"#9ca3af", fontSize:"0.9rem", fontWeight:600, padding:"11px 20px", cursor:"pointer", width:"100%" },
  toggle: (on: boolean) => ({ background: on ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)", border:`1px solid ${on?"#f59e0b":"#2d2d44"}`, borderRadius:8, color: on ? "#f59e0b" : "#9ca3af", fontSize:13, padding:"8px 14px", cursor:"pointer", transition:"all 0.2s" }),
  sectionLabel: { fontSize:12, color:"#f59e0b", textTransform:"uppercase" as const, letterSpacing:"0.1em", fontWeight:700, marginBottom:10 },
  playerRow: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", background:"rgba(255,255,255,0.04)", borderRadius:8, marginBottom:6 },
  kickBtn: { background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, color:"#ef4444", fontSize:11, padding:"4px 10px", cursor:"pointer" },
  qBox: { background:"#1a1a2e", borderRadius:16, padding:"24px 20px", marginBottom:16, textAlign:"center" as const, width:"100%", maxWidth:480 },
  ansBtn: (state: "default"|"correct"|"wrong") => ({
    background: state==="correct" ? "#064e3b" : state==="wrong" ? "#450a0a" : "#1a1a2e",
    border:`2px solid ${state==="correct"?"#10b981":state==="wrong"?"#ef4444":"#2d2d44"}`,
    borderRadius:12, color: state==="correct" ? "#10b981" : state==="wrong" ? "#ef4444" : "#e5e7eb",
    fontSize:"0.95rem", fontWeight:700, padding:"16px 14px", cursor:state==="default"?"pointer":"default", lineHeight:1.3, transition:"all 0.2s"
  }),
};

export default function MultiplayerPage() {
  const [view, setView] = useState<"home"|"host-setup"|"lobby"|"game"|"results">("home");
  const [playerName, setPlayerName] = useState("");
  const [gameId, setGameId] = useState("");
  const [joinCode, setJoinCode] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("join") || "";
    }
    return "";
  });
  const [playerId] = useState(() => makePlayerId());
  const [isHost, setIsHost] = useState(false);
  const [game, setGame] = useState<any>(null);
  const [error, setError] = useState("");

  // Host settings
  const [category, setCategory] = useState("all");
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [autoName, setAutoName] = useState(false);

  // Game state
  const [currentQ, setCurrentQ] = useState<any>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string|null>(null);
  const [timeLeft, setTimeLeft] = useState(3);
  const [myScore, setMyScore] = useState(0);
  const [myStreak, setMyStreak] = useState(0);
  const timerRef = useRef<any>(null);
  const answeredRef = useRef(false);

  useEffect(() => {
    try { const n = localStorage.getItem("onetap_name"); if (n) setPlayerName(n.slice(0,15)); } catch {}
  }, []);

  // Listen to game state
  useEffect(() => {
    if (!gameId) return;
    const gameRef = ref(db, `games/${gameId}`);
    const unsub = onValue(gameRef, snap => {
      const data = snap.val();
      setGame(data);
    });
    return () => off(gameRef);
  }, [gameId]);

  // React to game phase changes
  useEffect(() => {
    if (!game) return;
    if (game.phase === "playing" && view === "lobby") {
      setView("game");
      setMyScore(0); setMyStreak(0);
    }
    if (game.phase === "results" && view === "game") {
      setView("results");
      if (timerRef.current) clearInterval(timerRef.current);
    }
    // Update current question
    if (game.phase === "playing" && game.currentQuestion !== undefined) {
      const qs = game.questions;
      if (qs && qs[game.currentQuestion]) {
        const q = qs[game.currentQuestion];
        setCurrentQ(q);
        setOptions(shuffle([q.a, ...q.w]));
        setSelected(null);
        setTimeLeft(game.timerEnabled ? 3 : 99);
        answeredRef.current = false;
      }
    }
  }, [game?.phase, game?.currentQuestion]);

  // Timer for current question
  useEffect(() => {
    if (view !== "game" || selected !== null || !game?.timerEnabled) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          handleAnswer("__timeout__");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [game?.currentQuestion, view, selected]);

  // Check if kicked
  useEffect(() => {
    if (!game || !gameId) return;
    const players = game.players || {};
    if (!players[playerId] && view !== "home" && view !== "host-setup") {
      setError("You were removed from the game.");
      setView("home");
      setGameId("");
    }
  }, [game?.players]);

  async function hostGame() {
    const name = autoName ? FUNNY_NAMES[Math.floor(Math.random()*FUNNY_NAMES.length)] : playerName.trim().slice(0,15);
    if (!name) { setError("Enter a name first"); return; }
    setError("");
    const id = makeGameId();
    const qs = shuffle(CATEGORY_MAP[category]).slice(0, 20).map(q => ({ q: q.q, a: q.a, w: q.w }));
    await set(ref(db, `games/${id}`), {
      id, hostId: playerId, phase: "lobby",
      category, maxPlayers, timerEnabled,
      currentQuestion: 0, questions: qs,
      players: { [playerId]: { name, score: 0, streak: 0, answered: false, isHost: true } },
      bannedNames: [],
      createdAt: Date.now(),
    });
    setGameId(id);
    setIsHost(true);
    setPlayerName(name);
    try { localStorage.setItem("onetap_name", name); } catch {}
    setView("lobby");
  }

  async function joinGame() {
    const code = joinCode.trim().toUpperCase();
    const name = autoName ? FUNNY_NAMES[Math.floor(Math.random()*FUNNY_NAMES.length)] : playerName.trim().slice(0,15);
    if (!code || !name) { setError("Enter game code and name"); return; }
    setError("");
    const snap = await get(ref(db, `games/${code}`));
    if (!snap.exists()) { setError("Game not found"); return; }
    const g = snap.val();
    if (g.phase !== "lobby") { setError("Game already started"); return; }
    const players = g.players || {};
    if (Object.keys(players).length >= g.maxPlayers) { setError("Game is full"); return; }
    const bannedNames = g.bannedNames || [];
    if (bannedNames.includes(name.toLowerCase())) { setError("That name is not allowed in this game"); return; }
    const nameTaken = Object.values(players).some((p: any) => p.name.toLowerCase() === name.toLowerCase());
    if (nameTaken) { setError("That name is already taken"); return; }
    await update(ref(db, `games/${code}/players/${playerId}`), { name, score: 0, streak: 0, answered: false, isHost: false });
    setGameId(code);
    setIsHost(false);
    setPlayerName(name);
    try { localStorage.setItem("onetap_name", name); } catch {}
    setView("lobby");
  }

  async function startGame() {
    if (!isHost) return;
    const players = game?.players || {};
    if (Object.keys(players).length < 1) { setError("Need at least 1 player"); return; }
    await update(ref(db, `games/${gameId}`), { phase: "playing", currentQuestion: 0, startedAt: Date.now() });
  }

  const handleAnswer = useCallback(async (ans: string) => {
    if (answeredRef.current || !currentQ || !gameId) return;
    answeredRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setSelected(ans);
    const isCorrect = ans === currentQ.a;
    const newStreak = isCorrect ? myStreak + 1 : 0;
    const bonus = isCorrect ? Math.min(newStreak, 5) * 10 : 0;
    const newScore = isCorrect ? myScore + 10 + bonus : myScore;
    setMyStreak(newStreak);
    setMyScore(newScore);
    await update(ref(db, `games/${gameId}/players/${playerId}`), {
      score: newScore, streak: newStreak, answered: true,
      lastAnswer: ans, lastCorrect: isCorrect,
    });
    // Host advances question after all answered or 4 seconds
    if (isHost) {
      setTimeout(async () => {
        const snap = await get(ref(db, `games/${gameId}`));
        const g = snap.val();
        const players = g.players || {};
        const nextQ = g.currentQuestion + 1;
        if (nextQ >= g.questions.length) {
          await update(ref(db, `games/${gameId}`), { phase: "results" });
        } else {
          // Reset answered for all players
          const updates: any = { [`currentQuestion`]: nextQ };
          Object.keys(players).forEach(pid => { updates[`players/${pid}/answered`] = false; });
          await update(ref(db, `games/${gameId}`), updates);
        }
      }, 1500);
    }
  }, [currentQ, gameId, isHost, myScore, myStreak, playerId]);

  async function kickPlayer(pid: string, name: string) {
    if (!isHost) return;
    const banned = game?.bannedNames || [];
    await update(ref(db, `games/${gameId}`), { bannedNames: [...banned, name.toLowerCase()] });
    await remove(ref(db, `games/${gameId}/players/${pid}`));
  }

  async function leaveGame() {
    if (isHost) {
      await remove(ref(db, `games/${gameId}`));
    } else {
      await remove(ref(db, `games/${gameId}/players/${playerId}`));
    }
    setGameId(""); setGame(null); setIsHost(false); setView("home");
  }

  // ---- HOME ----
  if (view === "home") return (
    <div style={s.page}>
      <div style={{ ...s.card }}>
        <div style={s.title}>⚡ One-Tap Trivia</div>
        <div style={s.sub}>Multiplayer Mode</div>
        {error && <div style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"10px 14px", color:"#f87171", fontSize:13, marginBottom:14 }}>{error}</div>}

        <label style={s.label}>Your Name (max 15 chars)</label>
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <input style={{ ...s.input, marginBottom:0, flex:1 }} value={playerName} maxLength={15} onChange={e => { setPlayerName(e.target.value); try { localStorage.setItem("onetap_name", e.target.value); } catch {} }} placeholder="Enter your name…" />
          <button onClick={() => { const n = FUNNY_NAMES[Math.floor(Math.random()*FUNNY_NAMES.length)]; setPlayerName(n); try { localStorage.setItem("onetap_name", n); } catch {}; }}
            style={{ background:"rgba(245,158,11,0.15)", border:"1px solid rgba(245,158,11,0.4)", borderRadius:10, color:"#f59e0b", fontSize:"1.2rem", padding:"0 14px", cursor:"pointer", flexShrink:0 }} title="Generate random name">🎲</button>
        </div>

        <button style={s.btn()} onClick={() => { setError(""); setView("host-setup"); }}>🎮 Host a Game</button>

        <div style={{ margin:"16px 0 10px", borderTop:"1px solid #2d2d44", paddingTop:16 }}>
          <label style={s.label}>Join with Game Code</label>
          <input style={{ ...s.input, textTransform:"uppercase", letterSpacing:"0.3em", fontSize:20, fontWeight:700, textAlign:"center" }}
            value={joinCode} maxLength={6} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" />
          <button style={s.btn("#10b981")} onClick={joinGame}>🚀 Join Game</button>
        </div>
        <a href="/" style={{ ...s.ghostBtn, textAlign:"center", display:"block", textDecoration:"none", marginTop:4 }}>← Solo Mode</a>
      </div>
    </div>
  );

  // ---- HOST SETUP ----
  if (view === "host-setup") return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={{ ...s.title, fontSize:"1.5rem", marginBottom:20 }}>🎮 Host Settings</div>
        {error && <div style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"10px 14px", color:"#f87171", fontSize:13, marginBottom:14 }}>{error}</div>}

        <label style={s.label}>Your Name</label>
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <input style={{ ...s.input, marginBottom:0, flex:1 }} value={playerName} maxLength={15} onChange={e => setPlayerName(e.target.value)} placeholder="Enter your name…" />
          <button onClick={() => { const n = FUNNY_NAMES[Math.floor(Math.random()*FUNNY_NAMES.length)]; setPlayerName(n); }}
            style={{ background:"rgba(245,158,11,0.15)", border:"1px solid rgba(245,158,11,0.4)", borderRadius:10, color:"#f59e0b", fontSize:"1.2rem", padding:"0 14px", cursor:"pointer", flexShrink:0 }} title="Generate random name">🎲</button>
        </div>

        <label style={s.label}>Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ ...s.input, marginBottom:14 }}>
          {[["all","🌎 All Categories"],["geography","🗺️ Geography"],["science","🔬 Science"],["history","📜 History"],["sports","⚽ Sports"],["entertainment","🎬 Entertainment"],["math","🔢 Math"]].map(([v,l]) => (
            <option key={v} value={v} style={{ background:"#1a1a2e" }}>{l}</option>
          ))}
        </select>

        <label style={s.label}>Max Players</label>
        <input type="number" min={2} max={50} value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
          style={s.input} />

        <div style={s.label}>Options</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, marginBottom:18 }}>
          <button style={s.toggle(timerEnabled)} onClick={() => setTimerEnabled(!timerEnabled)}>⏱ {timerEnabled ? "Timer ON" : "Timer OFF"}</button>
          <button style={s.toggle(autoName)} onClick={() => setAutoName(!autoName)}>🎲 {autoName ? "Auto Name ON" : "Auto Name OFF"}</button>
        </div>

        <button style={s.btn()} onClick={hostGame}>Create Game Room ✦</button>
        <button style={s.ghostBtn} onClick={() => setView("home")}>← Back</button>
      </div>
    </div>
  );

  // ---- LOBBY ----
  if (view === "lobby") {
    const players = game?.players ? Object.entries(game.players) : [];
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <div style={{ fontSize:13, color:"#6b7280", letterSpacing:"0.1em", textTransform:"uppercase" }}>Game Code</div>
            <div style={{ fontSize:"3rem", fontWeight:900, letterSpacing:"0.3em", color:"#f59e0b", lineHeight:1 }}>{gameId}</div>
            <div style={{ fontSize:12, color:"#4b5563", marginTop:4 }}>Share this code with friends</div>
          </div>

          <div style={s.sectionLabel}>Players ({players.length}/{game?.maxPlayers || 10})</div>
          {players.map(([pid, p]: [string, any]) => (
            <div key={pid} style={s.playerRow}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:16 }}>{p.isHost ? "👑" : "🎮"}</span>
                <span style={{ fontWeight:600, color: pid === playerId ? "#f59e0b" : "#e5e7eb" }}>{p.name}</span>
                {pid === playerId && <span style={{ fontSize:11, color:"#6b7280" }}>(you)</span>}
              </div>
              {isHost && pid !== playerId && (
                <button style={s.kickBtn} onClick={() => kickPlayer(pid, p.name)}>Kick</button>
              )}
            </div>
          ))}

          {isHost ? (
            <>
              <div style={{ fontSize:12, color:"#4b5563", marginTop:12, marginBottom:14 }}>
                Category: {game?.category} · Timer: {game?.timerEnabled ? "ON" : "OFF"} · 20 questions
              </div>
              <button style={s.btn()} onClick={startGame}>▶ Start Game</button>
            </>
          ) : (
            <div style={{ textAlign:"center", color:"#6b7280", fontSize:14, marginTop:16, padding:"12px 0" }}>
              ⏳ Waiting for host to start…
            </div>
          )}
          <button style={s.ghostBtn} onClick={leaveGame}>Leave Game</button>
        </div>
      </div>
    );
  }

  // ---- GAME ----
  if (view === "game") {
    const players = game?.players ? Object.values(game.players) as any[] : [];
    const qNum = (game?.currentQuestion || 0) + 1;
    const total = game?.questions?.length || 20;
    return (
      <div style={{ ...s.page, justifyContent:"flex-start", paddingTop:20 }}>
        {/* HUD */}
        <div style={{ width:"100%", maxWidth:480, display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ fontSize:20, fontWeight:900, color:"#f59e0b" }}>{myScore}</div>
          <div style={{ fontSize:13, color:"#6b7280" }}>{qNum} / {total}</div>
          <div style={{ fontSize:15, fontWeight:700, color: myStreak > 0 ? "#ef4444" : "#4b5563" }}>🔥{myStreak}</div>
        </div>
        <div style={{ width:"100%", maxWidth:480, height:4, background:"#1a1a2e", borderRadius:2, marginBottom:16, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${(qNum/total)*100}%`, background:"linear-gradient(90deg,#f59e0b,#ef4444)", borderRadius:2, transition:"width 0.3s" }} />
        </div>

        {/* Timer */}
        {game?.timerEnabled && (
          <div style={{ position:"relative", width:64, height:64, marginBottom:16 }}>
            <svg width="64" height="64" style={{ transform:"rotate(-90deg)" }}>
              <circle cx="32" cy="32" r="26" fill="none" stroke="#1a1a2e" strokeWidth="5" />
              <circle cx="32" cy="32" r="26" fill="none"
                stroke={timeLeft <= 1 ? "#ef4444" : timeLeft <= 2 ? "#f59e0b" : "#10b981"}
                strokeWidth="5" strokeDasharray="163.4" strokeDashoffset={163.4*(1-timeLeft/3)}
                style={{ transition:"stroke-dashoffset 0.9s linear, stroke 0.3s" }} />
            </svg>
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:900, color:timeLeft<=1?"#ef4444":"#fff" }}>
              {selected ? "✓" : timeLeft}
            </div>
          </div>
        )}

        {/* Question */}
        <div style={s.qBox}>
          <div style={{ fontSize:"1.15rem", fontWeight:700, lineHeight:1.4 }}>{currentQ?.q}</div>
        </div>

        {/* Options */}
        <div style={{ width:"100%", maxWidth:480, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
          {options.map((opt, i) => {
            const state = selected === null ? "default" : opt === currentQ?.a ? "correct" : selected === opt ? "wrong" : "default";
            return (
              <button key={i} style={s.ansBtn(state)} disabled={!!selected}
                onClick={() => handleAnswer(opt)}>
                {opt}
              </button>
            );
          })}
        </div>
        {selected === "__timeout__" && <div style={{ color:"#ef4444", fontWeight:700 }}>⏰ Too slow! Answer: <span style={{ color:"#10b981" }}>{currentQ?.a}</span></div>}

        {/* Live scoreboard */}
        <div style={{ width:"100%", maxWidth:480, background:"#1a1a2e", borderRadius:12, padding:"14px 16px" }}>
          <div style={{ fontSize:11, color:"#f59e0b", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:700, marginBottom:10 }}>Live Scores</div>
          {[...players].sort((a,b) => b.score - a.score).slice(0,5).map((p, i) => (
            <div key={p.name} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom: i<4 ? "1px solid #2d2d44" : "none" }}>
              <span style={{ color: p.name === (game?.players?.[playerId]?.name) ? "#f59e0b" : "#9ca3af", fontSize:13 }}>
                {["🥇","🥈","🥉","4","5"][i]} {p.name} {p.answered ? "✓" : "…"}
              </span>
              <span style={{ color:"#f59e0b", fontWeight:700 }}>{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- RESULTS ----
  if (view === "results") {
    const players = game?.players ? Object.values(game.players) as any[] : [];
    const sorted = [...players].sort((a,b) => b.score - a.score);
    const myRank = sorted.findIndex(p => p.name === (game?.players?.[playerId]?.name)) + 1;
    const medals = ["🥇","🥈","🥉"];
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ textAlign:"center", marginBottom:24 }}>
            <div style={{ fontSize:56 }}>{myRank === 1 ? "🏆" : myRank === 2 ? "🥈" : myRank === 3 ? "🥉" : "🎮"}</div>
            <div style={{ fontSize:"1.8rem", fontWeight:900, marginTop:8 }}>
              {myRank === 1 ? "You Won!" : myRank <= 3 ? `#${myRank} Place!` : `#${myRank} Place`}
            </div>
            <div style={{ color:"#6b7280", fontSize:14, marginTop:4 }}>Final Scores</div>
          </div>

          {sorted.map((p, i) => (
            <div key={p.name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background: p.name === (game?.players?.[playerId]?.name) ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.03)", borderRadius:10, marginBottom:6, border: p.name === (game?.players?.[playerId]?.name) ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>{medals[i] || `${i+1}`}</span>
                <span style={{ fontWeight:600, color:"#e5e7eb" }}>{p.name}</span>
              </div>
              <span style={{ color:"#f59e0b", fontWeight:800, fontSize:18 }}>{p.score}</span>
            </div>
          ))}

          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            {isHost && <button style={{ ...s.btn(), flex:1, marginBottom:0 }} onClick={async () => {
              const qs = shuffle(CATEGORY_MAP[game?.category||"all"]).slice(0,20).map((q:any) => ({ q:q.q, a:q.a, w:q.w }));
              const updates: any = { phase:"lobby", currentQuestion:0, questions:qs };
              Object.keys(game?.players||{}).forEach(pid => {
                updates[`players/${pid}/score`] = 0;
                updates[`players/${pid}/streak`] = 0;
                updates[`players/${pid}/answered`] = false;
              });
              await update(ref(db, `games/${gameId}`), updates);
              setMyScore(0); setMyStreak(0); setView("lobby");
            }}>Play Again</button>}
            <button style={{ ...s.ghostBtn, flex:1 }} onClick={leaveGame}>Leave</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
