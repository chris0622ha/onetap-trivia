"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from "react";
import { db, auth, googleProvider } from "../lib/firebase";
import { ref, get, set, update, remove, onValue, off, push } from "firebase/database";
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

// ── Styles ────────────────────────────────────────────────────────────────────
const c = {
  page:    { minHeight:"100vh", background:"#0a0a14", color:"#fff", fontFamily:"system-ui,sans-serif" } as React.CSSProperties,
  sidebar: { width:220, background:"#0f0f1a", borderRight:"1px solid #1e1e30", minHeight:"100vh", padding:"0", flexShrink:0, display:"flex", flexDirection:"column" as const } as React.CSSProperties,
  main:    { flex:1, padding:"28px 32px", overflowY:"auto" as const, maxWidth:"calc(100vw - 220px)" } as React.CSSProperties,
  card:    { background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:14, padding:"20px 24px", marginBottom:20 } as React.CSSProperties,
  h1:      { fontSize:"1.4rem", fontWeight:900, marginBottom:20, margin:"0 0 20px" } as React.CSSProperties,
  h2:      { fontSize:"1rem", fontWeight:800, marginBottom:14, color:"#fff" } as React.CSSProperties,
  label:   { fontSize:11, color:"#6b7280", textTransform:"uppercase" as const, letterSpacing:"0.06em", marginBottom:6, display:"block" },
  input:   { width:"100%", background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:8, color:"#fff", fontSize:14, padding:"9px 12px", outline:"none", boxSizing:"border-box" as const, marginBottom:10 },
  textarea:{ width:"100%", background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:8, color:"#fff", fontSize:14, padding:"9px 12px", outline:"none", boxSizing:"border-box" as const, marginBottom:10, resize:"vertical" as const, minHeight:80 },
  row:     { display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid #1e1e30", flexWrap:"wrap" as const } as React.CSSProperties,
  grid2:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 } as React.CSSProperties,
  grid4:   { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 } as React.CSSProperties,
};

const btn = (color = "#f59e0b", full = false) => ({
  background:`rgba(${color==="r"?"239,68,68":color==="g"?"16,185,129":color==="b"?"99,102,241":color==="y"?"245,158,11":"107,114,128"},0.15)`,
  border:`1px solid ${color==="r"?"#ef4444":color==="g"?"#10b981":color==="b"?"#6366f1":color==="y"?"#f59e0b":"#6b7280"}44`,
  borderRadius:8, color:color==="r"?"#ef4444":color==="g"?"#10b981":color==="b"?"#6366f1":color==="y"?"#f59e0b":"#9ca3af",
  fontSize:13, fontWeight:700, padding:"8px 14px", cursor:"pointer",
  width: full ? "100%" : "auto",
} as React.CSSProperties);

const tag = (col: string) => ({
  background:`rgba(${col},0.15)`, border:`1px solid rgba(${col},0.3)`,
  borderRadius:99, color:`rgb(${col})`, fontSize:11, fontWeight:700, padding:"2px 8px",
} as React.CSSProperties);

const CATEGORIES = ["geography","science","history","math","sports","entertainment"];
const CAT_EMOJI: Record<string,string> = { geography:"🗺️", science:"🔬", history:"📜", math:"🔢", sports:"⚽", entertainment:"🎬" };

// Module-level admin context — set when AdminPage mounts
let _adminUid = "unknown";
let _adminUsername = "admin";

async function logAdminAction(action: string, target?: string, details?: string) {
  try {
    const key = Date.now().toString() + "_" + Math.random().toString(36).slice(2,6);
    await set(ref(db, "adminLog/" + key), {
      adminUid: _adminUid,
      adminUsername: _adminUsername,
      action,
      target: target || null,
      details: details || null,
      ts: Date.now(),
      time: new Date().toLocaleString(),
    });
  } catch(e) { console.error("logAdminAction failed:", e); }
}

function BadgeIcon({ badge, size=13 }: { badge?:string|null; size?:number }) {
  if (!badge) return null;
  if (badge==="star")   return <span title="Loyal Player" style={{fontSize:size}}>⭐</span>;
  if (badge==="check")  return <span title="Verified" style={{fontSize:size,color:"#3b82f6",fontWeight:900}}>✓</span>;
  if (badge==="crown")  return <span title="Champion" style={{fontSize:size}}>👑</span>;
  if (badge==="tester") return <span title="Tester" style={{fontSize:size*0.85,background:"#ca8a04",color:"#fff",borderRadius:4,padding:"1px 5px",fontWeight:900,fontFamily:"monospace"}}>T</span>;
  if (badge==="gold")   return <span title="Gold Medal" style={{fontSize:size}}>🥇</span>;
  if (badge==="silver") return <span title="Silver Medal" style={{fontSize:size}}>🥈</span>;
  if (badge==="bronze") return <span title="Bronze Medal" style={{fontSize:size}}>🥉</span>;
  return null;
}
function Avatar({ src, name, size=32 }: { src?:string|null; name:string; size?:number }) {
  return src ? (
    <img src={src} alt="" width={size} height={size} style={{ borderRadius:"50%", border:"2px solid #2d2d44", flexShrink:0, display:"block", objectFit:"cover" }} />
  ) : (
    <div style={{ width:size, height:size, borderRadius:"50%", background:"rgba(245,158,11,0.2)", border:"2px solid #2d2d44", display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.4, fontWeight:900, color:"#f59e0b", flexShrink:0 }}>
      {(name||"?")[0].toUpperCase()}
    </div>
  );
}

function Flash({ msg }: { msg:{text:string;type:"success"|"error"|"info"}|null }) {
  if (!msg) return null;
  const col = msg.type==="success"?"16,185,129":msg.type==="error"?"239,68,68":"99,102,241";
  return <div style={{ background:`rgba(${col},0.1)`, border:`1px solid rgba(${col},0.3)`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, color:`rgb(${col})` }}>{msg.text}</div>;
}

function useFlash() {
  const [msg, setMsg] = useState<{text:string;type:"success"|"error"|"info"}|null>(null);
  const flash = (text: string, type:"success"|"error"|"info"="success") => {
    setMsg({ text, type }); setTimeout(() => setMsg(null), 3000);
  };
  return { msg, flash };
}

function EditRow({ label, value, onChange, onSave, placeholder, color="b" }: {
  label:string; value:string; onChange:(v:string)=>void; onSave:()=>void; placeholder:string; color?:string;
}) {
  return (
    <div style={{ marginBottom:12 }}>
      <label style={c.label}>{label}</label>
      <div style={{ display:"flex", gap:8 }}>
        <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          onKeyDown={e=>e.key==="Enter"&&onSave()}
          style={{ ...c.input, marginBottom:0, flex:1 }} />
        <button onClick={onSave} style={btn(color)}>Set</button>
      </div>
    </div>
  );
}

// ── STATS DASHBOARD ───────────────────────────────────────────────────────────
function StatsPanel() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      get(ref(db, "users")),
      get(ref(db, "leaderboard")),
      get(ref(db, "bans")),
    ]).then(([uSnap, lbSnap, banSnap]) => {
      const users: any[] = uSnap.exists() ? Object.values(uSnap.val()) : [];
      const lb: any[] = lbSnap.exists() ? Object.values(lbSnap.val()) : [];
      const bans: any[] = banSnap.exists() ? Object.values(banSnap.val()) : [];

      const today = new Date().toLocaleDateString();
      const totalGames = users.reduce((s,u) => s+(u.gamesPlayed||0), 0);
      const totalCorrect = users.reduce((s,u) => s+(u.totalCorrect||0), 0);
      const totalQuestions = users.reduce((s,u) => s+(u.totalQuestions||0), 0);
      const playedToday = users.filter(u => u.lastPlayed === today).length;
      const topScore = lb.length ? Math.max(...lb.map(e=>typeof e.score==="number" && e.score < 1000000 ? e.score : 0)) : 0;
      const catCounts: Record<string,number> = {};
      lb.forEach(e => { if(e.category) catCounts[e.category] = (catCounts[e.category]||0)+1; });
      const topCat = Object.entries(catCounts).sort(([,a],[,b])=>b-a)[0]?.[0] ?? "—";
      const totalDuels = users.reduce((s,u) => s+(u.duelsPlayed||0), 0);
      const totalDuelWins = users.reduce((s,u) => s+(u.duelWins||0), 0);

      setStats({ totalUsers:users.length, totalGames, totalCorrect, totalQuestions,
        playedToday, topScore, topCat, activeBans:bans.length, lbEntries:lb.length,
        totalDuels, totalDuelWins });
      setLoading(false);
    });
  }, []);

  const Stat = ({ label, value, color="#f59e0b", sub="" }: any) => (
    <div style={{ ...c.card, marginBottom:0, textAlign:"center" as const }}>
      <div style={{ fontSize:28, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:11, color:"#6b7280", marginTop:4, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:"#4b5563", marginTop:2 }}>{sub}</div>}
    </div>
  );

  if (loading) return <div style={{ color:"#6b7280" }}>Loading…</div>;
  const acc = stats.totalQuestions > 0 ? Math.round(stats.totalCorrect/stats.totalQuestions*100) : 0;

  return (
    <div>
      <h1 style={c.h1}>📊 Dashboard</h1>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12, marginBottom:24 }}>
        <Stat label="Total Users" value={stats.totalUsers} color="#f59e0b" />
        <Stat label="Total Games" value={stats.totalGames.toLocaleString()} color="#10b981" />
        <Stat label="Active Today" value={stats.playedToday} color="#6366f1" />
        <Stat label="Top Score" value={stats.topScore.toLocaleString()} color="#ef4444" />
        <Stat label="Leaderboard Entries" value={stats.lbEntries} color="#f59e0b" />
        <Stat label="Active Bans" value={stats.activeBans} color="#ef4444" />
        <Stat label="Accuracy" value={`${acc}%`} color="#10b981" sub={`${stats.totalCorrect.toLocaleString()} / ${stats.totalQuestions.toLocaleString()}`} />
        <Stat label="Top Category" value={CAT_EMOJI[stats.topCat]||"—"} color="#f59e0b" sub={stats.topCat} />
        <Stat label="Total Duels" value={stats.totalDuels||0} color="#6366f1" />
        <Stat label="Duel Wins" value={stats.totalDuelWins||0} color="#a855f7" />
      </div>
    </div>
  );
}

// ── ANNOUNCEMENT ──────────────────────────────────────────────────────────────
function AnnouncementPanel() {
  const [text, setText] = useState("");
  const [current, setCurrent] = useState<any>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const { msg, flash } = useFlash();

  useEffect(() => {
    get(ref(db, "config/announcement")).then(s => { if(s.exists()) setCurrent(s.val()); });
    get(ref(db, "config/maintenanceMode")).then(s => { if(s.exists()) setMaintenanceMode(s.val()); });
  }, []);

  async function saveAnnouncement() {
    if (!text.trim()) { flash("Enter announcement text", "error"); return; }
    const data = { text:text.trim(), postedAt:new Date().toLocaleString() };
    await set(ref(db, "config/announcement"), data);
    setCurrent(data); setText("");
    flash("Announcement posted — shows on everyone's home screen");
  }

  async function clearAnnouncement() {
    await remove(ref(db, "config/announcement"));
    setCurrent(null);
    flash("Announcement cleared");
  }

  async function toggleMaintenance() {
    const next = !maintenanceMode;
    await set(ref(db, "config/maintenanceMode"), next);
    setMaintenanceMode(next);
    flash(next ? "🔴 Maintenance mode ON — non-admins see maintenance screen" : "🟢 Maintenance mode OFF");
  }

  return (
    <div>
      <h1 style={c.h1}>📢 Announcements & Maintenance</h1>
      <Flash msg={msg} />

      <div style={c.card}>
        <div style={c.h2}>Maintenance Mode</div>
        <p style={{ color:"#9ca3af", fontSize:13, marginBottom:14, lineHeight:1.6 }}>
          When ON, non-admins see a maintenance screen instead of the game. You can still access everything.
        </p>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:12, height:12, borderRadius:"50%", background:maintenanceMode?"#ef4444":"#10b981", flexShrink:0 }} />
          <span style={{ color: maintenanceMode?"#ef4444":"#10b981", fontWeight:700 }}>
            {maintenanceMode ? "Maintenance mode is ON" : "Game is live"}
          </span>
          <button onClick={toggleMaintenance} style={btn(maintenanceMode?"g":"r")}>
            {maintenanceMode ? "Turn OFF" : "Turn ON"}
          </button>
        </div>
      </div>

      <div style={c.card}>
        <div style={c.h2}>Global Announcement</div>
        <p style={{ color:"#9ca3af", fontSize:13, marginBottom:14 }}>Shows as a banner on everyone's home screen.</p>
        {current && (
          <div style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:10, padding:"12px 16px", marginBottom:14 }}>
            <div style={{ fontSize:13, color:"#f59e0b", fontWeight:700, marginBottom:4 }}>Current announcement:</div>
            <div style={{ color:"#e5e7eb" }}>{current.text}</div>
            <div style={{ fontSize:11, color:"#4b5563", marginTop:6 }}>Posted: {current.postedAt}</div>
            <button onClick={clearAnnouncement} style={{ ...btn("r"), marginTop:10 }}>Clear</button>
          </div>
        )}
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Type your announcement…" style={c.textarea} />
        <button onClick={saveAnnouncement} style={{ ...btn("y"), width:"100%" }}>Post Announcement</button>
      </div>

      {/* Mass Push Notification */}
      <div style={c.card}>
        <div style={c.h2}>📣 Mass Push Notification</div>
        <p style={{ color:"#9ca3af", fontSize:13, marginBottom:12 }}>Sends a real push notification to ALL users who have notifications enabled.</p>
        <MassPushPanel />
      </div>
    </div>
  );
}

