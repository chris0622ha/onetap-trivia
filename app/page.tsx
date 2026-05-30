"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";

const QUESTIONS = [
  { q: "What planet is closest to the Sun?", a: "Mercury", wrong: ["Venus", "Mars", "Earth"] },
  { q: "How many sides does a hexagon have?", a: "6", wrong: ["5", "7", "8"] },
  { q: "What is the capital of Japan?", a: "Tokyo", wrong: ["Seoul", "Beijing", "Bangkok"] },
  { q: "Who painted the Mona Lisa?", a: "Leonardo da Vinci", wrong: ["Michelangelo", "Raphael", "Botticelli"] },
  { q: "What is the chemical symbol for gold?", a: "Au", wrong: ["Go", "Gd", "Ag"] },
  { q: "How many bones are in the adult human body?", a: "206", wrong: ["198", "215", "230"] },
  { q: "What is the largest ocean on Earth?", a: "Pacific", wrong: ["Atlantic", "Indian", "Arctic"] },
  { q: "In what year did World War II end?", a: "1945", wrong: ["1943", "1944", "1946"] },
  { q: "What is the fastest land animal?", a: "Cheetah", wrong: ["Lion", "Greyhound", "Pronghorn"] },
  { q: "How many strings does a standard guitar have?", a: "6", wrong: ["4", "7", "8"] },
  { q: "What is the square root of 144?", a: "12", wrong: ["11", "13", "14"] },
  { q: "Which element has the symbol O?", a: "Oxygen", wrong: ["Osmium", "Oganesson", "Ozone"] },
  { q: "What is the largest continent?", a: "Asia", wrong: ["Africa", "North America", "Europe"] },
  { q: "Who wrote Romeo and Juliet?", a: "Shakespeare", wrong: ["Dickens", "Tolstoy", "Chaucer"] },
  { q: "How many players are on a basketball team on court?", a: "5", wrong: ["4", "6", "7"] },
  { q: "What is the capital of Australia?", a: "Canberra", wrong: ["Sydney", "Melbourne", "Brisbane"] },
  { q: "What gas do plants absorb from the air?", a: "CO2", wrong: ["O2", "N2", "H2"] },
  { q: "How many hours are in a week?", a: "168", wrong: ["144", "196", "172"] },
  { q: "Which country invented pizza?", a: "Italy", wrong: ["Greece", "Spain", "France"] },
  { q: "What is the longest river in the world?", a: "Nile", wrong: ["Amazon", "Yangtze", "Mississippi"] },
  { q: "How many colors are in a rainbow?", a: "7", wrong: ["5", "6", "8"] },
  { q: "What is the hardest natural substance?", a: "Diamond", wrong: ["Quartz", "Corundum", "Graphene"] },
  { q: "In which sport would you perform a slam dunk?", a: "Basketball", wrong: ["Volleyball", "Tennis", "Handball"] },
  { q: "What is 15% of 200?", a: "30", wrong: ["25", "35", "40"] },
  { q: "Which planet has the most moons?", a: "Saturn", wrong: ["Jupiter", "Uranus", "Neptune"] },
  { q: "What language has the most native speakers?", a: "Mandarin", wrong: ["Spanish", "English", "Hindi"] },
  { q: "How many teeth does an adult human have?", a: "32", wrong: ["28", "30", "34"] },
  { q: "What is the capital of Brazil?", a: "Brasilia", wrong: ["Sao Paulo", "Rio de Janeiro", "Salvador"] },
  { q: "Who invented the telephone?", a: "Alexander Graham Bell", wrong: ["Thomas Edison", "Nikola Tesla", "Guglielmo Marconi"] },
  { q: "What year was the first iPhone released?", a: "2007", wrong: ["2005", "2006", "2008"] },
];

