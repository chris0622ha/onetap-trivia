"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { db, auth, googleProvider } from "../lib/firebase";
import { ref, get, set, update, onValue, off, remove } from "firebase/database";
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

import { geography } from "../data/geography";
import { science } from "../data/science";
import { history } from "../data/history";
import { math } from "../data/math";
import { sports } from "../data/sports";
import { entertainment } from "../data/entertainment";

const ALL_QUESTIONS = [...geography, ...science, ...history, ...math, ...sports, ...entertainment]
  .map(x => ({ q: x.q, a: x.a, w: (x as any).w ?? (x as any).wrong ?? [] }));

function shuffle(arr: any[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DUEL_QUESTIONS = 10;
const TIMER = 8; // seconds per question in duels

export default function DuelsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState<"home"|"searching"|"countdown"|"game"|"result">("home");
  const [duelId, setDuelId] = useState<string | null>(null);
  const [duel, setDuel] = useState<any>(null);
  const [mySlot, setMySlot] = useState<"p1"|"p2"|null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMER);
  const [myScore, setMyScore] = useState(0);
  const [theirScore, setTheirScore] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [isMobile, setIsMobile] = useState(false);

  const timerRef = useRef<any>(null);
  const answerRef = useRef(false);
  const myScoreRef = useRef(0);
  const searchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 700);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u); setAuthLoading(false);
      if (u) {
        const snap = await get(ref(db, `users/${u.uid}`));
        if (snap.exists()) setUserData(snap.val());
      }
    });
    return () => unsub();
  }, []);

  // Listen to duel state changes
  useEffect(() => {
    if (!duelId) return;
    const duelRef = ref(db, `duels/${duelId}`);
    const unsub = onValue(duelRef, snap => {
      if (!snap.exists()) return;
      const data = snap.val();
      setDuel(data);

      // Both players answered this question — move on
      const slot = mySlot;
      const otherSlot = slot === "p1" ? "p2" : "p1";
      const theirS = data[`${otherSlot}Score`] ?? 0;
      setTheirScore(theirS);

      if (data.status === "countdown" && screen !== "countdown") {
        setScreen("countdown");
        let c = 3;
        setCountdown(c);
        const iv = setInterval(() => {
          c--;
          setCountdown(c);
          if (c <= 0) {
            clearInterval(iv);
            setScreen("game");
            setQIndex(0);
            setSelected(null);
            setTimeLeft(TIMER);
            answerRef.current = false;
          }
        }, 1000);
      }

      if (data.status === "done" && screen !== "result") {
        setScreen("result");
      }
    });
    return () => off(duelRef);
  }, [duelId, mySlot, screen]);

  // Timer
  useEffect(() => {
    if (screen !== "game" || selected !== null || !duel) return;
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
  }, [screen, qIndex, selected, duel]);

  const handleAnswer = useCallback(async (ans: string) => {
    if (answerRef.current || !duel || !mySlot || !duelId) return;
    answerRef.current = true;
    clearInterval(timerRef.current);
    setSelected(ans);

    const questions = duel.questions;
    const q = questions[qIndex];
    const isCorrect = ans === q.a;
    const newScore = isCorrect ? myScoreRef.current + 1 : myScoreRef.current;
    myScoreRef.current = newScore;
    setMyScore(newScore);

    const otherSlot = mySlot === "p1" ? "p2" : "p1";
    const updates: any = {};
    updates[`duels/${duelId}/${mySlot}Score`] = newScore;
    updates[`duels/${duelId}/${mySlot}Answered/${qIndex}`] = true;
    await update(ref(db), updates);

    setTimeout(async () => {
      if (qIndex + 1 >= DUEL_QUESTIONS) {
        // Done — check if other player is also done, if so end game
        const snap = await get(ref(db, `duels/${duelId}`));
        const d = snap.val();
        const theirAnswered = Object.keys(d[`${otherSlot}Answered`] || {}).length;
        if (theirAnswered >= DUEL_QUESTIONS) {
          await update(ref(db, `duels/${duelId}`), { status: "done" });
          await saveDuelResult(duelId, d);
        } else {
          await update(ref(db, `duels/${duelId}`), { [`${mySlot}Done`]: true });
        }
      } else {
        const next = questions[qIndex + 1];
        setQIndex(qIndex + 1);
        setOptions(shuffle([next.a, ...next.w]));
        setSelected(null);
        setTimeLeft(TIMER);
        answerRef.current = false;
      }
    }, 900);
  }, [duel, mySlot, duelId, qIndex]);

  // Also check if other player finished before me
  useEffect(() => {
    if (!duel || !mySlot) return;
    const otherSlot = mySlot === "p1" ? "p2" : "p1";
    if (duel[`${otherSlot}Done`] && duel[`${mySlot}Done`] && duel.status !== "done") {
      update(ref(db, `duels/${duelId}`), { status: "done" });
    }
  }, [duel]);

  async function saveDuelResult(id: string, d: any) {
    if (!user) return;
    const myS = d[`${mySlot}Score`] ?? 0;
    const theirS = d[mySlot === "p1" ? "p2Score" : "p1Score"] ?? 0;
    const result = myS > theirS ? "win" : myS < theirS ? "loss" : "draw";
    await update(ref(db, `users/${user.uid}`), {
      duelWins:   (userData?.duelWins   || 0) + (result === "win"  ? 1 : 0),
      duelLosses: (userData?.duelLosses || 0) + (result === "loss" ? 1 : 0),
      duelDraws:  (userData?.duelDraws  || 0) + (result === "draw" ? 1 : 0),
      duelsPlayed:(userData?.duelsPlayed|| 0) + 1,
    });
    // Clean up matchmaking queue entry
    remove(ref(db, `duelQueue/${user.uid}`));
  }

  async function findMatch() {
    if (!user || !userData) return;
    setScreen("searching");
    const myBest = userData.bestScore || 0;
    const myName = userData.username || user.displayName?.split(" ")[0] || "Player";

    // Write self to queue
    await set(ref(db, `duelQueue/${user.uid}`), {
      uid: user.uid, name: myName, bestScore: myBest,
      photoURL: userData.photoURL || user.photoURL || null,
      badge: userData.badge || null,
      joinedAt: Date.now(),
    });

    // Look for a match within ±50% best score (or anyone if queue is thin)
    const snap = await get(ref(db, "duelQueue"));
    if (snap.exists()) {
      const queue: any[] = Object.values(snap.val()).filter((p: any) => p.uid !== user.uid);
      // Find closest match by score
      const match = queue
        .filter((p: any) => Date.now() - p.joinedAt < 60000) // only people who joined in last 60s
        .sort((a: any, b: any) => Math.abs(a.bestScore - myBest) - Math.abs(b.bestScore - myBest))[0];

      if (match) {
        // I found them — I'm p1, they're p2
        const questions = shuffle(ALL_QUESTIONS).slice(0, DUEL_QUESTIONS);
        const id = `${user.uid}_${match.uid}_${Date.now()}`;
        const duelData = {
          id, status: "countdown",
          p1: { uid: user.uid, name: myName, photoURL: userData.photoURL || user.photoURL || null, badge: userData.badge || null },
          p2: { uid: match.uid, name: match.name, photoURL: match.photoURL || null, badge: match.badge || null },
          questions,
          p1Score: 0, p2Score: 0,
          p1Answered: {}, p2Answered: {},
          createdAt: Date.now(),
        };
        await set(ref(db, `duels/${id}`), duelData);
        // Write duelId to both queue entries so p2 can find it
        await update(ref(db, `duelQueue/${match.uid}`), { matchedDuelId: id });
        await remove(ref(db, `duelQueue/${user.uid}`));
        setDuelId(id);
        setMySlot("p1");
        setDuel(duelData);
        myScoreRef.current = 0;
        return;
      }
    }

    // No match yet — wait for someone to match me
    const queueRef = ref(db, `duelQueue/${user.uid}`);
    const unsub = onValue(queueRef, async snap => {
      if (!snap.exists()) return;
      const data = snap.val();
      if (data.matchedDuelId) {
        off(queueRef);
        setDuelId(data.matchedDuelId);
        setMySlot("p2");
        myScoreRef.current = 0;
        await remove(ref(db, `duelQueue/${user.uid}`));
      }
    });

    // Timeout after 30s — cancel search
    searchTimeoutRef.current = setTimeout(async () => {
      off(queueRef);
      await remove(ref(db, `duelQueue/${user.uid}`));
      setScreen("home");
    }, 30000);
  }

  async function cancelSearch() {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (user) await remove(ref(db, `duelQueue/${user.uid}`));
    setScreen("home");
  }

  function resetDuel() {
    setScreen("home");
    setDuelId(null);
    setDuel(null);
    setMySlot(null);
    setQIndex(0);
    setSelected(null);
    setMyScore(0);
    setTheirScore(0);
    myScoreRef.current = 0;
  }

  const myName = userData?.username || user?.displayName?.split(" ")[0] || "You";
  const theirSlot = mySlot === "p1" ? "p2" : "p1";
  const theirName = duel?.[theirSlot]?.name || "Opponent";
  const q = duel?.questions?.[qIndex];

  const PlayerCard = ({ name, score, photo, badge, isMe }: any) => (
    <div style={{ textAlign:"center", flex:1 }}>
      <div style={{ position:"relative", display:"inline-block", marginBottom:8 }}>
        {photo ? (
          <img src={photo} alt="" width={56} height={56} style={{ borderRadius:"50%", border:`3px solid ${isMe?"#f59e0b":"#6366f1"}`, display:"block" }} />
        ) : (
          <div style={{ width:56, height:56, borderRadius:"50%", background:isMe?"rgba(245,158,11,0.2)":"rgba(99,102,241,0.2)", border:`3px solid ${isMe?"#f59e0b":"#6366f1"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:900, color:isMe?"#f59e0b":"#6366f1" }}>
            {(name||"?")[0].toUpperCase()}
          </div>
        )}
      </div>
      <div style={{ fontWeight:700, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
        {name}
        {badge === "star"  && <span style={{ fontSize:12 }}>⭐</span>}
        {badge === "check" && <span style={{ fontSize:11, color:"#3b82f6", fontWeight:900 }}>✓</span>}
        {badge === "crown" && <span style={{ fontSize:12 }}>👑</span>}
      </div>
      <div style={{ fontSize:28, fontWeight:900, color:isMe?"#f59e0b":"#6366f1", marginTop:4 }}>{score}</div>
    </div>
  );

  if (authLoading) return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#6b7280" }}>Loading…</div>
    </div>
  );

  if (!user) return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:20, padding:"32px 28px", maxWidth:360, textAlign:"center", color:"#fff" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>⚔️</div>
        <div style={{ fontSize:"1.3rem", fontWeight:900, marginBottom:8 }}>Duels</div>
        <div style={{ color:"#6b7280", fontSize:14, marginBottom:24 }}>Sign in to challenge other players</div>
        <button onClick={() => signInWithPopup(auth, googleProvider)}
          style={{ display:"flex", alignItems:"center", gap:8, background:"#fff", border:"none", borderRadius:10, color:"#1f2937", fontSize:14, fontWeight:700, padding:"10px 20px", cursor:"pointer", margin:"0 auto" }}>
          <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.7 29.3 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 16.3 3 9.7 7.9 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.3 0 10.2-1.9 13.9-5.1l-6.4-5.4C29.6 36.1 26.9 37 24 37c-5.2 0-9.6-3.3-11.3-8H6.2C9.5 38.9 16.2 45 24 45z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.4 5.4C41.2 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
          Sign in with Google
        </button>
        <a href="/" style={{ display:"block", marginTop:16, color:"#6b7280", fontSize:13 }}>← Back to TrivQuic</a>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", color:"#fff", display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px" }}>

      {/* HOME */}
      {screen === "home" && (
        <div style={{ width:"100%", maxWidth:480, textAlign:"center" }}>
          <a href="/" style={{ display:"block", color:"#6b7280", fontSize:13, marginBottom:24, textDecoration:"none" }}>← Back</a>
          <div style={{ fontSize:48, marginBottom:12 }}>⚔️</div>
          <h1 style={{ fontSize:"2rem", fontWeight:900, margin:"0 0 8px", background:"linear-gradient(135deg,#6366f1,#a855f7)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Duels</h1>
          <p style={{ color:"#6b7280", marginBottom:32 }}>Matched against a player with similar stats. {DUEL_QUESTIONS} questions, {TIMER}s each.</p>

          {/* My duel stats */}
          {userData && (
            <div style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:16, padding:"16px 20px", marginBottom:24 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8 }}>
                {[
                  ["Played", userData.duelsPlayed||0, "#e5e7eb"],
                  ["Wins",   userData.duelWins||0,    "#10b981"],
                  ["Losses", userData.duelLosses||0,  "#ef4444"],
                  ["Draws",  userData.duelDraws||0,   "#6b7280"],
                ].map(([l,v,c])=>(
                  <div key={l as string} style={{ textAlign:"center" }}>
                    <div style={{ fontSize:22, fontWeight:900, color:c as string }}>{v as number}</div>
                    <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.05em" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={findMatch} style={{ width:"100%", background:"linear-gradient(135deg,#6366f1,#a855f7)", border:"none", borderRadius:14, color:"#fff", fontSize:"1.1rem", fontWeight:800, padding:"16px", cursor:"pointer" }}>
            Find a Match ⚔️
          </button>
        </div>
      )}

      {/* SEARCHING */}
      {screen === "searching" && (
        <div style={{ textAlign:"center", marginTop:80 }}>
          <div style={{ fontSize:48, marginBottom:16, animation:"pulse 1s infinite" }}>🔍</div>
          <div style={{ fontSize:"1.3rem", fontWeight:900, marginBottom:8 }}>Finding your match…</div>
          <div style={{ color:"#6b7280", marginBottom:32 }}>Looking for a player with similar stats</div>
          <div style={{ display:"flex", justifyContent:"center", gap:6, marginBottom:32 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:"#6366f1", opacity:0.4+(i*0.3) }} />
            ))}
          </div>
          <button onClick={cancelSearch} style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.4)", borderRadius:10, color:"#ef4444", fontWeight:700, padding:"10px 24px", cursor:"pointer" }}>
            Cancel
          </button>
        </div>
      )}

      {/* COUNTDOWN */}
      {screen === "countdown" && duel && (
        <div style={{ textAlign:"center", marginTop:60, width:"100%", maxWidth:480 }}>
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:20, marginBottom:32 }}>
            <PlayerCard name={duel.p1.name} score={0} photo={duel.p1.photoURL} badge={duel.p1.badge} isMe={mySlot==="p1"} />
            <div style={{ fontSize:24, fontWeight:900, color:"#6b7280" }}>VS</div>
            <PlayerCard name={duel.p2.name} score={0} photo={duel.p2.photoURL} badge={duel.p2.badge} isMe={mySlot==="p2"} />
          </div>
          <div style={{ fontSize:80, fontWeight:900, color:"#f59e0b" }}>{countdown}</div>
          <div style={{ color:"#6b7280", marginTop:8 }}>Get ready!</div>
        </div>
      )}

      {/* GAME */}
      {screen === "game" && duel && q && (
        <div style={{ width:"100%", maxWidth:480 }}>
          {/* Scoreboard */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:900, color:"#f59e0b" }}>{myScore}</div>
              <div style={{ fontSize:11, color:"#6b7280" }}>{myName}</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:13, color:"#6b7280" }}>{qIndex+1}/{DUEL_QUESTIONS}</div>
              <div style={{ position:"relative", width:48, height:48, margin:"4px auto 0" }}>
                <svg width="48" height="48" style={{ transform:"rotate(-90deg)" }}>
                  <circle cx="24" cy="24" r="20" fill="none" stroke="#1a1a2e" strokeWidth="4" />
                  <circle cx="24" cy="24" r="20" fill="none" stroke={timeLeft<=2?"#ef4444":timeLeft<=4?"#f59e0b":"#10b981"}
                    strokeWidth="4" strokeDasharray={125.6} strokeDashoffset={125.6*(1-timeLeft/TIMER)}
                    style={{ transition:`stroke-dashoffset 1s linear, stroke 0.3s` }} />
                </svg>
                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900 }}>
                  {selected ? "✓" : timeLeft}
                </div>
              </div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:900, color:"#6366f1" }}>{theirScore}</div>
              <div style={{ fontSize:11, color:"#6b7280" }}>{theirName}</div>
            </div>
          </div>

          <div style={{ width:"100%", height:3, background:"#1a1a2e", borderRadius:2, marginBottom:20, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(qIndex/DUEL_QUESTIONS)*100}%`, background:"linear-gradient(90deg,#6366f1,#a855f7)", borderRadius:2, transition:"width 0.3s" }} />
          </div>

          <div style={{ background:"#1a1a2e", borderRadius:20, padding:"24px 20px", marginBottom:16, textAlign:"center" }}>
            <div style={{ fontSize:"1.2rem", fontWeight:700, lineHeight:1.4 }}>{q.q}</div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {options.map((opt, i) => {
              const isCorrect = opt === q.a;
              const isWrong = selected === opt && !isCorrect;
              const showResult = selected !== null;
              return (
                <button key={i} onClick={() => handleAnswer(opt)} disabled={!!selected}
                  style={{ background:showResult&&isCorrect?"#064e3b":showResult&&isWrong?"#450a0a":"#1a1a2e", border:`2px solid ${showResult&&isCorrect?"#10b981":showResult&&isWrong?"#ef4444":"#2d2d44"}`, borderRadius:14, color:showResult&&isCorrect?"#10b981":showResult&&isWrong?"#ef4444":"#e5e7eb", fontSize:"0.95rem", fontWeight:700, padding:"18px 14px", cursor:selected?"default":"pointer", transition:"all 0.2s", lineHeight:1.3 }}>
                  {opt}
                </button>
              );
            })}
          </div>
          {selected === "__timeout__" && (
            <div style={{ marginTop:16, color:"#ef4444", fontWeight:700, textAlign:"center" }}>
              ⏰ Too slow! Answer: <span style={{ color:"#10b981" }}>{q.a}</span>
            </div>
          )}
        </div>
      )}

      {/* RESULT */}
      {screen === "result" && duel && (
        <div style={{ width:"100%", maxWidth:480, textAlign:"center" }}>
          {(() => {
            const myFinal = duel[`${mySlot}Score`] ?? myScore;
            const theirFinal = duel[`${theirSlot}Score`] ?? theirScore;
            const win = myFinal > theirFinal;
            const draw = myFinal === theirFinal;
            return (<>
              <div style={{ fontSize:64, marginBottom:8 }}>{win?"🏆":draw?"🤝":"💀"}</div>
              <h2 style={{ fontSize:"2rem", fontWeight:900, margin:"0 0 8px", color:win?"#f59e0b":draw?"#6b7280":"#ef4444" }}>
                {win?"You Win!":draw?"Draw!":"You Lost"}
              </h2>
              <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:24, margin:"24px 0" }}>
                <PlayerCard name={duel[mySlot!].name} score={myFinal} photo={duel[mySlot!].photoURL} badge={duel[mySlot!].badge} isMe={true} />
                <div style={{ fontSize:20, fontWeight:900, color:"#4b5563" }}>VS</div>
                <PlayerCard name={duel[theirSlot].name} score={theirFinal} photo={duel[theirSlot].photoURL} badge={duel[theirSlot].badge} isMe={false} />
              </div>
              <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                <button onClick={()=>{ resetDuel(); setTimeout(findMatch, 100); }}
                  style={{ background:"linear-gradient(135deg,#6366f1,#a855f7)", border:"none", borderRadius:12, color:"#fff", fontSize:"1rem", fontWeight:800, padding:"14px 24px", cursor:"pointer" }}>
                  Rematch ⚔️
                </button>
                <button onClick={resetDuel}
                  style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:12, color:"#9ca3af", fontSize:"1rem", fontWeight:600, padding:"14px 24px", cursor:"pointer" }}>
                  Home
                </button>
              </div>
            </>);
          })()}
        </div>
      )}
    </div>
  );
}