// ── QUESTION EDITOR ───────────────────────────────────────────────────────────
function QuestionsPanel() {
  const [category, setCategory] = useState("geography");
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string|null>(null);
  const [form, setForm] = useState({ q:"", a:"", w1:"", w2:"", w3:"" });
  const [search, setSearch] = useState("");
  const { msg, flash } = useFlash();

  useEffect(() => {
    setLoading(true);
    get(ref(db, `customQuestions/${category}`)).then(snap => {
      if (!snap.exists()) { setQuestions([]); setLoading(false); return; }
      const list = Object.entries(snap.val()).map(([key,v]:any) => ({ key, ...v }));
      setQuestions(list);
      setLoading(false);
    });
  }, [category]);

  async function saveQuestion() {
    if (!form.q.trim() || !form.a.trim() || !form.w1.trim() || !form.w2.trim() || !form.w3.trim()) {
      flash("Fill in all fields", "error"); return;
    }
    const data = { q:form.q.trim(), a:form.a.trim(), w:[form.w1.trim(),form.w2.trim(),form.w3.trim()] };
    if (editingKey) {
      await set(ref(db, `customQuestions/${category}/${editingKey}`), data);
      setQuestions(qs => qs.map(q => q.key===editingKey ? { key:editingKey, ...data } : q));
      flash("Question updated");
    } else {
      const newRef = push(ref(db, `customQuestions/${category}`));
      await set(newRef, data);
      setQuestions(qs => [...qs, { key:newRef.key, ...data }]);
      flash("Question added");
    }
    setForm({ q:"", a:"", w1:"", w2:"", w3:"" });
    setEditingKey(null);
  }

  async function deleteQuestion(key: string) {
    await remove(ref(db, `customQuestions/${category}/${key}`));
    setQuestions(qs => qs.filter(q => q.key!==key));
    flash("Deleted");
  }

  function startEdit(q: any) {
    setEditingKey(q.key);
    setForm({ q:q.q, a:q.a, w1:q.w[0]||"", w2:q.w[1]||"", w3:q.w[2]||"" });
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  const filtered = questions.filter(q => !search || q.q.toLowerCase().includes(search.toLowerCase()) || q.a.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <h1 style={c.h1}>❓ Question Editor</h1>
      <Flash msg={msg} />
      <div style={{ background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#a5b4fc" }}>
        Custom questions are stored in Firebase and mixed into the game alongside the built-in questions.
      </div>

      {/* Category tabs */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)} style={{
            ...btn(category===cat?"y":""),
            opacity: category===cat ? 1 : 0.6,
          }}>{CAT_EMOJI[cat]} {cat}</button>
        ))}
      </div>

      {/* Add/edit form */}
      <div style={c.card}>
        <div style={c.h2}>{editingKey ? "✏️ Edit question" : "➕ Add question"} — {CAT_EMOJI[category]} {category}</div>
        <label style={c.label}>Question</label>
        <textarea value={form.q} onChange={e=>setForm(f=>({...f,q:e.target.value}))} placeholder="Enter the question…" style={c.textarea} />
        <label style={c.label}>Correct answer</label>
        <input value={form.a} onChange={e=>setForm(f=>({...f,a:e.target.value}))} placeholder="Correct answer" style={{ ...c.input, borderColor:"rgba(16,185,129,0.4)", color:"#10b981" }} />
        <label style={c.label}>Wrong answers</label>
        <div style={c.grid2}>
          <input value={form.w1} onChange={e=>setForm(f=>({...f,w1:e.target.value}))} placeholder="Wrong answer 1" style={{ ...c.input, borderColor:"rgba(239,68,68,0.3)" }} />
          <input value={form.w2} onChange={e=>setForm(f=>({...f,w2:e.target.value}))} placeholder="Wrong answer 2" style={{ ...c.input, borderColor:"rgba(239,68,68,0.3)" }} />
        </div>
        <input value={form.w3} onChange={e=>setForm(f=>({...f,w3:e.target.value}))} placeholder="Wrong answer 3" style={{ ...c.input, borderColor:"rgba(239,68,68,0.3)" }} />
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={saveQuestion} style={{ ...btn("y"), flex:1 }}>{editingKey ? "Save changes" : "Add question"}</button>
          {editingKey && <button onClick={() => { setEditingKey(null); setForm({ q:"", a:"", w1:"", w2:"", w3:"" }); }} style={btn()}>Cancel</button>}
        </div>
      </div>

      {/* Question list */}
      <div style={c.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={c.h2}>{CAT_EMOJI[category]} Custom {category} questions ({questions.length})</div>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search questions…" style={c.input} />
        {loading ? <div style={{ color:"#6b7280" }}>Loading…</div> :
          filtered.length === 0 ? <div style={{ color:"#4b5563", fontSize:13 }}>No custom questions yet for this category.</div> :
          filtered.map(q => (
            <div key={q.key} style={{ ...c.row, alignItems:"flex-start" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>{q.q}</div>
                <div style={{ fontSize:12 }}>
                  <span style={{ color:"#10b981" }}>✓ {q.a}</span>
                  <span style={{ color:"#ef4444", marginLeft:12 }}>✗ {q.w.join(" · ")}</span>
                </div>
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                <button onClick={() => startEdit(q)} style={btn("b")}>Edit</button>
                <button onClick={() => deleteQuestion(q.key)} style={btn("r")}>Delete</button>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── USER DUEL HISTORY ────────────────────────────────────────────────────────
function UserDuelHistory({ uid }: { uid: string }) {
  const [duels, setDuels] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    get(ref(db, "duels")).then(snap => {
      if (!snap.exists()) { setDuels([]); setLoading(false); return; }
      const list = Object.values(snap.val() as any).filter((d: any) =>
        d.p1?.uid === uid || d.p2?.uid === uid
      ).sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, 20) as any[];
      setDuels(list);
      setLoading(false);
    });
  }, [uid, open]);

  return (
    <div style={{ marginTop:8 }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...btn(), width:"100%", display:"flex", justifyContent:"space-between" }}>
        <span>⚔️ Duel History</span><span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:8, marginTop:6, maxHeight:220, overflowY:"auto" as const }}>
          {loading ? <div style={{ padding:12, color:"#6b7280", fontSize:13 }}>Loading…</div> :
            duels.length === 0 ? <div style={{ padding:12, color:"#4b5563", fontSize:13 }}>No duels found</div> :
            duels.map((d: any, i) => {
              const isP1 = d.p1?.uid === uid;
              const mySlot = isP1 ? "p1" : "p2";
              const theirSlot = isP1 ? "p2" : "p1";
              const myScore = d[`${mySlot}TotalScore`] ?? 0;
              const theirScore = d[`${theirSlot}TotalScore`] ?? 0;
              const result = myScore > theirScore ? "W" : myScore < theirScore ? "L" : "D";
              const col = result === "W" ? "#10b981" : result === "L" ? "#ef4444" : "#6b7280";
              return (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 12px", borderBottom:"1px solid #1e1e30", fontSize:12 }}>
                  <div>
                    <span style={{ color:col, fontWeight:900, marginRight:8 }}>{result}</span>
                    <span style={{ color:"#d1d5db" }}>vs {d[theirSlot]?.name || "?"}</span>
                  </div>
                  <div style={{ color:"#6b7280" }}>{myScore} – {theirScore} · {new Date(d.createdAt).toLocaleDateString()}</div>
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
}

// ── LOGIN HISTORY ─────────────────────────────────────────────────────────────
function LoginHistory({ uid }: { uid: string }) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    get(ref(db, `users/${uid}/loginHistory`)).then(snap => {
      if (!snap.exists()) { setHistory([]); setLoading(false); return; }
      const list = Object.values(snap.val() as any).sort((a:any,b:any) => b.ts - a.ts);
      setHistory(list as any[]);
      setLoading(false);
    });
  }, [uid, open]);

  return (
    <div style={{ marginTop:10 }}>
      <button onClick={()=>setOpen(o=>!o)} style={{ ...btn(), width:"100%", justifyContent:"space-between", display:"flex" }}>
        <span>🕐 Login History</span><span>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={{ background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:8, marginTop:6, maxHeight:200, overflowY:"auto" as const }}>
          {loading ? <div style={{ padding:12, color:"#6b7280", fontSize:13 }}>Loading…</div> :
            history.length === 0 ? <div style={{ padding:12, color:"#4b5563", fontSize:13 }}>No login history yet</div> :
            history.map((h:any, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 12px", borderBottom:"1px solid #1e1e30", fontSize:12 }}>
                <span style={{ color:"#d1d5db" }}>{h.loginAt}</span>
                <span style={{ color: h.durationMin != null ? "#10b981" : "#4b5563" }}>
                  {h.durationMin != null ? `${h.durationMin}m` : "active/unknown"}
                </span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ── USERS PANEL ───────────────────────────────────────────────────────────────
function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [userSort, setUserSort] = useState<"score"|"warned"|"banned">("score");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const { msg, flash } = useFlash();
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editScore, setEditScore] = useState("");
  const [editStreak, setEditStreak] = useState("");
  const [editChangesLeft, setEditChangesLeft] = useState("");
  const [editGames, setEditGames] = useState("");

  useEffect(() => {
    get(ref(db, "users")).then(snap => {
      if (!snap.exists()) { setLoading(false); return; }
      const list = Object.entries(snap.val()).map(([uid,d]:any) => ({ uid, ...d }));
      setUsers(list.sort((a,b) => (b.bestScore||0)-(a.bestScore||0)));
      setAllUsers(list);
      setLoading(false);
    });
  }, []);

  const patchUser = (uid: string, patch: any) => {
    setUsers(u => u.map(x => x.uid===uid ? { ...x, ...patch } : x));
    setSelected((s: any) => s?.uid===uid ? { ...s, ...patch } : s);
  };

  async function handleSetUsername(uid: string) {
    const val = editUsername.trim();
    if (!val||val.length<1) { flash("Username cannot be empty", "error"); return; }
    const old = selected?.username;
    const updates: any = {};
    updates[`users/${uid}/username`] = val;
    updates[`users/${uid}/displayName`] = val;
    if (old) updates[`usernames/${old.toLowerCase()}`] = null;
    updates[`usernames/${val.toLowerCase()}`] = uid;
    await update(ref(db), updates);
    patchUser(uid, { username:val });
    logAdminAction("CHANGE_USERNAME", uid, val);
    flash(`Username → ${val}`); setEditUsername("");
  }

  async function handleSetDisplayName(uid: string) {
    const val = editDisplayName.trim();
    if (!val) { flash("Enter a display name", "error"); return; }
    await update(ref(db, `users/${uid}`), { displayName: val });
    patchUser(uid, { displayName: val });
    flash(`Display name → ${val}`); setEditDisplayName("");
  }

  async function handleSetScore(uid: string) {
    const val = parseInt(editScore);
    if (isNaN(val)) { flash("Invalid score", "error"); return; }
    const snap = await get(ref(db, "leaderboard"));
    if (snap.exists()) {
      const updates: any = {};
      Object.entries(snap.val()).forEach(([k,v]:any) => { if(k.startsWith(uid+"_")||v?.uid===uid) updates[`leaderboard/${k}/score`]=val; });
      if (Object.keys(updates).length) await update(ref(db), updates);
    }
    await update(ref(db, `users/${uid}`), { bestScore:val });
    patchUser(uid, { bestScore:val });
    flash(`Best score → ${val}`); setEditScore("");
  }

  async function handleSetStreak(uid: string) {
    const val = parseInt(editStreak);
    if (isNaN(val)||val<0) { flash("Invalid streak", "error"); return; }
    await update(ref(db, `users/${uid}`), { bestStreak:val });
    patchUser(uid, { bestStreak:val });
    flash(`Best streak → ${val}`); setEditStreak("");
  }

  async function handleSetChanges(uid: string) {
    const val = parseInt(editChangesLeft);
    if (isNaN(val)||val<0) { flash("Invalid number", "error"); return; }
    await update(ref(db, `users/${uid}`), { usernameChangesLeft:val });
    patchUser(uid, { usernameChangesLeft:val });
    flash(`Username changes left → ${val}`); setEditChangesLeft("");
  }

  async function handleSetGames(uid: string) {
    const val = parseInt(editGames);
    if (isNaN(val)||val<0) { flash("Invalid number", "error"); return; }
    await update(ref(db, `users/${uid}`), { gamesPlayed:val });
    patchUser(uid, { gamesPlayed:val });
    flash(`Games played → ${val}`); setEditGames("");
  }

  async function handleWipeStats(uid: string) {
    if (!confirm(`Wipe all stats for ${selected?.username}? This cannot be undone.`)) return;
    await update(ref(db, `users/${uid}`), { bestScore:0, bestStreak:0, gamesPlayed:0, totalScore:0, totalCorrect:0, totalQuestions:0, categoryBests:{} });
    patchUser(uid, { bestScore:0, bestStreak:0, gamesPlayed:0 });
    logAdminAction("WIPE_STATS", selected?.username||uid);
    flash("Stats wiped");
  }

  async function handleDeleteLB(uid: string) {
    if (!confirm(`Delete all leaderboard entries for ${selected?.username}?`)) return;
    const snap = await get(ref(db, "leaderboard"));
    if (!snap.exists()) return;
    const updates: any = {};
    Object.keys(snap.val()).forEach(k => { if(k.startsWith(uid+"_")||snap.val()[k]?.uid===uid) updates[`leaderboard/${k}`]=null; });
    if (Object.keys(updates).length) await update(ref(db), updates);
    flash("Leaderboard entries deleted");
  }

  async function handleToggleAdmin(uid: string, current: boolean) {
    await update(ref(db, `users/${uid}`), { isAdmin:!current });
    patchUser(uid, { isAdmin:!current });
    flash(`Admin ${!current?"granted":"revoked"}`);
  }

  const filtered = users.filter(u => !search || u.username?.toLowerCase().includes(search.toLowerCase()) || u.uid.includes(search));

  return (
    <div>
      <h1 style={c.h1}>👥 Users ({users.length})</h1>
      <Flash msg={msg} />
      <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" as const }}>
        {(["score","warned","banned"] as const).map(s=>(
          <button key={s} onClick={()=>{
            setUserSort(s);
            if(s==="score") setUsers([...allUsers].sort((a,b)=>(b.bestScore||0)-(a.bestScore||0)));
            if(s==="warned") setUsers([...allUsers].sort((a,b)=>(b.lastWarnedAt||0)-(a.lastWarnedAt||0)));
            if(s==="banned") setUsers([...allUsers].sort((a,b)=>(b.lastBannedAt||0)-(a.lastBannedAt||0)));
          }} style={{ ...btn(userSort===s?"y":""), fontSize:12, opacity:userSort===s?1:0.6 }}>
            {s==="score"?"🏆 Top Score":s==="warned"?"⚠️ Recently Warned":"🔨 Recently Banned"}
          </button>
        ))}
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by username or UID…" style={c.input} />

      <div style={{ display:"grid", gridTemplateColumns:selected?"1fr 360px":"1fr", gap:20 }}>
        <div style={c.card}>
          {loading ? <div style={{ color:"#6b7280" }}>Loading…</div> :
            filtered.map(u => (
              <div key={u.uid} onClick={() => setSelected(selected?.uid===u.uid?null:u)}
                style={{ ...c.row, cursor:"pointer", background:selected?.uid===u.uid?"rgba(245,158,11,0.05)":"transparent", borderRadius:8, padding:"10px 8px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0 }}>
                  <Avatar src={u.photoURL} name={u.username||"?"} size={36} />
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                      {u.username}
                      <BadgeIcon badge={u.badge} size={13} />
                      {u.isAdmin && <span style={{ marginLeft:6, ...tag("245,158,11") }}>admin</span>}
                      {u.banned && <span style={{ marginLeft:6, ...tag("239,68,68") }}>banned</span>}
                    </div>
                    <div style={{ fontSize:11, color:"#4b5563", fontFamily:"monospace" }}>{u.uid.slice(0,18)}…</div>
                  </div>
                </div>
                <div style={{ textAlign:"right" as const, flexShrink:0 }}>
                  <div style={{ color:"#f59e0b", fontWeight:800 }}>{u.bestScore??0}</div>
                  <div style={{ fontSize:11, color:"#6b7280" }}>{u.gamesPlayed??0} games</div>
                  {u.lastWarnedAt && <div style={{ fontSize:10, color:"#f59e0b" }}>⚠️</div>}
                  {u.lastBannedAt && <div style={{ fontSize:10, color:"#ef4444" }}>🔨</div>}
                </div>
              </div>
            ))
          }
        </div>

        {selected && (
          <div style={{ ...c.card, position:"sticky" as const, top:20, alignSelf:"start" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16, paddingBottom:16, borderBottom:"1px solid #2d2d44" }}>
              <Avatar src={selected.photoURL} name={selected.username} size={48} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:900, fontSize:"1.1rem" }}>{selected.username}</div>
                <div style={{ fontSize:10, color:"#6b7280", fontFamily:"monospace", wordBreak:"break-all" as const }}>{selected.uid}</div>
              </div>
              <button onClick={()=>setSelected(null)} style={{ background:"transparent", border:"none", color:"#6b7280", fontSize:18, cursor:"pointer" }}>×</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
              {[["Score",selected.bestScore??0,"#f59e0b"],["Games",selected.gamesPlayed??0,"#e5e7eb"],
                ["Streak",selected.bestStreak??0,"#ef4444"],["@ Left",selected.usernameChangesLeft??3,"#10b981"]
              ].map(([l,v,col])=>(
                <div key={l as string} style={{ background:"#0f0f1a", borderRadius:10, padding:"10px", textAlign:"center" as const, border:"1px solid #2d2d44" }}>
                  <div style={{ fontSize:18, fontWeight:900, color:col as string }}>{v as number}</div>
                  <div style={{ fontSize:10, color:"#6b7280" }}>{l}</div>
                </div>
              ))}
            </div>

            <EditRow label="Username" value={editUsername} onChange={setEditUsername} onSave={()=>handleSetUsername(selected.uid)} placeholder="New username" color="g" />
            <EditRow label="Display name" value={editDisplayName} onChange={setEditDisplayName} onSave={()=>handleSetDisplayName(selected.uid)} placeholder="Name shown on leaderboard" color="g" />
            <EditRow label="Best score" value={editScore} onChange={setEditScore} onSave={()=>handleSetScore(selected.uid)} placeholder="New score" color="b" />
            <EditRow label="Best streak" value={editStreak} onChange={setEditStreak} onSave={()=>handleSetStreak(selected.uid)} placeholder="New streak" color="r" />
            <EditRow label="Username changes left" value={editChangesLeft} onChange={setEditChangesLeft} onSave={()=>handleSetChanges(selected.uid)} placeholder="e.g. 0, 3, 99" color="y" />
            <EditRow label="Games played" value={editGames} onChange={setEditGames} onSave={()=>handleSetGames(selected.uid)} placeholder="New count" color="b" />

            {/* Badge assignment */}
            <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #2d2d44" }}>
              <label style={c.label}>Reward Badge</label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, marginBottom:10 }}>
                {[["none","None","#6b7280"],["star","⭐ Star","#f59e0b"],["check","✓ Verified","#3b82f6"],["crown","👑 Crown","#a855f7"],["tester","T Tester","#ca8a04"],["gold","🥇 Gold","#f59e0b"],["silver","🥈 Silver","#9ca3af"],["bronze","🥉 Bronze","#cd7c3a"]].map(([val,label,col])=>(
                  <button key={val} onClick={async()=>{
                    const badgeVal = val==="none" ? null : val;
                    await update(ref(db,`users/${selected.uid}`),{badge:badgeVal});
                    // Also update leaderboard entries so badge shows there
                    const lbSnap = await get(ref(db,"leaderboard"));
                    if (lbSnap.exists()) {
                      const updates: any = {};
                      Object.keys(lbSnap.val()).forEach(k => {
                        if (k.startsWith(selected.uid+"_") || lbSnap.val()[k]?.uid===selected.uid) {
                          updates[`leaderboard/${k}/badge`] = badgeVal;
                        }
                      });
                      if (Object.keys(updates).length) await update(ref(db), updates);
                    }
                    patchUser(selected.uid,{badge:badgeVal});
                    logAdminAction("SET_BADGE", selected?.username||"?", val);
                    flash(`Badge ${val==="none"?"removed":`set to ${label}`}`);
                  }} style={{ ...btn(), borderColor:selected.badge===(val==="none"?null:val)?col+"88":"#2d2d4488", color:selected.badge===(val==="none"?null:val)?col:"#6b7280", background:selected.badge===(val==="none"?null:val)?`${col}22`:"transparent" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Login history */}
            <LoginHistory uid={selected.uid} />

            <div style={{ display:"flex", flexDirection:"column" as const, gap:8, marginTop:12, paddingTop:12, borderTop:"1px solid #2d2d44" }}>
              <button onClick={()=>handleWipeStats(selected.uid)} style={btn("r",true)}>⚠️ Wipe all stats</button>
              <button onClick={()=>handleDeleteLB(selected.uid)} style={btn("r",true)}>Delete leaderboard entries</button>
              <button onClick={()=>handleToggleAdmin(selected.uid,selected.isAdmin)} style={btn(selected.isAdmin?"r":"y",true)}>
                {selected.isAdmin?"Revoke admin":"Grant admin"}
              </button>
              <button onClick={() => {
                sessionStorage.setItem("impersonateUid", selected.uid);
                window.dispatchEvent(new CustomEvent("admin-impersonate", { detail: { uid: selected.uid } }));
                window.dispatchEvent(new CustomEvent("admin-tab", { detail: { tab: "system" } }));
              }} style={{ ...btn("g"), width:"100%", marginBottom:8 }}>
                👁️ View As This User
              </button>
              <a href={`/admin?tab=bans&uid=${selected.uid}`} style={{ ...btn("r",true), textAlign:"center" as const, textDecoration:"none", display:"block" }}>
                Ban this user →
              </a>
              <UserDuelHistory uid={selected.uid} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── LEADERBOARD PANEL ─────────────────────────────────────────────────────────
function LeaderboardPanel() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const { msg, flash } = useFlash();
  const [editingKey, setEditingKey] = useState<string|null>(null);
  const [editScore, setEditScore] = useState("");

  useEffect(() => {
    const lbRef = ref(db, "leaderboard");
    const unsub = onValue(lbRef, snap => {
      if (!snap.exists()) { setEntries([]); setLoading(false); return; }
      const list = Object.entries(snap.val()).map(([key,d]:any) => ({ key, ...d }));
      setEntries(list.sort((a,b)=>b.score-a.score));
      setLoading(false);
    });
    return () => off(lbRef);
  }, []);

  async function handleDelete(key: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await remove(ref(db, `leaderboard/${key}`));
    flash(`Deleted ${name}`);
  }

  async function handleBulkDelete() {
    const toDelete = filtered;
    if (!toDelete.length) return;
    if (!confirm(`Delete all ${toDelete.length} shown entries?`)) return;
    const updates: any = {};
    toDelete.forEach(e => updates[`leaderboard/${e.key}`] = null);
    await update(ref(db), updates);
    flash(`Deleted ${toDelete.length} entries`);
  }

  async function handleEditScore(key: string) {
    const score = parseInt(editScore);
    if (isNaN(score)) { flash("Invalid score", "error"); return; }
    await update(ref(db, `leaderboard/${key}`), { score });
    flash(`Score → ${score}`); setEditingKey(null); setEditScore("");
  }

  const filtered = entries.filter(e => {
    if (catFilter!=="all" && e.category!==catFilter) return false;
    if (search && !e.name?.toLowerCase().includes(search.toLowerCase()) && !e.username?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <h1 style={{ fontSize:"1.4rem", fontWeight:900, margin:0 }}>🏆 Leaderboard ({entries.length} entries)</h1>
        <button onClick={() => {
          const rows = [["Name","Username","Score","Streak","Category","Questions","Timer","Date"]];
          entries.forEach(e => rows.push([e.name,e.username||"",e.score,e.streak,e.category,e.roundSize||"",e.timerDuration===0?"∞":`${e.timerDuration}s`,e.date||""]));
          const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
          const blob = new Blob([csv], { type:"text/csv" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = `trivquic-leaderboard-${new Date().toISOString().split("T")[0]}.csv`; a.click();
        }} style={btn("g")}>⬇ Export CSV</button>
      </div>
      <Flash msg={msg} />
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, marginBottom:12 }}>
        {["all",...CATEGORIES].map(cat=>(
          <button key={cat} onClick={()=>setCatFilter(cat)} style={{ ...btn(catFilter===cat?"y":""), opacity:catFilter===cat?1:0.6, fontSize:12, padding:"5px 10px" }}>
            {cat==="all"?"All":CAT_EMOJI[cat]+" "+cat}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name…" style={{ ...c.input, marginBottom:0, flex:1 }} />
        <button onClick={handleBulkDelete} style={btn("r")}>Delete shown ({filtered.length})</button>
      </div>
      <div style={c.card}>
        {loading ? <div style={{ color:"#6b7280" }}>Loading…</div> :
          filtered.length===0 ? <div style={{ color:"#4b5563" }}>No entries</div> :
          filtered.map((e,i)=>(
            <div key={e.key} style={c.row}>
              <span style={{ fontSize:12, fontWeight:800, color:"#4b5563", width:28, textAlign:"right" as const, flexShrink:0 }}>{i+1}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{e.name}</div>
                <div style={{ fontSize:10, color:"#4b5563" }}>{e.category} · {e.roundSize??'?'}Q · {e.timerDuration===0?"∞":`${e.timerDuration??'?'}s`} · {e.date??''}</div>
              </div>
              {editingKey===e.key ? (
                <div style={{ display:"flex", gap:6 }}>
                  <input value={editScore} onChange={ev=>setEditScore(ev.target.value)} placeholder="Score"
                    style={{ ...c.input, marginBottom:0, width:80 }} />
                  <button onClick={()=>handleEditScore(e.key)} style={btn("g")}>✓</button>
                  <button onClick={()=>setEditingKey(null)} style={btn()}>✕</button>
                </div>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ color:"#f59e0b", fontWeight:800, fontSize:15 }}>{e.score}</span>
                  <button onClick={()=>{setEditingKey(e.key);setEditScore(String(e.score));}} style={btn("b")}>Edit</button>
                  <button onClick={()=>handleDelete(e.key,e.name)} style={btn("r")}>Delete</button>
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── REPORTS PANEL ─────────────────────────────────────────────────────────────
function ReportsPanel() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { msg, flash } = useFlash();

  useEffect(() => {
    get(ref(db, "reports")).then(snap => {
      if (!snap.exists()) { setLoading(false); return; }
      const list = Object.entries(snap.val()).map(([key,d]:any) => ({ key, ...d }));
      setReports(list.sort((a,b)=>b.ts-a.ts));
      setLoading(false);
    });
  }, []);

  async function dismiss(key: string) {
    await remove(ref(db, `reports/${key}`));
    setReports(r => r.filter(x=>x.key!==key));
    flash("Report dismissed");
  }

  return (
    <div>
      <h1 style={c.h1}>🚩 Score Reports ({reports.length})</h1>
      <Flash msg={msg} />
      <div style={{ background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#a5b4fc" }}>
        Players can report suspicious scores — they'll show up here for you to review.
      </div>
      <div style={c.card}>
        {loading ? <div style={{ color:"#6b7280" }}>Loading…</div> :
          reports.length===0 ? <div style={{ color:"#4b5563" }}>No reports — all clear!</div> :
          reports.map(r=>(
            <div key={r.key} style={c.row}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700 }}>{r.reportedName} <span style={{ color:"#ef4444" }}>({r.score} pts)</span></div>
                <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{r.reason||"No reason given"}</div>
                <div style={{ fontSize:11, color:"#4b5563" }}>Reported by {r.reporterName} · {r.category} · {r.date}</div>
              </div>
              <button onClick={()=>dismiss(r.key)} style={btn()}>Dismiss</button>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── BANS PANEL ────────────────────────────────────────────────────────────────
function BansPanel({ initUid }: { initUid?:string }) {
  const [bans, setBans] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [banUid, setBanUid] = useState(initUid||"");
  const [banReason, setBanReason] = useState("");
  const [banType, setBanType] = useState<"permanent"|"temp">("temp");
  const [banUnit, setBanUnit] = useState<"minutes"|"hours"|"days">("days");
  const [banAmount, setBanAmount] = useState("1");
  const [banSubject, setBanSubject] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent"|"warned"|"banned">("recent");
  const { msg, flash } = useFlash();

  useEffect(() => {
    Promise.all([get(ref(db,"bans")),get(ref(db,"users"))]).then(([bSnap,uSnap])=>{
      if(bSnap.exists()) setBans(Object.entries(bSnap.val()).map(([uid,d]:any)=>({uid,...d})));
      if(uSnap.exists()) setUsers(Object.entries(uSnap.val()).map(([uid,d]:any)=>({uid,...d})));
    });
  }, []);

  useEffect(() => { if(initUid) setBanUid(initUid); }, [initUid]);

  const resolveUser = (input: string) => users.find(u=>u.uid===input.trim()) || users.find(u=>u.username?.toLowerCase()===input.trim().toLowerCase());

  const UNIT_MS: Record<string,number> = { minutes:60000, hours:3600000, days:86400000 };

  async function handleBan() {
    const target = resolveUser(banUid);
    if (!target) { flash("User not found","error"); return; }
    const now = Date.now();
    const ms = parseInt(banAmount) * UNIT_MS[banUnit];
    const expiresAt = banType==="temp" ? now + ms : null;
    const label = banType==="temp" ? `${banAmount} ${banUnit}` : "permanent";
    const finalBanReason = banReason.trim() || "No reason given";
    const banData: any = { username:target.username, photoURL:target.photoURL||null, reason:finalBanReason, bannedAt:now, type:banType, expiresAt, duration:label };
    await set(ref(db,`bans/${target.uid}`), banData);
    await update(ref(db,`users/${target.uid}`), { banned:true, banExpiresAt:expiresAt, lastBannedAt:now });
    setBans(b=>[...b.filter(x=>x.uid!==target.uid),{uid:target.uid,...banData}]);
    logAdminAction("BAN", target.username, label + ": " + finalBanReason);
    flash(`${target.username} banned for ${label}`);
    setBanUid(""); setBanReason(""); setBanAmount("1");
  }

  async function handleWarn(targetInput: string, reason: string, subject?: string) {
    const target = resolveUser(targetInput);
    if (!target) return;
    const finalReason = reason.trim() || "No reason given";
    const key = Date.now().toString();
    const entry: any = { reason: finalReason, warnedAt: Date.now(), time: new Date().toLocaleString(), adminUid: _adminUid, adminUsername: _adminUsername };
    if (subject) entry.subject = subject;
    await set(ref(db, `warns/${target.uid}/${key}`), entry);
    // Count warns for this subject
    let subjectCount = 1;
    if (subject) {
      const allWarns = await get(ref(db, `warns/${target.uid}`));
      if (allWarns.exists()) {
        subjectCount = Object.values(allWarns.val() as any).filter((w: any) => w.subject === subject).length;
      }
    }
    const allWarns2 = await get(ref(db, `warns/${target.uid}`));
    const totalWarns = allWarns2.exists() ? Object.keys(allWarns2.val()).length : 1;
    // Trigger popup for the user
    await set(ref(db, `users/${target.uid}/pendingWarn`), { reason: finalReason, subject: subject||null, subjectCount, totalWarns, warnedAt: Date.now() });
    await update(ref(db, `users/${target.uid}`), { lastWarnedAt: Date.now() });
    logAdminAction("WARN", target.username, (subject ? `[${subject}] ` : "") + finalReason);
    flash(`⚠️ ${target.username} warned`);
  }

  async function handleUnban(uid: string, username: string) {
    await remove(ref(db,`bans/${uid}`));
    await update(ref(db,`users/${uid}`),{banned:false,banExpiresAt:null});
    setBans(b=>b.filter(x=>x.uid!==uid));
    logAdminAction("UNBAN", username);
    flash(`${username} unbanned`);
  }

  const target = banUid ? resolveUser(banUid) : null;
  const filtered = bans.filter(b=>!search||b.username?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <h1 style={c.h1}>🔨 Bans ({bans.length} active)</h1>
      <Flash msg={msg} />
      <div style={c.card}>
        <div style={c.h2}>Issue Ban</div>
        <label style={c.label}>Username or UID</label>
        <input value={banUid} onChange={e=>setBanUid(e.target.value)} placeholder="username or full UID" style={c.input} />
        {target && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, padding:"8px 12px", background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.2)", borderRadius:8 }}>
            <Avatar src={target.photoURL} name={target.username} size={32} />
            <div><div style={{ fontWeight:700 }}>{target.username}</div><div style={{ fontSize:11, color:"#6b7280" }}>{target.uid?.slice(0,20)}…</div></div>
          </div>
        )}
        <label style={c.label}>Reason</label>
        <input value={banReason} onChange={e=>setBanReason(e.target.value)} placeholder="e.g. cheating, harassment" style={c.input} />
        <label style={c.label}>Subject (optional)</label>
        <input value={banSubject} onChange={e=>setBanSubject(e.target.value)} placeholder="e.g. cheating, harassment, spam" style={c.input} />
        <label style={c.label}>Ban type</label>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          {(["temp","permanent"] as const).map(t=>(
            <button key={t} onClick={()=>setBanType(t)} style={{ ...btn(banType===t?"r":""), opacity:banType===t?1:0.5 }}>
              {t==="temp"?"⏱ Temporary":"🔒 Permanent"}
            </button>
          ))}
        </div>
        {banType==="temp" && (
          <>
            <label style={c.label}>Duration</label>
            <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" as const }}>
              {(["minutes","hours","days"] as const).map(u=>(
                <button key={u} onClick={()=>setBanUnit(u)} style={{ ...btn(banUnit===u?"r":""), opacity:banUnit===u?1:0.6, fontSize:12 }}>{u}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, marginBottom:12 }}>
              {(banUnit==="minutes"?["5","10","30","60"]:banUnit==="hours"?["1","3","6","12","24"]:["1","3","7","14","30","90"]).map(d=>(
                <button key={d} onClick={()=>setBanAmount(d)} style={{ ...btn(banAmount===d?"r":""), opacity:banAmount===d?1:0.5, fontSize:12 }}>{d}</button>
              ))}
              <input value={banAmount} onChange={e=>setBanAmount(e.target.value.replace(/\D/g,""))} placeholder="custom" style={{ ...c.input, marginBottom:0, width:80 }} />
            </div>
          </>
        )}
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={handleBan} style={{ flex:2, background:"linear-gradient(135deg,#ef4444,#b91c1c)", border:"none", borderRadius:10, color:"#fff", fontSize:"0.95rem", fontWeight:800, padding:"12px", cursor:"pointer" }}>
            {banType==="temp"?`🔨 Ban for ${banAmount} ${banUnit}`:"🔒 Permanently Ban"}
          </button>
          <button onClick={()=>{ handleWarn(banUid, banReason, banSubject||undefined); }} style={{ flex:1, ...btn("y"), padding:"12px", fontWeight:800 }}>
            ⚠️ Warn Only
          </button>
        </div>
      </div>

      {/* Global chat mute */}
      <div style={c.card}>
        <div style={c.h2}>🔇 Global Chat Mute</div>
        <p style={{ color:"#9ca3af", fontSize:13, marginBottom:12 }}>Prevents a user from sending chat messages to anyone site-wide.</p>
        <div style={{ display:"flex", gap:8 }}>
          <input placeholder="Username or UID" id="muteInput" style={{ ...c.input, marginBottom:0, flex:1 }} />
          <button onClick={async () => {
            const input = (document.getElementById("muteInput") as HTMLInputElement).value.trim();
            if (!input) return;
            const uSnap = await get(ref(db, "users"));
            if (!uSnap.exists()) return;
            const found = Object.entries(uSnap.val() as any).find(([uid, u]: any) =>
              uid === input || u.username?.toLowerCase() === input.toLowerCase()
            );
            if (!found) { alert("User not found"); return; }
            await update(ref(db, `users/${found[0]}`), { globalMuted: true });
            alert(`${(found[1] as any).username} is now globally muted from chat`);
          }} style={btn("r")}>Mute</button>
          <button onClick={async () => {
            const input = (document.getElementById("muteInput") as HTMLInputElement).value.trim();
            if (!input) return;
            const uSnap = await get(ref(db, "users"));
            if (!uSnap.exists()) return;
            const found = Object.entries(uSnap.val() as any).find(([uid, u]: any) =>
              uid === input || u.username?.toLowerCase() === input.toLowerCase()
            );
            if (!found) { alert("User not found"); return; }
            await update(ref(db, `users/${found[0]}`), { globalMuted: false });
            alert(`${(found[1] as any).username} unmuted`);
          }} style={btn("g")}>Unmute</button>
        </div>
      </div>

      <div style={c.card}>
        <div style={c.h2}>Active Bans</div>
        <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" as const }}>
          {(["recent","warned","banned"] as const).map(s=>(
            <button key={s} onClick={()=>setSortBy(s)} style={{ ...btn(sortBy===s?"y":""), fontSize:12, opacity:sortBy===s?1:0.6 }}>
              {s==="recent"?"🕐 Recent":s==="warned"?"⚠️ Most Warned":"🔨 Most Banned"}
            </button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={c.input} />
        {filtered.length===0 ? <div style={{ color:"#4b5563" }}>No bans</div> :
          filtered.map(b=>{
            const isExpired = b.expiresAt && b.expiresAt<Date.now();
            const daysLeft = b.expiresAt ? Math.max(0,Math.ceil((b.expiresAt-Date.now())/86400000)) : null;
            return (
              <div key={b.uid} style={c.row}>
                <Avatar src={b.photoURL} name={b.username||"?"} size={36} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontWeight:700 }}>{b.username}</span>
                    {b.type==="permanent" ? <span style={tag("239,68,68")}>permanent</span>
                      : isExpired ? <span style={tag("107,114,128")}>expired</span>
                      : <span style={tag("245,158,11")}>{daysLeft}d left</span>}
                  </div>
                  <div style={{ fontSize:11, color:"#6b7280" }}>{b.reason}</div>
                  <div style={{ fontSize:10, color:"#4b5563" }}>{new Date(b.bannedAt).toLocaleString()}</div>
                </div>
                <button onClick={()=>handleUnban(b.uid,b.username)} style={btn("g")}>Unban</button>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

// ── NAV ───────────────────────────────────────────────────────────────────────
const NAV = [
  { id:"dashboard",     icon:"📊", label:"Dashboard" },
  { id:"analytics",     icon:"📈", label:"Analytics" },
  { id:"announcements", icon:"📢", label:"Announcements" },
  { id:"questions",     icon:"❓", label:"Questions" },
  { id:"users",         icon:"👥", label:"Users" },
  { id:"leaderboard",   icon:"🏆", label:"Leaderboard" },
  { id:"reports",       icon:"🚩", label:"Reports" },
  { id:"chatreports",   icon:"💬", label:"Chat Reports" },
  { id:"duels",         icon:"⚔️", label:"Duels" },
  { id:"bans",          icon:"🔨", label:"Bans" },
  { id:"warns",         icon:"⚠️",  label:"Warns" },
  { id:"notifhistory",  icon:"📨", label:"Notif History" },
  { id:"activitylog",   icon:"📋", label:"Activity Log" },
  { id:"system",        icon:"⚙️", label:"System" },
  { id:"links",         icon:"🔗", label:"Quick Links" },
];

// ── CHAT REPORTS PANEL ───────────────────────────────────────────────────────
function ChatReportsPanel() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { msg, flash } = useFlash();

  useEffect(() => {
    const r = ref(db, "chatReports");
    const unsub = onValue(r, snap => {
      if (!snap.exists()) { setReports([]); setLoading(false); return; }
      const list = Object.entries(snap.val() as any).map(([key, d]: any) => ({ key, ...d }));
      setReports(list.sort((a: any, b: any) => b.reportedAt - a.reportedAt));
      setLoading(false);
    });
    return () => off(r);
  }, []);

  async function dismiss(key: string) {
    await remove(ref(db, `chatReports/${key}`));
    setReports(r => r.filter((x: any) => x.key !== key));
    flash("Dismissed");
  }

  async function deleteMessage(report: any) {
    // Delete the actual message from the chat
    await remove(ref(db, `chats/${report.chatKey}/messages/${report.msgKey}`));
    await remove(ref(db, `chatReports/${report.key}`));
    setReports(r => r.filter((x: any) => x.key !== report.key));
    flash("Message deleted from chat");
  }

  return (
    <div>
      <h1 style={c.h1}>💬 Chat Reports ({reports.length})</h1>
      <Flash msg={msg} />
      <div style={c.card}>
        {loading ? <div style={{ color:"#6b7280" }}>Loading…</div> :
          reports.length === 0 ? <div style={{ color:"#4b5563" }}>No chat reports — all clear!</div> :
          reports.map((r: any) => (
            <div key={r.key} style={{ ...c.row, alignItems:"flex-start" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontWeight:700, color:"#ef4444" }}>{r.senderName}</span>
                  <span style={{ fontSize:11, color:"#4b5563" }}>reported by {r.reporterName}</span>
                </div>
                <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"8px 12px", fontSize:13, color:"#e5e7eb", marginBottom:4 }}>
                  "{r.text}"
                </div>
                <div style={{ fontSize:11, color:"#4b5563" }}>{r.reportedAtStr}</div>
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0, marginLeft:10 }}>
                <button onClick={() => deleteMessage(r)} style={btn("r")}>Delete msg</button>
                <button onClick={() => dismiss(r.key)} style={btn()}>Dismiss</button>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── ANALYTICS PANEL ──────────────────────────────────────────────────────────
function AnalyticsPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      get(ref(db, "users")),
      get(ref(db, "leaderboard")),
      get(ref(db, "duels")),
    ]).then(([uSnap, lbSnap, dSnap]) => {
      const users: any[] = uSnap.exists() ? Object.values(uSnap.val()) : [];
      const lb: any[] = lbSnap.exists() ? Object.values(lbSnap.val()) : [];
      const duels: any[] = dSnap.exists() ? Object.values(dSnap.val()) : [];

      // Daily active users (by lastPlayed)
      const dauMap: Record<string, number> = {};
      users.forEach(u => { if (u.lastPlayed) dauMap[u.lastPlayed] = (dauMap[u.lastPlayed] || 0) + 1; });
      const dauSorted = Object.entries(dauMap).sort(([a],[b]) => new Date(a).getTime() - new Date(b).getTime()).slice(-14);

      // Category popularity from leaderboard
      const catMap: Record<string, number> = {};
      lb.forEach(e => { if (e.category) catMap[e.category] = (catMap[e.category] || 0) + 1; });
      const topCat = Object.entries(catMap).sort(([,a],[,b]) => b - a);

      // Avg games per user
      const totalGames = users.reduce((s, u) => s + (u.gamesPlayed || 0), 0);
      const avgGames = users.length ? (totalGames / users.length).toFixed(1) : 0;

      // Duels this week
      const weekAgo = Date.now() - 7 * 86400000;
      const duelsThisWeek = duels.filter(d => d.createdAt > weekAgo).length;

      // Top duel players
      const duelPlayers = users.filter(u => (u.duelsPlayed || 0) > 0)
        .sort((a, b) => (b.duelWins || 0) - (a.duelWins || 0)).slice(0, 5);

      // New users per day
      const newMap: Record<string, number> = {};
      lb.forEach(e => { if (e.date) newMap[e.date] = (newMap[e.date] || 0) + 1; });

      setData({ dauSorted, topCat, avgGames, duelsThisWeek, duelPlayers, totalUsers: users.length, totalGames });
      setLoading(false);
    });
  }, []);

  const CAT_EMOJI: Record<string,string> = { geography:"🗺️", science:"🔬", history:"📜", math:"🔢", sports:"⚽", entertainment:"🎬" };

  if (loading) return <div style={{ color:"#6b7280" }}>Loading…</div>;

  return (
    <div>
      <h1 style={c.h1}>📈 Analytics</h1>

      {/* DAU Chart */}
      <div style={c.card}>
        <div style={c.h2}>Daily Active Users (last 14 days)</div>
        {data.dauSorted.length === 0 ? (
          <div style={{ color:"#4b5563" }}>No data yet</div>
        ) : (
          <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:120, marginBottom:8 }}>
            {data.dauSorted.map(([date, count]: [string, number]) => {
              const max = Math.max(...data.dauSorted.map(([,c]: any) => c));
              const h = Math.max(8, Math.round((count / max) * 100));
              return (
                <div key={date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  <div style={{ fontSize:10, color:"#f59e0b", fontWeight:700 }}>{count}</div>
                  <div style={{ width:"100%", background:"linear-gradient(180deg,#f59e0b,#ef4444)", borderRadius:"4px 4px 0 0", height:`${h}%` }} />
                  <div style={{ fontSize:9, color:"#4b5563", whiteSpace:"nowrap" as const, transform:"rotate(-45deg)", transformOrigin:"top center", marginTop:4 }}>
                    {date.split("/").slice(0,2).join("/")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12, marginBottom:20 }}>
        {[
          ["Avg Games/User", data.avgGames, "#f59e0b"],
          ["Duels This Week", data.duelsThisWeek, "#6366f1"],
          ["Total Games", data.totalGames.toLocaleString(), "#10b981"],
          ["Total Users", data.totalUsers, "#e5e7eb"],
        ].map(([l,v,col]) => (
          <div key={l as string} style={{ ...c.card, marginBottom:0, textAlign:"center" as const }}>
            <div style={{ fontSize:24, fontWeight:900, color:col as string }}>{v as any}</div>
            <div style={{ fontSize:11, color:"#6b7280", marginTop:4 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Category popularity */}
      <div style={c.card}>
        <div style={c.h2}>Most Played Categories</div>
        {data.topCat.map(([cat, count]: [string, number], i: number) => (
          <div key={cat} style={{ ...c.row, borderBottom: i < data.topCat.length-1 ? "1px solid #1e1e30" : "none" }}>
            <span style={{ fontSize:18 }}>{CAT_EMOJI[cat] || "❓"}</span>
            <span style={{ flex:1, fontWeight:600 }}>{cat}</span>
            <span style={{ color:"#f59e0b", fontWeight:800 }}>{count} entries</span>
          </div>
        ))}
      </div>

      {/* Top duel players */}
      <div style={c.card}>
        <div style={c.h2}>Top Duel Players</div>
        {data.duelPlayers.length === 0 ? <div style={{ color:"#4b5563" }}>No duels played yet</div> :
          data.duelPlayers.map((u: any, i: number) => (
            <div key={u.uid||i} style={{ ...c.row }}>
              <span style={{ color:"#4b5563", fontWeight:800, width:20 }}>{i+1}</span>
              <Avatar src={u.photoURL} name={u.username||"?"} size={32} />
              <span style={{ flex:1, fontWeight:700 }}>{u.username}</span>
              <span style={{ color:"#10b981", fontWeight:700 }}>{u.duelWins||0}W</span>
              <span style={{ color:"#ef4444", fontWeight:700, marginLeft:8 }}>{u.duelLosses||0}L</span>
              <span style={{ color:"#6b7280", fontSize:12, marginLeft:8 }}>{u.duelsPlayed||0} played</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── MASS PUSH PANEL ──────────────────────────────────────────────────────────
function MassPushPanel() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"all"|"individual"|"badge">("all");
  const [targetInput, setTargetInput] = useState(""); // username or uid
  const [badgeTarget, setBadgeTarget] = useState("star");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    get(ref(db, "users")).then(snap => {
      if (!snap.exists()) return;
      const list = Object.entries(snap.val() as any).map(([uid, u]: any) => ({ uid, ...u }));
      setAllUsers(list);
    });
  }, []);

  async function sendPush(tokens: string[]) {
    let sent = 0;
    await Promise.all(tokens.map(async token => {
      if (!token) return;
      try {
        const res = await fetch("/api/send-notification", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ token, title, body, url:"/", sender: "Admin" }),
        });
        if (res.ok) sent++;
      } catch {}
    }));
    return sent;
  }

  async function handleSend() {
    if (!title || !body) return;
    setSending(true); setResult("");
    try {
      let tokens: string[] = [];

      if (mode === "all") {
        tokens = allUsers.filter(u => u.fcmToken && u.status?.notif !== false).map(u => u.fcmToken);
      } else if (mode === "individual") {
        const targets = selectedUsers.size > 0
          ? allUsers.filter(u => selectedUsers.has(u.uid))
          : allUsers.filter(u => {
              const q = targetInput.trim().toLowerCase();
              return q && (u.username?.toLowerCase() === q || u.uid === targetInput.trim());
            });
        tokens = targets.filter(u => u.fcmToken).map(u => u.fcmToken);
        if (tokens.length === 0) { setResult("User not found or no FCM token"); setSending(false); return; }
      } else if (mode === "badge") {
        tokens = allUsers.filter(u => u.badge === badgeTarget && u.fcmToken && u.status?.notif !== false).map(u => u.fcmToken);
        if (tokens.length === 0) { setResult(`No ${badgeTarget} badge users with notifications enabled`); setSending(false); return; }
      }

      const sent = await sendPush(tokens);
      setResult(`✅ Sent to ${sent}/${tokens.length} recipients`);
      if (mode !== "individual" || selectedUsers.size === 0) { setTitle(""); setBody(""); }
    } catch (e: any) { setResult("❌ Error: " + e.message); }
    setSending(false);
  }

  const BADGE_OPTIONS = ["star","bronze","silver","gold","tester","crown","check"];
  const filteredUsers = allUsers.filter(u => {
    const q = userSearch.toLowerCase();
    return !q || u.username?.toLowerCase().includes(q) || u.uid?.includes(q);
  }).slice(0, 20);

  const ModePill = ({ id, label }: { id: typeof mode; label: string }) => (
    <button onClick={() => { setMode(id); setSelectedUsers(new Set()); }} style={{
      flex:1, background: mode===id?"rgba(245,158,11,0.2)":"rgba(255,255,255,0.04)",
      border:`1px solid ${mode===id?"#f59e0b":"#2d2d44"}`,
      borderRadius:8, color:mode===id?"#f59e0b":"#6b7280",
      fontSize:12, fontWeight:700, padding:"8px 4px", cursor:"pointer",
    }}>{label}</button>
  );

  return (
    <>
      {/* Mode selector */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        <ModePill id="all" label="📣 All Users" />
        <ModePill id="individual" label="👤 Individual" />
        <ModePill id="badge" label="🏅 By Badge" />
      </div>

      {/* Individual mode — search + multi-select */}
      {mode === "individual" && (
        <div style={{ marginBottom:14 }}>
          <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
            placeholder="Search username…" style={c.input} />
          <div style={{ maxHeight:160, overflowY:"auto" as const, border:"1px solid #2d2d44", borderRadius:8, marginTop:6 }}>
            {filteredUsers.length === 0
              ? <div style={{ padding:"10px 14px", color:"#4b5563", fontSize:13 }}>No users found</div>
              : filteredUsers.map(u => (
                <div key={u.uid} onClick={() => setSelectedUsers(prev => {
                  const next = new Set(prev);
                  next.has(u.uid) ? next.delete(u.uid) : next.add(u.uid);
                  return next;
                })} style={{
                  display:"flex", alignItems:"center", gap:10, padding:"8px 14px",
                  borderBottom:"1px solid #1e1e30", cursor:"pointer",
                  background: selectedUsers.has(u.uid) ? "rgba(245,158,11,0.1)" : "transparent",
                }}>
                  <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${selectedUsers.has(u.uid)?"#f59e0b":"#4b5563"}`, background: selectedUsers.has(u.uid)?"#f59e0b":"transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {selectedUsers.has(u.uid) && <span style={{ color:"#000", fontSize:10, fontWeight:900 }}>✓</span>}
                  </div>
                  <Avatar src={u.photoURL} name={u.username||"?"} size={24} />
                  <span style={{ fontWeight:700, fontSize:13, color: selectedUsers.has(u.uid)?"#f59e0b":"#e5e7eb" }}>{u.username}</span>
                  <BadgeIcon badge={u.badge} size={12} />
                  {!u.fcmToken && <span style={{ fontSize:11, color:"#ef4444", marginLeft:"auto" }}>no token</span>}
                </div>
              ))
            }
          </div>
          {selectedUsers.size > 0 && (
            <div style={{ fontSize:12, color:"#f59e0b", marginTop:6 }}>
              {selectedUsers.size} user{selectedUsers.size > 1 ? "s" : ""} selected
            </div>
          )}
        </div>
      )}

      {/* Badge mode */}
      {mode === "badge" && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, color:"#6b7280", marginBottom:8 }}>Send to all users with this badge:</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
            {BADGE_OPTIONS.map(b => (
              <button key={b} onClick={() => setBadgeTarget(b)} style={{
                background: badgeTarget===b?"rgba(245,158,11,0.2)":"rgba(255,255,255,0.04)",
                border:`1px solid ${badgeTarget===b?"#f59e0b":"#2d2d44"}`,
                borderRadius:8, color:badgeTarget===b?"#f59e0b":"#6b7280",
                fontSize:12, fontWeight:700, padding:"6px 12px", cursor:"pointer",
                display:"flex", alignItems:"center", gap:4,
              }}>
                <BadgeIcon badge={b} size={12} /> {b}
              </button>
            ))}
          </div>
          <div style={{ fontSize:12, color:"#4b5563", marginTop:8 }}>
            {allUsers.filter(u => u.badge === badgeTarget && u.fcmToken).length} eligible recipients
          </div>
        </div>
      )}

      {/* Title + Body */}
      <label style={c.label}>Notification Title</label>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. New update!" style={c.input} />
      <label style={c.label}>Message</label>
      <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="What do you want to say?" style={c.textarea} />

      <button onClick={handleSend} disabled={!title||!body||sending} style={{ ...btn("y"), width:"100%", opacity:(!title||!body||sending)?0.5:1 }}>
        {sending ? "Sending…" : mode==="all" ? "📣 Send to All Users" : mode==="badge" ? `🏅 Send to ${badgeTarget} badge users` : `📩 Send to ${selectedUsers.size || 1} user${selectedUsers.size > 1?"s":""}`}
      </button>
      {result && <div style={{ marginTop:8, fontSize:13, color: result.startsWith("✅")?"#10b981":"#ef4444" }}>{result}</div>}
    </>
  );
}


// ── NOTIFICATION HISTORY PANEL ────────────────────────────────────────────────
function NotifHistoryPanel() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    get(ref(db, "notifHistory")).then(snap => {
      if (!snap.exists()) { setLogs([]); setLoading(false); return; }
      const list = Object.values(snap.val() as any).sort((a:any,b:any) => b.ts-a.ts) as any[];
      setLogs(list.slice(0,100));
      setLoading(false);
    });
  }, []);
  return (
    <div>
      <h1 style={c.h1}>📨 Notification History</h1>
      <div style={c.card}>
        {loading ? <div style={{color:"#6b7280"}}>Loading…</div> :
         logs.length===0 ? (
           <div style={{textAlign:"center" as const,padding:"30px 0"}}>
             <div style={{fontSize:36,marginBottom:8}}>📭</div>
             <div style={{color:"#4b5563",fontSize:14,fontWeight:700}}>No notifications sent yet</div>
             <div style={{color:"#374151",fontSize:12,marginTop:6}}>Notifications sent via Admin → Announcements will appear here.</div>
           </div>
         ) :
         logs.map((l,i) => (
          <div key={i} style={{...c.row, alignItems:"flex-start"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                <span style={{fontWeight:700,fontSize:14,color:l.success?"#10b981":"#ef4444"}}>{l.success?"✅":"❌"} {l.title}</span>
                <span style={{fontSize:11,color:"#4b5563"}}>from {l.sender||"system"}</span>
              </div>
              <div style={{fontSize:12,color:"#9ca3af"}}>{l.body}</div>
              {l.error && <div style={{fontSize:11,color:"#ef4444",marginTop:2}}>{l.error}</div>}
            </div>
            <div style={{fontSize:11,color:"#4b5563",flexShrink:0,marginLeft:10}}>{l.sentAt}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ACTIVITY LOG PANEL ────────────────────────────────────────────────────────
function ActivityLogPanel() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const ACTION_COLORS: Record<string,string> = {
    BAN:"#ef4444", UNBAN:"#10b981", WIPE_STATS:"#f59e0b",
    SET_BADGE:"#a855f7", CHANGE_USERNAME:"#6366f1", DELETE_LB:"#ef4444",
    GRANT_ADMIN:"#f59e0b", REVOKE_ADMIN:"#6b7280",
  };
  useEffect(() => {
    get(ref(db, "adminLog")).then(snap => {
      if (!snap.exists()) { setLogs([]); setLoading(false); return; }
      const list = Object.values(snap.val() as any).sort((a:any,b:any) => b.ts-a.ts) as any[];
      setLogs(list.slice(0,200));
      setLoading(false);
    });
  }, []);
  return (
    <div>
      <h1 style={c.h1}>📋 Admin Activity Log</h1>
      <div style={c.card}>
        {loading ? <div style={{color:"#6b7280"}}>Loading…</div> :
         logs.length===0 ? (
           <div style={{textAlign:"center" as const,padding:"30px 0"}}>
             <div style={{fontSize:36,marginBottom:8}}>📋</div>
             <div style={{color:"#4b5563",fontSize:14,fontWeight:700}}>No admin actions logged yet</div>
             <div style={{color:"#374151",fontSize:12,marginTop:6}}>Actions like banning, changing usernames, wiping stats, and setting badges will be logged here automatically.</div>
             <div style={{color:"#374151",fontSize:12,marginTop:4}}>Try banning someone or changing a username — it'll show up here.</div>
           </div>
         ) :
         logs.map((l,i) => (
          <div key={i} style={{...c.row}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" as const}}>
                <span style={{fontWeight:700,fontSize:13,color:ACTION_COLORS[l.action]||"#e5e7eb",background:"rgba(255,255,255,0.06)",borderRadius:4,padding:"1px 6px"}}>{l.action}</span>
                <span style={{fontSize:12,color:"#9ca3af"}}>by</span>
                <span style={{fontWeight:700,fontSize:13,color:"#f59e0b"}}>{l.adminUsername}</span>
                <span style={{fontSize:10,color:"#4b5563",fontFamily:"monospace"}}>({l.adminUid?.slice(0,10)}…)</span>
                {l.target && <>
                  <span style={{fontSize:12,color:"#6b7280"}}>→</span>
                  <span style={{fontWeight:600,fontSize:13,color:"#d1d5db"}}>{l.target}</span>
                </>}
                {l.details && <span style={{fontSize:12,color:"#6b7280",background:"rgba(255,255,255,0.04)",borderRadius:4,padding:"1px 6px"}}>({l.details})</span>}
              </div>
            </div>
            <div style={{fontSize:11,color:"#4b5563",flexShrink:0,marginLeft:10,whiteSpace:"nowrap" as const}}>{l.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── IMPERSONATE VIEW ─────────────────────────────────────────────────────────
function ImpersonateView({ userData, onClose }: { userData: any; onClose: () => void }) {
  const CAT_EMOJI: Record<string,string> = { geography:"🗺️", science:"🔬", history:"📜", math:"🔢", sports:"⚽", entertainment:"🎬" };

  return (
    <div style={{ marginTop:12 }}>
      {/* Admin banner */}
      <div style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.5)", borderRadius:10, padding:"8px 14px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ color:"#ef4444", fontWeight:700, fontSize:13 }}>👁️ ADMIN PREVIEW — {userData.username}</span>
        <button onClick={onClose} style={{ background:"transparent", border:"none", color:"#ef4444", fontSize:18, cursor:"pointer" }}>×</button>
      </div>

      {/* Profile card */}
      <div style={{ background:"#0f0f1a", borderRadius:14, padding:"16px", marginBottom:12, display:"flex", alignItems:"center", gap:14 }}>
        {userData.photoURL
          ? <img src={userData.photoURL} alt="" width={56} height={56} style={{ borderRadius:"50%", border:"3px solid #f59e0b" }} />
          : <div style={{ width:56, height:56, borderRadius:"50%", background:"rgba(245,158,11,0.2)", border:"3px solid #f59e0b", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:900, color:"#f59e0b" }}>{(userData.username||"?")[0].toUpperCase()}</div>
        }
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:900, fontSize:"1.1rem", display:"flex", alignItems:"center", gap:6 }}>
            {userData.username} <BadgeIcon badge={userData.badge} size={16} />
          </div>
          {userData.status?.preset && userData.status.preset !== "online" && (
            <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
              {userData.status.preset === "dnd" && "⛔ Do Not Disturb"}
              {userData.status.preset === "sleeping" && "😴 Sleeping"}
              {userData.status.preset === "focused" && "🎯 Focused"}
              {userData.status.preset === "custom" && `✏️ ${userData.status.custom}`}
            </div>
          )}
          <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
            {userData.isAdmin && <span style={{ color:"#f59e0b", marginRight:6 }}>⚡ Admin</span>}
            Joined: {userData.loginHistory ? Object.values(userData.loginHistory as any).sort((a:any,b:any)=>a.ts-b.ts)[0] ? (Object.values(userData.loginHistory as any).sort((a:any,b:any)=>a.ts-b.ts)[0] as any).loginAt : "Unknown" : "Unknown"}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
        {[
          ["Best Score", userData.bestScore||0, "#f59e0b"],
          ["Games", userData.gamesPlayed||0, "#10b981"],
          ["Best Streak", userData.bestStreak||0, "#ef4444"],
          ["Correct", userData.totalCorrect||0, "#6366f1"],
          ["Accuracy", userData.totalQuestions ? Math.round((userData.totalCorrect||0)/userData.totalQuestions*100)+"%" : "—", "#a855f7"],
          ["Duels", userData.duelsPlayed||0, "#60a5fa"],
        ].map(([l,v,col]) => (
          <div key={l as string} style={{ background:"#0f0f1a", borderRadius:10, padding:"10px", textAlign:"center" as const }}>
            <div style={{ fontSize:18, fontWeight:900, color:col as string }}>{v as any}</div>
            <div style={{ fontSize:10, color:"#6b7280", marginTop:2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Duel stats */}
      {(userData.duelsPlayed||0) > 0 && (
        <div style={{ background:"#0f0f1a", borderRadius:12, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:12, color:"#6b7280", marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>Duel Record</div>
          <div style={{ display:"flex", gap:16 }}>
            {[["Wins",userData.duelWins||0,"#10b981"],["Losses",userData.duelLosses||0,"#ef4444"],["Draws",userData.duelDraws||0,"#6b7280"]].map(([l,v,col])=>(
              <div key={l as string} style={{ textAlign:"center" as const }}>
                <div style={{ fontSize:20, fontWeight:900, color:col as string }}>{v as number}</div>
                <div style={{ fontSize:11, color:"#4b5563" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category bests */}
      {userData.categoryBests && Object.keys(userData.categoryBests).length > 0 && (
        <div style={{ background:"#0f0f1a", borderRadius:12, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:12, color:"#6b7280", marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>Category Bests</div>
          {Object.entries(userData.categoryBests as Record<string,any>).map(([cat, data]: [string, any]) => (
            <div key={cat} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid #1e1e30", fontSize:13 }}>
              <span>{CAT_EMOJI[cat]||"❓"} {cat}</span>
              <span style={{ color:"#f59e0b", fontWeight:700 }}>{data.score || data}</span>
            </div>
          ))}
        </div>
      )}

      {/* Friends */}
      {userData._friends && userData._friends.length > 0 && (
        <div style={{ background:"#0f0f1a", borderRadius:12, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:12, color:"#6b7280", marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>Friends ({userData._friends.length})</div>
          {userData._friends.map((f:any) => (
            <div key={f.uid} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:"1px solid #1e1e30" }}>
              <Avatar src={f.photoURL} name={f.username||"?"} size={28} />
              <span style={{ fontWeight:600, fontSize:13 }}>{f.username}</span>
              <BadgeIcon badge={f.badge} size={12} />
              {userData.mutedUids && Object.values(userData.mutedUids as any).includes(f.uid) && (
                <span style={{ fontSize:11, color:"#6b7280", marginLeft:"auto" }}>🔕 muted</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Notifications */}
      <div style={{ background:"#0f0f1a", borderRadius:12, padding:"12px 16px", marginBottom:12, fontSize:13 }}>
        <div style={{ fontSize:12, color:"#6b7280", marginBottom:6, textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>Notifications</div>
        <div style={{ color: userData.fcmToken ? "#10b981" : "#ef4444" }}>
          {userData.fcmToken ? "✅ Push enabled" : "❌ No FCM token — push disabled"}
        </div>
        <div style={{ color: userData.status?.notif === false ? "#ef4444" : "#10b981", marginTop:4 }}>
          {userData.status?.notif === false ? "⛔ Status blocks notifications" : "✅ Status allows notifications"}
        </div>
        {userData.globalMuted && <div style={{ color:"#ef4444", marginTop:4 }}>🔇 Globally muted from chat</div>}
      </div>

      {/* Username changes left */}
      <div style={{ background:"#0f0f1a", borderRadius:12, padding:"12px 16px", fontSize:13 }}>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <span style={{ color:"#6b7280" }}>Username changes left</span>
          <span style={{ fontWeight:700, color: (userData.usernameChangesLeft||0) > 0 ? "#f59e0b" : "#ef4444" }}>
            {userData.usernameChangesLeft ?? 3}
          </span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
          <span style={{ color:"#6b7280" }}>Admin access</span>
          <span style={{ fontWeight:700, color: userData.isAdmin ? "#f59e0b" : "#6b7280" }}>{userData.isAdmin ? "Yes ⚡" : "No"}</span>
        </div>
      </div>
    </div>
  );
}

// ── SYSTEM PANEL ──────────────────────────────────────────────────────────────
function SystemPanel() {
  const [stats, setStats] = useState<any>(null);
  const [suspScores, setSuspScores] = useState<any[]>([]);
  const [impersonateUid, setImpersonateUid] = useState("");
  const [impersonateUser, setImpersonateUser] = useState<any>(null);

  useEffect(() => {
    // Listen for cross-panel impersonate event from Users panel
    const handler = (e: any) => {
      setImpersonateUid(e.detail.uid);
      // Auto-trigger load after state update
      setTimeout(() => {
        const btn = document.getElementById("impersonate-load-btn");
        if (btn) btn.click();
      }, 100);
    };
    window.addEventListener("admin-impersonate", handler);
    // Also check sessionStorage on mount
    const stored = sessionStorage.getItem("impersonateUid");
    if (stored) { setImpersonateUid(stored); sessionStorage.removeItem("impersonateUid"); }
    return () => window.removeEventListener("admin-impersonate", handler);
  }, []);
  const [cronResult, setCronResult] = useState("");
  const [loading, setLoading] = useState(true);
  const { msg, flash } = useFlash();

  useEffect(() => {
    Promise.all([
      get(ref(db,"users")),
      get(ref(db,"leaderboard")),
      get(ref(db,"duels")),
      get(ref(db,"chats")),
      get(ref(db,"bans")),
      get(ref(db,"adminLog")),
      get(ref(db,"notifHistory")),
    ]).then(([u,lb,d,ch,b,al,nh]) => {
      const users = u.exists() ? Object.values(u.val() as any) : [];
      const lbEntries = lb.exists() ? Object.values(lb.val() as any) : [];
      // Suspicious scores: perfect score (score = roundSize) in very short time, or score > possible
      const susp: any[] = [];
      // Flag accounts with impossible accuracy (more correct than questions played)
      (users as any[]).forEach((usr:any) => {
        if (usr.totalQuestions > 0 && usr.totalCorrect > usr.totalQuestions) {
          susp.push({...usr, reason:`Correct (${usr.totalCorrect}) > total questions (${usr.totalQuestions})`});
        }
        // Flag accounts with games played but zero questions
        if ((usr.gamesPlayed||0) > 5 && (usr.totalQuestions||0) === 0) {
          susp.push({...usr, reason:`${usr.gamesPlayed} games played but 0 questions recorded`});
        }
      });
      setStats({
        users: users.length,
        lbEntries: lbEntries.length,
        duels: d.exists() ? Object.keys(d.val()).length : 0,
        chats: ch.exists() ? Object.keys(ch.val()).length : 0,
        bans: b.exists() ? Object.keys(b.val()).length : 0,
        adminActions: al.exists() ? Object.keys(al.val()).length : 0,
        notifsSent: nh.exists() ? Object.keys(nh.val()).length : 0,
        withNotifs: (users as any[]).filter((u:any) => u.fcmToken).length,
        catCounts: {
          geography: 172, science: 199, history: 156,
          math: 162, sports: 137, entertainment: 136,
        },
      });
      setSuspScores(susp.slice(0,20));
      setLoading(false);
    });
  }, []);

  async function runBadgeCron() {
    setCronResult("Running…");
    try {
      const res = await fetch("/api/badge-cron", {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || "trivquic-cron-2026-secure"}` },
      });
      const data = await res.json();
      setCronResult(data.ok ? `✅ Done — ${data.processed}/${data.total} badges updated` : `❌ ${JSON.stringify(data)}`);
    } catch (e:any) { setCronResult("❌ " + e.message); }
  }

  async function loadImpersonate() {
    const q = impersonateUid.trim();
    if (!q) return;
    // Try as UID first
    let snap = await get(ref(db, `users/${q}`));
    if (!snap.exists()) {
      // Try username lookup
      const uidSnap = await get(ref(db, `usernames/${q.toLowerCase()}`));
      if (uidSnap.exists()) snap = await get(ref(db, `users/${uidSnap.val()}`));
    }
    if (!snap.exists()) { setImpersonateUser({error:"User not found"}); return; }
    const uid = q.length > 20 ? q : (await get(ref(db, `usernames/${q.toLowerCase()}`))).val() || q;
    // Load friends
    const userData = snap.val();
    const friendIds: string[] = userData.friendIds ? Object.values(userData.friendIds) : [];
    const friends = await Promise.all(
      friendIds.slice(0,10).map((id:string) => get(ref(db,`users/${id}`)).then(s => s.exists()?{uid:id,...s.val()}:null))
    );
    // Load leaderboard entries
    const lbSnap = await get(ref(db,"leaderboard"));
    const lbEntries = lbSnap.exists()
      ? Object.values(lbSnap.val() as any).filter((e:any) => e.uid === snap.ref.key || Object.keys(lbSnap.val()).some(k=>k.startsWith((snap.ref.key||"")+"_")))
      : [];
    setImpersonateUser({ uid: snap.ref.key, ...userData, _friends: friends.filter(Boolean), _lbEntries: lbEntries });
  }

  const CAT_EMOJI: Record<string,string> = {geography:"🗺️",science:"🔬",history:"📜",math:"🔢",sports:"⚽",entertainment:"🎬"};

  if (loading) return <div style={{color:"#6b7280"}}>Loading…</div>;

  return (
    <div>
      <h1 style={c.h1}>⚙️ System</h1>
      <Flash msg={msg} />

      {/* Database Stats */}
      <div style={c.card}>
        <div style={c.h2}>🗄️ Database Stats</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:16}}>
          {[
            ["Users",stats.users,"#e5e7eb"],
            ["LB Entries",stats.lbEntries,"#f59e0b"],
            ["Duels",stats.duels,"#6366f1"],
            ["Chat Threads",stats.chats,"#10b981"],
            ["Active Bans",stats.bans,"#ef4444"],
            ["Admin Actions",stats.adminActions,"#a855f7"],
            ["Notifs Sent",stats.notifsSent,"#60a5fa"],
            ["Push Enabled",stats.withNotifs,"#10b981"],
          ].map(([l,v,col]) => (
            <div key={l as string} style={{background:"#0f0f1a",borderRadius:10,padding:"12px",textAlign:"center" as const}}>
              <div style={{fontSize:22,fontWeight:900,color:col as string}}>{v}</div>
              <div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={c.h2}>❓ Question Counts by Category</div>
        {Object.entries(stats.catCounts).map(([cat,count]) => (
          <div key={cat} style={{...c.row}}>
            <span style={{fontSize:16}}>{CAT_EMOJI[cat]}</span>
            <span style={{flex:1,fontWeight:600,textTransform:"capitalize" as const}}>{cat}</span>
            <span style={{color:"#f59e0b",fontWeight:700}}>{count as number} questions</span>
          </div>
        ))}
      </div>

      {/* Manual Badge Cron */}
      <div style={c.card}>
        <div style={c.h2}>🏅 Run Badge Cron Now</div>
        <p style={{color:"#9ca3af",fontSize:13,marginBottom:12}}>Normally runs at 3am UTC. Trigger it manually to apply badge changes immediately.</p>
        <button onClick={runBadgeCron} style={{...btn("y"),width:"100%"}} disabled={cronResult==="Running…"}>
          {cronResult || "▶ Run Badge Cron"}
        </button>
        {cronResult && <div style={{marginTop:8,fontSize:13,color:cronResult.startsWith("✅")?"#10b981":"#ef4444"}}>{cronResult}</div>}
      </div>

      {/* Suspicious Scores */}
      <div style={c.card}>
        <div style={c.h2}>🚨 Suspicious Scores ({suspScores.length})</div>
        {suspScores.length===0 ? (
          <div style={{textAlign:"center" as const,padding:"20px 0"}}>
            <div style={{fontSize:32,marginBottom:6}}>✅</div>
            <div style={{color:"#10b981",fontSize:14,fontWeight:700}}>No suspicious scores detected</div>
            <div style={{color:"#374151",fontSize:12,marginTop:4}}>Flags users with impossible accuracy or data corruption.</div>
          </div>
        ) :
          suspScores.map((s,i) => (
            <div key={i} style={{...c.row, alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" as const}}>
                  {s.username||s.name||"Unknown"}
                  <span style={{fontSize:10,color:"#4b5563",fontFamily:"monospace"}}>{(s.uid||"").slice(0,12)}…</span>
                </div>
                <div style={{fontSize:12,color:"#ef4444",marginTop:2}}>{s.reason}</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0,marginLeft:10}}>
                <button onClick={async()=>{
                  if(!confirm(`Wipe stats for ${s.username}?`)) return;
                  await update(ref(db,`users/${s.uid}`),{bestScore:0,bestStreak:0,gamesPlayed:0,totalScore:0,totalCorrect:0,totalQuestions:0,categoryBests:{}});
                  logAdminAction("WIPE_STATS", s.username, "from suspicious scores panel");
                  setSuspScores((p:any[])=>p.filter((_:any,j:number)=>j!==i));
                  flash(`Stats wiped for ${s.username}`);
                }} style={{...btn("r"),fontSize:12,padding:"4px 10px"}}>Wipe Stats</button>
                <button onClick={()=>{
                  setSuspScores((p:any[])=>p.filter((_:any,j:number)=>j!==i));
                }} style={{...btn(),fontSize:12,padding:"4px 10px"}}>Dismiss</button>
              </div>
            </div>
          ))
        }
      </div>

      {/* View As User */}
      <div style={c.card}>
        <div style={c.h2}>👁️ View As User</div>
        <p style={{color:"#9ca3af",fontSize:13,marginBottom:12}}>Enter a UID or username to open a full read-only preview of what that user sees.</p>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={impersonateUid} onChange={e=>setImpersonateUid(e.target.value)}
            placeholder="UID or username" style={{...c.input,marginBottom:0,flex:1}}
            onKeyDown={e=>e.key==="Enter"&&loadImpersonate()} />
          <button id="impersonate-load-btn" onClick={loadImpersonate} style={btn("g")}>Load</button>
        </div>
        {impersonateUser && (
          impersonateUser.error
            ? <div style={{color:"#ef4444"}}>{impersonateUser.error}</div>
            : <ImpersonateView userData={impersonateUser} onClose={()=>setImpersonateUser(null)} />
        )}
      </div>
    </div>
  );
}

// ── QUICK LINKS PANEL ─────────────────────────────────────────────────────────
function LinksPanel() {
  const links = [
    { label:"Firebase Console", desc:"Realtime Database, Auth, Storage", icon:"🔥", color:"#f97316", url:"https://console.firebase.google.com/project/onetap-trivia" },
    { label:"Firebase Database", desc:"Browse and edit data directly", icon:"🗄️", color:"#f59e0b", url:"https://console.firebase.google.com/project/onetap-trivia/database/onetap-trivia-default-rtdb/data" },
    { label:"Firebase Auth", desc:"View and manage users", icon:"🔐", color:"#6366f1", url:"https://console.firebase.google.com/project/onetap-trivia/authentication/users" },
    { label:"Firebase Cloud Messaging", desc:"Push notification settings, VAPID keys", icon:"🔔", color:"#10b981", url:"https://console.firebase.google.com/project/onetap-trivia/settings/cloudmessaging" },
    { label:"Vercel Dashboard", desc:"Deployments, env vars, domains", icon:"▲", color:"#fff", url:"https://vercel.com/chris0622has-projects/quictriv" },
    { label:"Vercel Environment Variables", desc:"FIREBASE_API_KEY, VAPID_KEY, etc.", icon:"⚙️", color:"#9ca3af", url:"https://vercel.com/chris0622has-projects/quictriv/settings/environment-variables" },
    { label:"GitHub Repository", desc:"Source code, commits, branches", icon:"🐙", color:"#a5b4fc", url:"https://github.com/chris0622ha/onetap-trivia" },
    { label:"TrivQuic Live Site", desc:"trivquic.vercel.app", icon:"⚡", color:"#f59e0b", url:"https://trivquic.vercel.app" },
    { label:"Google Cloud Console", desc:"Service accounts, IAM, APIs", icon:"☁️", color:"#60a5fa", url:"https://console.cloud.google.com/iam-admin/serviceaccounts?project=onetap-trivia" },
  ];

  return (
    <div>
      <h1 style={c.h1}>🔗 Quick Links</h1>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
        {links.map(link => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer" style={{
            background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:14,
            padding:"16px 20px", textDecoration:"none", display:"flex", alignItems:"center", gap:14,
            transition:"border-color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = link.color + "88")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "#2d2d44")}>
            <span style={{ fontSize:28, flexShrink:0 }}>{link.icon}</span>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:link.color }}>{link.label}</div>
              <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{link.desc}</div>
            </div>
            <span style={{ marginLeft:"auto", color:"#4b5563", fontSize:16 }}>↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── EXPORT / TOOLS ────────────────────────────────────────────────────────────
// (Export CSV is wired into the Leaderboard panel via button)

// ── DUELS ADMIN PANEL ────────────────────────────────────────────────────────
function DuelsAdminPanel() {
  const [duels, setDuels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [spectating, setSpectating] = useState<any>(null);
  const [liveData, setLiveData] = useState<any>(null);
  const [filter, setFilter] = useState<"all"|"live"|"done">("all");
  const { msg, flash } = useFlash();

  useEffect(() => {
    get(ref(db, "duels")).then(snap => {
      if (!snap.exists()) { setLoading(false); return; }
      const list = Object.values(snap.val() as any).sort((a:any,b:any) => b.createdAt - a.createdAt);
      setDuels(list as any[]);
      setLoading(false);
    });
  }, []);

  // Live spectate listener
  useEffect(() => {
    if (!spectating) { setLiveData(null); return; }
    const duelRef = ref(db, `duels/${spectating.id}`);
    const unsub = onValue(duelRef, snap => { if (snap.exists()) setLiveData(snap.val()); });
    return () => off(duelRef);
  }, [spectating?.id]);

  async function deleteDuel(id: string) {
    if (!confirm("Delete this duel?")) return;
    await remove(ref(db, `duels/${id}`));
    setDuels(d => d.filter((x:any) => x.id !== id));
    if (spectating?.id === id) setSpectating(null);
    flash("Duel deleted");
  }

  async function endDuel(id: string) {
    if (!confirm("Force-end this duel?")) return;
    await update(ref(db, `duels/${id}`), { status:"done" });
    setDuels(d => d.map((x:any) => x.id===id ? {...x, status:"done"} : x));
    flash("Duel ended");
  }

  const filtered = duels.filter(d =>
    filter==="all" ? true : filter==="live" ? d.status!=="done" : d.status==="done"
  );

  const live = spectating && liveData ? liveData : null;

  return (
    <div>
      <h1 style={c.h1}>⚔️ Duels ({duels.length})</h1>
      <Flash msg={msg} />

      {/* Spectate panel */}
      {live && (
        <div style={{ ...c.card, border:"1px solid rgba(99,102,241,0.5)", marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:"1rem", color:"#a5b4fc" }}>
              👁️ Spectating Live Duel
              {live.status!=="done" && <span style={{ marginLeft:8, fontSize:11, color:"#10b981", background:"rgba(16,185,129,0.1)", borderRadius:4, padding:"1px 6px" }}>● LIVE</span>}
              {live.status==="done" && <span style={{ marginLeft:8, fontSize:11, color:"#6b7280" }}>Finished</span>}
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {live.status!=="done" && <button onClick={()=>endDuel(live.id||spectating.id)} style={{ ...btn("r"), fontSize:12 }}>Force End</button>}
              <button onClick={()=>setSpectating(null)} style={{ ...btn(), fontSize:12 }}>✕ Close</button>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:12, alignItems:"center", marginBottom:12 }}>
            <div style={{ textAlign:"center" as const }}>
              <Avatar src={live.p1?.photoURL} name={live.p1?.name||"P1"} size={44} />
              <div style={{ fontWeight:700, marginTop:6, display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                {live.p1?.name} <BadgeIcon badge={live.p1?.badge} size={12} />
              </div>
              <div style={{ fontSize:32, fontWeight:900, color:"#f59e0b" }}>{live.p1TotalScore||0}</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>Round: {live.p1RoundScore||0}</div>
            </div>
            <div style={{ textAlign:"center" as const, color:"#4b5563", fontWeight:900, fontSize:18 }}>VS</div>
            <div style={{ textAlign:"center" as const }}>
              <Avatar src={live.p2?.photoURL} name={live.p2?.name||"P2"} size={44} />
              <div style={{ fontWeight:700, marginTop:6, display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                {live.p2?.name} <BadgeIcon badge={live.p2?.badge} size={12} />
              </div>
              <div style={{ fontSize:32, fontWeight:900, color:"#6366f1" }}>{live.p2TotalScore||0}</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>Round: {live.p2RoundScore||0}</div>
            </div>
          </div>
          <div style={{ fontSize:12, color:"#6b7280", textAlign:"center" as const }}>
            {live.rounds?.length} rounds · {live.questionsPerRound}Q each · Status: {live.status}
          </div>
        </div>
      )}

      <div style={c.card}>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          {(["all","live","done"] as const).map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{ ...btn(filter===f?"g":""), fontSize:12, opacity:filter===f?1:0.6 }}>
              {f==="all"?"All":f==="live"?"🔴 Live":"✅ Done"}
            </button>
          ))}
        </div>
        {loading ? <div style={{ color:"#6b7280" }}>Loading…</div> :
          filtered.length === 0 ? <div style={{ color:"#4b5563" }}>No duels found</div> :
          filtered.map((d:any, i) => {
            const isLive = d.status !== "done";
            const p1Total = d.p1TotalScore || 0;
            const p2Total = d.p2TotalScore || 0;
            return (
              <div key={i} style={{ ...c.row, alignItems:"flex-start" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
                    {isLive && <span style={{ fontSize:10, color:"#10b981", background:"rgba(16,185,129,0.15)", borderRadius:4, padding:"1px 6px" }}>● LIVE</span>}
                    <span style={{ color:"#f59e0b" }}>{d.p1?.name}</span>
                    <span style={{ color:"#f59e0b", fontWeight:900 }}>{p1Total}</span>
                    <span style={{ color:"#4b5563" }}>vs</span>
                    <span style={{ color:"#6366f1", fontWeight:900 }}>{p2Total}</span>
                    <span style={{ color:"#a5b4fc" }}>{d.p2?.name}</span>
                  </div>
                  <div style={{ fontSize:11, color:"#4b5563", marginTop:2 }}>{d.rounds?.length}R · {d.questionsPerRound}Q · {new Date(d.createdAt).toLocaleString()}</div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0, marginLeft:8 }}>
                  <button onClick={()=>setSpectating(spectating?.id===d.id?null:d)} style={{ ...btn(spectating?.id===d.id?"g":""), fontSize:12, padding:"4px 10px" }}>
                    {spectating?.id===d.id?"👁️ Watching":"👁️ Spectate"}
                  </button>
                  {isLive && <button onClick={()=>endDuel(d.id)} style={{ ...btn("y"), fontSize:12, padding:"4px 10px" }}>End</button>}
                  <button onClick={()=>deleteDuel(d.id)} style={{ ...btn("r"), fontSize:12, padding:"4px 10px" }}>Delete</button>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}


// ── WARNS PANEL ───────────────────────────────────────────────────────────────
function WarnsPanel() {
  const [warns, setWarns] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [warnUid, setWarnUid] = useState("");
  const [warnReason, setWarnReason] = useState("");
  const [warnSubject, setWarnSubject] = useState("");
  const [sortBy, setSortBy] = useState<"recent"|"most">("recent");
  const { msg, flash } = useFlash();

  useEffect(() => {
    Promise.all([get(ref(db,"warns")), get(ref(db,"users"))]).then(([wSnap, uSnap]) => {
      const userMap: Record<string,any> = {};
      if (uSnap.exists()) {
        Object.entries(uSnap.val() as any).forEach(([uid,u]:any) => { userMap[uid] = {...u, uid}; });
        setUsers(Object.values(userMap));
      }
      if (wSnap.exists()) {
        const list: any[] = [];
        Object.entries(wSnap.val() as any).forEach(([uid, warnObj]:any) => {
          const warnList = Object.entries(warnObj).map(([key, w]:any) => ({
            uid, key, username: userMap[uid]?.username||uid, ...w
          }));
          list.push(...warnList);
        });
        list.sort((a,b) => b.warnedAt - a.warnedAt);
        setWarns(list);
      }
      setLoading(false);
    });
  }, []);

  async function issueWarn() {
    const target = users.find(u=>u.uid===warnUid.trim()||u.username?.toLowerCase()===warnUid.trim().toLowerCase());
    if (!target) { flash("User not found","error"); return; }
    const finalReason = warnReason.trim() || "No reason given";
    const key = Date.now().toString();
    const entry: any = { reason: finalReason, warnedAt: Date.now(), time: new Date().toLocaleString(), adminUid: _adminUid, adminUsername: _adminUsername };
    if (warnSubject.trim()) entry.subject = warnSubject.trim();
    await set(ref(db, `warns/${target.uid}/${key}`), entry);
    // Count subject warns
    let subjectCount = 1;
    const subj = warnSubject.trim();
    if (subj) {
      subjectCount = warns.filter(w => w.uid===target.uid && w.subject===subj).length + 1;
    }
    const totalWarns = warns.filter(w => w.uid===target.uid).length + 1;
    // Trigger popup
    await set(ref(db, `users/${target.uid}/pendingWarn`), { reason: finalReason, subject: subj||null, subjectCount, totalWarns, warnedAt: Date.now() });
    await update(ref(db, `users/${target.uid}`), { lastWarnedAt: Date.now() });
    setWarns(w => [{ uid:target.uid, key, username:target.username, ...entry }, ...w]);
    logAdminAction("WARN", target.username, (subj ? `[${subj}] ` : "") + finalReason);
    flash(`⚠️ ${target.username} warned`);
    setWarnUid(""); setWarnReason(""); setWarnSubject("");
  }

  async function deleteWarn(uid: string, key: string) {
    await remove(ref(db, `warns/${uid}/${key}`));
    setWarns(w => w.filter(x => !(x.uid===uid && x.key===key)));
    flash("Warn removed");
  }

  // Group by user for "most warned" sort
  const warnCounts: Record<string,number> = {};
  warns.forEach(w => { warnCounts[w.uid] = (warnCounts[w.uid]||0)+1; });

  const filtered = warns
    .filter(w => !search || w.username?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => sortBy==="most" ? (warnCounts[b.uid]||0)-(warnCounts[a.uid]||0) : b.warnedAt-a.warnedAt);

  return (
    <div>
      <h1 style={c.h1}>⚠️ Warns ({warns.length})</h1>
      <Flash msg={msg} />
      <div style={c.card}>
        <div style={c.h2}>Issue Warning</div>
        <label style={c.label}>Username or UID</label>
        <input value={warnUid} onChange={e=>setWarnUid(e.target.value)} placeholder="username or UID" style={c.input} />
        <label style={c.label}>Subject (optional)</label>
        <input value={warnSubject} onChange={e=>setWarnSubject(e.target.value)} placeholder="e.g. cheating, spam, language" style={c.input} />
        <label style={c.label}>Reason</label>
        <input value={warnReason} onChange={e=>setWarnReason(e.target.value)} placeholder="e.g. inappropriate language (leave blank = No reason given)" style={c.input}
          onKeyDown={e=>e.key==="Enter"&&issueWarn()} />
        <button onClick={issueWarn} style={{ ...btn("y"), width:"100%", fontWeight:800, padding:"12px" }}>⚠️ Issue Warning</button>
      </div>
      <div style={c.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={c.h2}>All Warnings</div>
          <div style={{ display:"flex", gap:6 }}>
            {(["recent","most"] as const).map(s=>(
              <button key={s} onClick={()=>setSortBy(s)} style={{ ...btn(sortBy===s?"y":""), fontSize:11, opacity:sortBy===s?1:0.6 }}>
                {s==="recent"?"🕐 Recent":"⚠️ Most Warned"}
              </button>
            ))}
          </div>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by username…" style={c.input} />
        {loading ? <div style={{color:"#6b7280"}}>Loading…</div> :
          filtered.length===0 ? <div style={{color:"#4b5563",textAlign:"center" as const,padding:"20px 0"}}>No warnings yet</div> :
          filtered.map((w,i) => (
            <div key={i} style={c.row}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
                  <span style={{ fontWeight:700, color:"#f59e0b" }}>{w.username}</span>
                  <span style={{ fontSize:11, color:"#ef4444", background:"rgba(239,68,68,0.1)", borderRadius:4, padding:"1px 6px" }}>
                    {warnCounts[w.uid]||1} warn{(warnCounts[w.uid]||1)>1?"s":""}
                  </span>
                </div>
                {w.subject && <div style={{ fontSize:11, color:"#f59e0b", marginTop:2 }}>Subject: {w.subject}</div>}
                <div style={{ fontSize:13, color:"#d1d5db", marginTop:1 }}>{w.reason}</div>
                <div style={{ fontSize:11, color:"#4b5563", marginTop:2 }}>by {w.adminUsername} · {w.time}</div>
              </div>
              <button onClick={()=>deleteWarn(w.uid, w.key)} style={{ ...btn("r"), fontSize:12, padding:"4px 10px", flexShrink:0 }}>Remove</button>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [user, setUser] = useState<User|null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handler = (e: any) => setTab(e.detail.tab);
    window.addEventListener("admin-tab", handler);
    return () => window.removeEventListener("admin-tab", handler);
  }, []);

  // Set module-level admin context for logAdminAction
  useEffect(() => {
    if (user) {
      _adminUid = user.uid;
      _adminUsername = user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "admin";
      // Try to get username from Firebase
      get(ref(db, `users/${user.uid}/username`)).then(s => { if (s.exists()) _adminUsername = s.val(); });
    }
  }, [user?.uid]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const [initBanUid, setInitBanUid] = useState<string|undefined>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab"); if(t) setTab(t);
    const uid = params.get("uid")||params.get("ban"); if(uid) { setInitBanUid(uid); if(!t) setTab("bans"); }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u); setAuthLoading(false);
      if (u) {
        const snap = await get(ref(db,`users/${u.uid}/isAdmin`));
        setIsAdmin(snap.exists()&&snap.val()===true);
      }
    });
    return () => unsub();
  }, []);

  if (authLoading) return <div style={{ ...c.page, display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ color:"#6b7280" }}>Loading…</div></div>;

  if (!user) return (
    <div style={{ ...c.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:20, padding:"32px 28px", maxWidth:360, textAlign:"center" as const }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🔐</div>
        <div style={{ fontSize:"1.2rem", fontWeight:900, marginBottom:8 }}>Admin Access</div>
        <div style={{ color:"#6b7280", fontSize:14, marginBottom:24 }}>Sign in to continue</div>
        <button onClick={()=>signInWithPopup(auth,googleProvider)}
          style={{ display:"flex", alignItems:"center", gap:8, background:"#fff", border:"none", borderRadius:10, color:"#1f2937", fontSize:14, fontWeight:700, padding:"10px 20px", cursor:"pointer", margin:"0 auto" }}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.7 29.3 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 16.3 3 9.7 7.9 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.3 0 10.2-1.9 13.9-5.1l-6.4-5.4C29.6 36.1 26.9 37 24 37c-5.2 0-9.6-3.3-11.3-8H6.2C9.5 38.9 16.2 45 24 45z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.4 5.4C41.2 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );

  if (!isAdmin) return (
    <div style={{ ...c.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:20, padding:"32px 28px", maxWidth:360, textAlign:"center" as const }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🚫</div>
        <div style={{ fontSize:"1.2rem", fontWeight:900, marginBottom:8 }}>Access Denied</div>
        <div style={{ color:"#6b7280", fontSize:14, marginBottom:6 }}>Signed in as {user.email}</div>
        <div style={{ color:"#4b5563", fontSize:13 }}>Your account doesn't have admin privileges.</div>
        <a href="/" style={{ display:"inline-block", marginTop:20, color:"#f59e0b", fontSize:13 }}>← Back to TrivQuic</a>
      </div>
    </div>
  );

  const PANELS = (
    <>
      {tab==="dashboard"     && <StatsPanel />}
      {tab==="announcements" && <AnnouncementPanel />}
      {tab==="questions"     && <QuestionsPanel />}
      {tab==="users"         && <UsersPanel />}
      {tab==="leaderboard"   && <LeaderboardPanel />}
      {tab==="analytics"     && <AnalyticsPanel />}
      {tab==="reports"       && <ReportsPanel />}
      {tab==="chatreports"   && <ChatReportsPanel />}
      {tab==="duels"         && <DuelsAdminPanel />}
      {tab==="bans"          && <BansPanel initUid={initBanUid} />}
      {tab==="warns"         && <WarnsPanel />}
      {tab==="notifhistory"  && <NotifHistoryPanel />}
      {tab==="activitylog"   && <ActivityLogPanel />}
      {tab==="system"        && <SystemPanel />}
      {tab==="links"         && <LinksPanel />}
    </>
  );

  const currentNav = NAV.find(n => n.id === tab);

  if (isMobile) return (
    <div style={{ background:"#0f0f1a", minHeight:"100vh", color:"#fff", paddingBottom:70 }}>
      {/* Mobile header */}
      <div style={{ background:"#0f0f1a", borderBottom:"1px solid #1e1e30", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky" as const, top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>{currentNav?.icon}</span>
          <div style={{ fontSize:"1rem", fontWeight:900, color:"#f59e0b" }}>{currentNav?.label}</div>
        </div>
        <button onClick={() => setMobileNavOpen(o => !o)} style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:8, color:"#f59e0b", fontSize:12, fontWeight:700, padding:"6px 12px", cursor:"pointer" }}>
          {mobileNavOpen ? "✕ Close" : "☰ Menu"}
        </button>
      </div>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div style={{ position:"fixed" as const, inset:0, zIndex:200, background:"rgba(0,0,0,0.7)" }} onClick={() => setMobileNavOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position:"absolute" as const, top:0, right:0, width:260, height:"100%", background:"#0f0f1a", borderLeft:"1px solid #1e1e30", display:"flex", flexDirection:"column" as const }}>
            <div style={{ padding:"20px 16px 16px", borderBottom:"1px solid #1e1e30" }}>
              <div style={{ fontSize:"1rem", fontWeight:900, color:"#f59e0b" }}>⚡ TrivQuic Admin</div>
              <div style={{ fontSize:11, color:"#4b5563", marginTop:2 }}>{user.email}</div>
            </div>
            <div style={{ flex:1, overflowY:"auto" as const }}>
              {NAV.map(item => (
                <button key={item.id} onClick={() => { setTab(item.id); setMobileNavOpen(false); }} style={{
                  width:"100%", background:tab===item.id?"rgba(245,158,11,0.1)":"transparent",
                  border:"none", borderLeft:`3px solid ${tab===item.id?"#f59e0b":"transparent"}`,
                  color:tab===item.id?"#f59e0b":"#9ca3af",
                  fontSize:15, fontWeight:700, padding:"13px 16px", cursor:"pointer",
                  textAlign:"left" as const, display:"flex", alignItems:"center", gap:12,
                }}>
                  <span style={{ fontSize:18 }}>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
            <div style={{ padding:"16px", borderTop:"1px solid #1e1e30" }}>
              <a href="/" style={{ color:"#4b5563", fontSize:13, textDecoration:"none" }}>← Back to game</a>
            </div>
          </div>
        </div>
      )}

      {/* Mobile content */}
      <div style={{ padding:"16px" }}>
        {PANELS}
      </div>
    </div>
  );

  return (
    <div style={{ ...c.page, display:"flex" }}>
      <div style={c.sidebar}>
        <div style={{ padding:"20px 16px 16px", borderBottom:"1px solid #1e1e30" }}>
          <div style={{ fontSize:"1rem", fontWeight:900, color:"#f59e0b" }}>⚡ TrivQuic Admin</div>
          <div style={{ fontSize:11, color:"#4b5563", marginTop:2 }}>{user.email}</div>
        </div>
        <div style={{ flex:1 }}>
          {NAV.map(item=>(
            <button key={item.id} onClick={()=>setTab(item.id)} style={{
              width:"100%", background:tab===item.id?"rgba(245,158,11,0.1)":"transparent",
              border:"none", borderLeft:`3px solid ${tab===item.id?"#f59e0b":"transparent"}`,
              color:tab===item.id?"#f59e0b":"#6b7280",
              fontSize:14, fontWeight:700, padding:"11px 16px", cursor:"pointer",
              textAlign:"left" as const, display:"flex", alignItems:"center", gap:10,
            }}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </div>
        <div style={{ padding:"16px" }}>
          <a href="/" style={{ color:"#4b5563", fontSize:12, textDecoration:"none" }}>← Back to game</a>
        </div>
      </div>

      <div style={c.main}>
        {PANELS}
      </div>
    </div>
  );
}