function shuffle(arr: any[]): any[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getOptions(q: any) {
  return shuffle([q.a, ...q.wrong]);
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
  const [anim, setAnim] = useState("");
  const [showStreak, setShowStreak] = useState(false);
  const [name, setName] = useState("");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerRef = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("onetap_lb") || "[]");
      setLeaderboard(saved);
      setName(localStorage.getItem("onetap_name") || "");
    } catch {}
  }, []);

  const endGame = useCallback((finalScore: number, finalStreak: number, finalCorrect: number, finalTotal: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const entry = { name: name || "Anonymous", score: finalScore, streak: finalStreak, date: new Date().toLocaleDateString() };
    setLeaderboard(prev => {
      const updated = [...prev, entry].sort((a, b) => b.score - a.score).slice(0, 10);
      try { localStorage.setItem("onetap_lb", JSON.stringify(updated)); } catch {}
      return updated;
    });
    setScore(finalScore); setCorrect(finalCorrect); setTotal(finalTotal); setBestStreak(finalStreak);
    setScreen("result");
  }, [name]);

  const handleAnswer = useCallback((ans: string, qs: any[], idx: number, curStreak: number, curScore: number, curCorrect: number, curTotal: number, curBest: number) => {
    if (answerRef.current) return;
    answerRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setSelected(ans);
    const isCorrect = ans === qs[idx].a;
    const newStreak = isCorrect ? curStreak + 1 : 0;
    const newScore = isCorrect ? curScore + 10 + Math.min(newStreak, 5) * 10 : curScore;
    const newCorrect = isCorrect ? curCorrect + 1 : curCorrect;
    const newTotal = curTotal + 1;
    const newBest = Math.max(newStreak, curBest);
    setStreak(newStreak); setScore(newScore); setCorrect(newCorrect); setTotal(newTotal); setBestStreak(newBest);
    setAnim(isCorrect ? "pop" : "shake");
    if (isCorrect && newStreak > 1) { setShowStreak(true); setTimeout(() => setShowStreak(false), 900); }
    setTimeout(() => {
      if (idx + 1 >= qs.length) { endGame(newScore, newBest, newCorrect, newTotal); }
      else {
        setQIndex(idx + 1); setOptions(getOptions(qs[idx + 1])); setSelected(null); setTimeLeft(3); setAnim(""); answerRef.current = false;
      }
    }, 800);
  }, [endGame]);

  useEffect(() => {
    if (screen !== "game" || selected !== null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleAnswer("__timeout__", questions, qIndex, streak, score, correct, total, bestStreak);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen, qIndex, selected, questions, streak, score, correct, total, bestStreak, handleAnswer]);

  function startGame() {
    const qs = shuffle(QUESTIONS).slice(0, 15);
    setQuestions(qs); setQIndex(0); setOptions(getOptions(qs[0])); setSelected(null);
    setTimeLeft(3); setStreak(0); setBestStreak(0); setScore(0); setCorrect(0); setTotal(0); setAnim("");
    answerRef.current = false; setScreen("game");
  }

  const q = questions[qIndex];
  const pct = (qIndex / (questions.length || 1)) * 100;
  const medals = ["🥇","🥈","🥉","4️⃣","5️⃣"];

  const LeaderboardView = () => (
    leaderboard.length > 0 ? (
      <div style={{ width:"100%", maxWidth:400, background:"#1a1a2e", borderRadius:16, padding:"20px" }}>
        <div style={{ fontSize:13, color:"#f59e0b", marginBottom:14, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:700 }}>🏆 Leaderboard</div>
        {leaderboard.slice(0, 5).map((e, i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 6px", borderBottom: i < 4 ? "1px solid #2d2d44" : "none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:18, width:24 }}>{medals[i]}</span>
              <span style={{ color:"#e5e7eb", fontWeight:600 }}>{e.name}</span>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ color:"#f59e0b", fontWeight:800, fontSize:18 }}>{e.score}</div>
              <div style={{ color:"#6b7280", fontSize:11 }}>🔥{e.streak}</div>
            </div>
          </div>
        ))}
      </div>
    ) : null
  );

  if (screen === "home") return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px", color:"#fff" }}>
      <div style={{ textAlign:"center", marginBottom:40 }}>
        <div style={{ fontSize:56, marginBottom:8 }}>⚡</div>
        <h1 style={{ fontSize:"2.8rem", fontWeight:900, letterSpacing:"-0.03em", margin:0, background:"linear-gradient(135deg, #f59e0b, #ef4444)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>One-Tap Trivia</h1>
        <p style={{ color:"#6b7280", marginTop:8, fontSize:"1.1rem" }}>3 seconds. One tap. No mercy.</p>
      </div>
      <div style={{ width:"100%", maxWidth:400, background:"#1a1a2e", borderRadius:16, padding:"24px", marginBottom:20 }}>
        <div style={{ fontSize:13, color:"#6b7280", marginBottom:8, letterSpacing:"0.05em", textTransform:"uppercase" }}>Your name</div>
        <input value={name} onChange={e => { setName(e.target.value); try { localStorage.setItem("onetap_name", e.target.value); } catch {} }}
          placeholder="Enter your name..."
          style={{ width:"100%", background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:10, color:"#fff", fontSize:16, padding:"12px 16px", outline:"none" }} />
      </div>
      <button onClick={startGame} style={{ background:"linear-gradient(135deg, #f59e0b, #ef4444)", border:"none", borderRadius:14, color:"#fff", fontSize:"1.2rem", fontWeight:800, padding:"18px 48px", cursor:"pointer", marginBottom:32 }}>
        START GAME ⚡
      </button>
      <LeaderboardView />
    </div>
  );

  if (screen === "result") return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px", color:"#fff" }}>
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:64, marginBottom:8 }}>{correct >= 12 ? "🏆" : correct >= 8 ? "🔥" : correct >= 5 ? "👍" : "💀"}</div>
        <h2 style={{ fontSize:"2rem", fontWeight:900, margin:0 }}>{correct >= 12 ? "Legendary!" : correct >= 8 ? "On Fire!" : correct >= 5 ? "Not Bad!" : "Keep Practicing!"}</h2>
        <p style={{ color:"#6b7280", marginTop:6 }}>{correct}/{total} correct</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:32, width:"100%", maxWidth:400 }}>
        {[["Score", score, "#f59e0b"], ["Best Streak", bestStreak + "🔥", "#ef4444"], ["Accuracy", Math.round((correct/(total||1))*100) + "%", "#10b981"]].map(([label, val, color]) => (
          <div key={label as string} style={{ background:"#1a1a2e", borderRadius:12, padding:"16px 12px", textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:900, color:color as string }}>{val}</div>
            <div style={{ fontSize:11, color:"#6b7280", marginTop:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:32 }}>
        <button onClick={startGame} style={{ background:"linear-gradient(135deg, #f59e0b, #ef4444)", border:"none", borderRadius:12, color:"#fff", fontSize:"1rem", fontWeight:800, padding:"14px 28px", cursor:"pointer" }}>PLAY AGAIN ⚡</button>
        <button onClick={() => setScreen("home")} style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:12, color:"#9ca3af", fontSize:"1rem", fontWeight:600, padding:"14px 28px", cursor:"pointer" }}>Home</button>
      </div>
      <LeaderboardView />
    </div>
  );

  if (!q) return null;

  return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", flexDirection:"column", alignItems:"center", padding:"20px", color:"#fff" }}>
      <div style={{ width:"100%", maxWidth:480, display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:22, fontWeight:900, color:"#f59e0b" }}>{score}</div>
        <div style={{ fontSize:13, color:"#6b7280" }}>{qIndex + 1} / {questions.length}</div>
        <div style={{ fontSize:16, fontWeight:700, color:streak > 0 ? "#ef4444" : "#4b5563" }}>🔥{streak}</div>
      </div>
      <div style={{ width:"100%", maxWidth:480, height:4, background:"#1a1a2e", borderRadius:2, marginBottom:24, overflow:"hidden" }}>
        <div style={{ height:"100%", width:pct + "%", background:"linear-gradient(90deg, #f59e0b, #ef4444)", borderRadius:2, transition:"width 0.3s" }} />
      </div>
      <div style={{ position:"relative", width:80, height:80, marginBottom:24 }}>
        <svg width="80" height="80" style={{ transform:"rotate(-90deg)" }}>
          <circle cx="40" cy="40" r="34" fill="none" stroke="#1a1a2e" strokeWidth="6" />
          <circle cx="40" cy="40" r="34" fill="none"
            stroke={timeLeft <= 1 ? "#ef4444" : timeLeft <= 2 ? "#f59e0b" : "#10b981"}
            strokeWidth="6" strokeDasharray={213.6} strokeDashoffset={213.6 * (1 - timeLeft / 3)}
            style={{ transition:"stroke-dashoffset 0.9s linear, stroke 0.3s" }} />
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:timeLeft <= 1 ? "#ef4444" : "#fff" }}>
          {selected ? "✓" : timeLeft}
        </div>
      </div>
      {showStreak && (
        <div style={{ position:"fixed", top:"30%", left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg, #f59e0b, #ef4444)", borderRadius:16, padding:"12px 24px", fontSize:22, fontWeight:900, zIndex:100 }}>
          🔥 {streak}x STREAK!
        </div>
      )}
      <div style={{ width:"100%", maxWidth:480, background:"#1a1a2e", borderRadius:20, padding:"28px 24px", marginBottom:20, textAlign:"center" }}>
        <div style={{ fontSize:"1.3rem", fontWeight:700, lineHeight:1.4 }}>{q.q}</div>
      </div>
      <div style={{ width:"100%", maxWidth:480, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {options.map((opt, i) => {
          const isSelected = selected === opt;
          const isCorrect = opt === q.a;
          const isWrong = isSelected && !isCorrect;
          const showResult = selected !== null;
          return (
            <button key={i} onClick={() => handleAnswer(opt, questions, qIndex, streak, score, correct, total, bestStreak)}
              disabled={!!selected} className={isSelected ? anim : ""}
              style={{ background: showResult && isCorrect ? "#064e3b" : showResult && isWrong ? "#450a0a" : "#1a1a2e",
                border: `2px solid ${showResult && isCorrect ? "#10b981" : showResult && isWrong ? "#ef4444" : "#2d2d44"}`,
                borderRadius:14, color: showResult && isCorrect ? "#10b981" : showResult && isWrong ? "#ef4444" : "#e5e7eb",
                fontSize:"1rem", fontWeight:700, padding:"20px 16px", cursor:selected ? "default" : "pointer", transition:"all 0.2s", lineHeight:1.3 }}>
              {opt}
            </button>
          );
        })}
      </div>
      {selected === "__timeout__" && (
        <div style={{ marginTop:20, color:"#ef4444", fontWeight:700, fontSize:"1.1rem" }}>
          ⏰ Too slow! Answer: <span style={{ color:"#10b981" }}>{q.a}</span>
        </div>
      )}
    </div>
  );
}
