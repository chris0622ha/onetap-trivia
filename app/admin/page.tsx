"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { db, auth, googleProvider } from "../lib/firebase";
import {
  ref, get, set, update, remove, onValue, off
} from "firebase/database";
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

const s = {
  page: { minHeight:"100vh", background:"#0a0a14", color:"#fff", fontFamily:"system-ui,sans-serif", padding:"0" },
  sidebar: { width:200, background:"#0f0f1a", borderRight:"1px solid #1e1e30", minHeight:"100vh", padding:"20px 0", flexShrink:0 } as React.CSSProperties,
  main: { flex:1, padding:"28px 32px", overflowY:"auto" as const },
  card: { background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:14, padding:"20px 24px", marginBottom:20 },
  h2: { fontSize:"1.1rem", fontWeight:800, marginBottom:16, color:"#fff" },
  label: { fontSize:11, color:"#6b7280", textTransform:"uppercase" as const, letterSpacing:"0.06em", marginBottom:6, display:"block" },
  input: { width:"100%", background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:8, color:"#fff", fontSize:14, padding:"9px 12px", outline:"none", boxSizing:"border-box" as const, marginBottom:10 },
  btn: (color = "#f59e0b") => ({ background:`rgba(${color === "#ef4444" ? "239,68,68" : color === "#10b981" ? "16,185,129" : color === "#6366f1" ? "99,102,241" : "245,158,11"},0.15)`, border:`1px solid ${color}44`, borderRadius:8, color, fontSize:13, fontWeight:700, padding:"8px 16px", cursor:"pointer" }),
  danger: { background:"rgba(239,68,68,0.15)", border:"1px solid #ef444444", borderRadius:8, color:"#ef4444", fontSize:12, fontWeight:700, padding:"6px 12px", cursor:"pointer" },
  success: { background:"rgba(16,185,129,0.15)", border:"1px solid #10b98144", borderRadius:8, color:"#10b981", fontSize:12, fontWeight:700, padding:"6px 12px", cursor:"pointer" },
  row: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #1e1e30" } as React.CSSProperties,
  tag: (c: string) => ({ background:`rgba(${c},0.15)`, border:`1px solid rgba(${c},0.3)`, borderRadius:99, color:`rgb(${c})`, fontSize:11, fontWeight:700, padding:"2px 8px" }),
  notice: (c: string) => ({ background:`rgba(${c},0.1)`, border:`1px solid rgba(${c},0.3)`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, color:`rgb(${c})` }),
};

const NAV_ITEMS = [
  { id:"users",     label:"Users",          icon:"👥" },
  { id:"leaderboard", label:"Leaderboard",  icon:"🏆" },
  { id:"bans",      label:"Bans",           icon:"🔨" },
];

function Avatar({ src, name, size = 32 }: { src?: string|null; name: string; size?: number }) {
  return src ? (
    <img src={src} alt="" width={size} height={size}
      style={{ borderRadius:"50%", border:"2px solid #2d2d44", flexShrink:0, display:"block" }} />
  ) : (
    <div style={{ width:size, height:size, borderRadius:"50%", background:"rgba(245,158,11,0.2)",
      border:"2px solid #2d2d44", display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size * 0.4, fontWeight:900, color:"#f59e0b", flexShrink:0 }}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

function Msg({ text, type }: { text: string; type: "success"|"error"|"info" }) {
  const c = type === "success" ? "16,185,129" : type === "error" ? "239,68,68" : "99,102,241";
  return <div style={s.notice(c)}>{text}</div>;
}

// ── USERS PANEL ───────────────────────────────────────────────────────────────
function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [msg, setMsg] = useState<{text:string;type:"success"|"error"|"info"}|null>(null);
  const [editScore, setEditScore] = useState("");
  const [editStreakVal, setEditStreakVal] = useState("");
  const [resetChanges, setResetChanges] = useState(false);

  const flash = (text: string, type: "success"|"error"|"info" = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  useEffect(() => {
    get(ref(db, "users")).then(snap => {
      if (!snap.exists()) { setLoading(false); return; }
      const list = Object.entries(snap.val()).map(([uid, d]: [string, any]) => ({ uid, ...d }));
      setUsers(list.sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0)));
      setLoading(false);
    });
  }, []);

  async function deleteLeaderboardEntries(uid: string) {
    const snap = await get(ref(db, "leaderboard"));
    if (!snap.exists()) return;
    const updates: any = {};
    Object.keys(snap.val()).forEach(k => {
      if (k.startsWith(uid + "_") || snap.val()[k]?.uid === uid) updates[`leaderboard/${k}`] = null;
    });
    if (Object.keys(updates).length) await update(ref(db), updates);
  }

  async function handleDeleteLB(uid: string, username: string) {
    if (!confirm(`Delete all leaderboard entries for ${username}?`)) return;
    await deleteLeaderboardEntries(uid);
    flash(`Deleted leaderboard entries for ${username}`);
  }

  async function handleResetUsername(uid: string) {
    await update(ref(db, `users/${uid}`), { usernameChangesLeft: 3 });
    setUsers(u => u.map(x => x.uid === uid ? { ...x, usernameChangesLeft: 3 } : x));
    if (selected?.uid === uid) setSelected((s: any) => ({ ...s, usernameChangesLeft: 3 }));
    flash("Username changes reset to 3");
  }

  async function handleEditScore(uid: string) {
    const score = parseInt(editScore);
    if (isNaN(score) || score < 0) { flash("Invalid score", "error"); return; }
    // Update all leaderboard entries for this uid
    const snap = await get(ref(db, "leaderboard"));
    if (snap.exists()) {
      const updates: any = {};
      Object.entries(snap.val()).forEach(([k, v]: [string, any]) => {
        if (k.startsWith(uid + "_") || v?.uid === uid) updates[`leaderboard/${k}/score`] = score;
      });
      if (Object.keys(updates).length) await update(ref(db), updates);
    }
    await update(ref(db, `users/${uid}`), { bestScore: score });
    setUsers(u => u.map(x => x.uid === uid ? { ...x, bestScore: score } : x));
    if (selected?.uid === uid) setSelected((s: any) => ({ ...s, bestScore: score }));
    flash(`Score updated to ${score}`);
    setEditScore("");
  }

  async function handleToggleAdmin(uid: string, current: boolean) {
    await update(ref(db, `users/${uid}`), { isAdmin: !current });
    setUsers(u => u.map(x => x.uid === uid ? { ...x, isAdmin: !current } : x));
    if (selected?.uid === uid) setSelected((s: any) => ({ ...s, isAdmin: !current }));
    flash(`Admin ${!current ? "granted" : "revoked"}`);
  }

  const filtered = users.filter(u =>
    !search || u.username?.toLowerCase().includes(search.toLowerCase()) || u.uid.includes(search)
  );

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <h1 style={{ fontSize:"1.4rem", fontWeight:900, margin:0 }}>Users <span style={{ color:"#4b5563", fontSize:"1rem", fontWeight:400 }}>({users.length})</span></h1>
      </div>
      {msg && <Msg {...msg} />}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by username or UID…" style={s.input} />

      <div style={{ display:"grid", gridTemplateColumns: selected ? "1fr 340px" : "1fr", gap:20 }}>
        {/* User list */}
        <div style={s.card}>
          {loading ? <div style={{ color:"#6b7280" }}>Loading…</div> :
            filtered.map(u => (
              <div key={u.uid} onClick={() => setSelected(selected?.uid === u.uid ? null : u)}
                style={{ ...s.row, cursor:"pointer", background: selected?.uid === u.uid ? "rgba(245,158,11,0.05)" : "transparent",
                  borderRadius:8, padding:"10px 8px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <Avatar src={u.photoURL} name={u.username || "?"} size={36} />
                  <div>
                    <div style={{ fontWeight:700, fontSize:14 }}>
                      {u.username}
                      {u.isAdmin && <span style={{ marginLeft:6, ...s.tag("245,158,11") }}>admin</span>}
                    </div>
                    <div style={{ fontSize:11, color:"#4b5563", fontFamily:"monospace" }}>{u.uid.slice(0,16)}…</div>
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ color:"#f59e0b", fontWeight:800 }}>{u.bestScore ?? 0}</div>
                  <div style={{ fontSize:11, color:"#6b7280" }}>{u.gamesPlayed ?? 0} games</div>
                </div>
              </div>
            ))
          }
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={s.card}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16, paddingBottom:16, borderBottom:"1px solid #2d2d44" }}>
              <Avatar src={selected.photoURL} name={selected.username} size={48} />
              <div>
                <div style={{ fontWeight:900, fontSize:"1.1rem" }}>{selected.username}</div>
                <div style={{ fontSize:11, color:"#6b7280", fontFamily:"monospace", wordBreak:"break-all" as const }}>{selected.uid}</div>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
              {[["Best Score", selected.bestScore ?? 0, "#f59e0b"], ["Games", selected.gamesPlayed ?? 0, "#e5e7eb"],
                ["Best Streak", selected.bestStreak ?? 0, "#ef4444"], ["UN Changes", selected.usernameChangesLeft ?? 3, "#10b981"]
              ].map(([l, v, c]) => (
                <div key={l as string} style={{ background:"#0f0f1a", borderRadius:10, padding:"10px", textAlign:"center", border:"1px solid #2d2d44" }}>
                  <div style={{ fontSize:18, fontWeight:900, color: c as string }}>{v as number}</div>
                  <div style={{ fontSize:10, color:"#6b7280" }}>{l}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={s.label}>Override best score</label>
              <div style={{ display:"flex", gap:8 }}>
                <input value={editScore} onChange={e => setEditScore(e.target.value.replace(/\D/g,""))}
                  placeholder="New score" style={{ ...s.input, marginBottom:0, flex:1 }} />
                <button onClick={() => handleEditScore(selected.uid)} style={s.btn("#6366f1")}>Set</button>
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={() => handleResetUsername(selected.uid)} style={s.btn("#10b981")}>
                Reset username changes → 3
              </button>
              <button onClick={() => handleDeleteLB(selected.uid, selected.username)} style={s.btn("#ef4444")}>
                Delete leaderboard entries
              </button>
              <button onClick={() => handleToggleAdmin(selected.uid, selected.isAdmin)} style={s.btn(selected.isAdmin ? "#ef4444" : "#f59e0b")}>
                {selected.isAdmin ? "Revoke admin" : "Grant admin"}
              </button>
              <a href={`/admin?ban=${selected.uid}`} style={{ ...s.btn("#ef4444"), textAlign:"center", textDecoration:"none", display:"block" }}>
                Go to Ban panel →
              </a>
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
  const [msg, setMsg] = useState<{text:string;type:"success"|"error"|"info"}|null>(null);
  const [editingKey, setEditingKey] = useState<string|null>(null);
  const [editScore, setEditScore] = useState("");

  const flash = (text: string, type: "success"|"error"|"info" = "success") => {
    setMsg({ text, type }); setTimeout(() => setMsg(null), 3000);
  };

  useEffect(() => {
    const lbRef = ref(db, "leaderboard");
    const unsub = onValue(lbRef, snap => {
      if (!snap.exists()) { setEntries([]); setLoading(false); return; }
      const list = Object.entries(snap.val()).map(([key, d]: [string, any]) => ({ key, ...d }));
      setEntries(list.sort((a, b) => b.score - a.score));
      setLoading(false);
    });
    return () => off(lbRef);
  }, []);

  async function handleDelete(key: string, name: string) {
    if (!confirm(`Delete "${name}" from leaderboard?`)) return;
    await remove(ref(db, `leaderboard/${key}`));
    flash(`Deleted ${name}`);
  }

  async function handleEditScore(key: string) {
    const score = parseInt(editScore);
    if (isNaN(score) || score < 0) { flash("Invalid score", "error"); return; }
    await update(ref(db, `leaderboard/${key}`), { score });
    flash(`Score updated to ${score}`);
    setEditingKey(null);
    setEditScore("");
  }

  const filtered = entries.filter(e =>
    !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 style={{ fontSize:"1.4rem", fontWeight:900, marginBottom:20 }}>Leaderboard <span style={{ color:"#4b5563", fontSize:"1rem", fontWeight:400 }}>({entries.length} entries)</span></h1>
      {msg && <Msg {...msg} />}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name…" style={s.input} />
      <div style={s.card}>
        {loading ? <div style={{ color:"#6b7280" }}>Loading…</div> : filtered.length === 0 ? (
          <div style={{ color:"#4b5563", padding:"12px 0" }}>No entries found</div>
        ) : filtered.map((e, i) => (
          <div key={e.key} style={{ ...s.row, flexWrap:"wrap" as const, gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0 }}>
              <span style={{ fontSize:12, fontWeight:800, color:"#4b5563", width:28, textAlign:"right", flexShrink:0 }}>{i + 1}</span>
              <div style={{ minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.name}</div>
                <div style={{ fontSize:10, color:"#4b5563" }}>
                  {e.category} · {e.roundSize ?? "?"}Q · {e.timerDuration === 0 ? "∞" : `${e.timerDuration ?? "?"}s`} · {e.date ?? ""}
                </div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {editingKey === e.key ? (
                <>
                  <input value={editScore} onChange={ev => setEditScore(ev.target.value.replace(/\D/g,""))}
                    placeholder="Score" style={{ ...s.input, width:80, marginBottom:0 }} />
                  <button onClick={() => handleEditScore(e.key)} style={s.success}>Save</button>
                  <button onClick={() => setEditingKey(null)} style={{ ...s.danger, background:"transparent" }}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ color:"#f59e0b", fontWeight:800, fontSize:15 }}>{e.score}</span>
                  <button onClick={() => { setEditingKey(e.key); setEditScore(String(e.score)); }} style={s.btn("#6366f1")}>Edit</button>
                  <button onClick={() => handleDelete(e.key, e.name)} style={s.danger}>Delete</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BANS PANEL ────────────────────────────────────────────────────────────────
function BansPanel({ initUid }: { initUid?: string }) {
  const [bans, setBans] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState(initUid || "");
  const [banUid, setBanUid] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banType, setBanType] = useState<"permanent"|"temp">("temp");
  const [banDays, setBanDays] = useState("1");
  const [msg, setMsg] = useState<{text:string;type:"success"|"error"|"info"}|null>(null);
  const [loading, setLoading] = useState(true);

  const flash = (text: string, type: "success"|"error"|"info" = "success") => {
    setMsg({ text, type }); setTimeout(() => setMsg(null), 3000);
  };

  useEffect(() => {
    Promise.all([
      get(ref(db, "bans")),
      get(ref(db, "users")),
    ]).then(([banSnap, userSnap]) => {
      if (banSnap.exists()) {
        const list = Object.entries(banSnap.val()).map(([uid, d]: [string, any]) => ({ uid, ...d }));
        setBans(list);
      }
      if (userSnap.exists()) {
        setUsers(Object.entries(userSnap.val()).map(([uid, d]: [string, any]) => ({ uid, ...d })));
      }
      setLoading(false);
    });
  }, []);

  // Auto-fill if coming from user panel
  useEffect(() => {
    if (initUid) setBanUid(initUid);
  }, [initUid]);

  function resolveUser(input: string) {
    // Try UID first, then username
    const byUid = users.find(u => u.uid === input.trim());
    if (byUid) return byUid;
    return users.find(u => u.username?.toLowerCase() === input.trim().toLowerCase());
  }

  async function handleBan() {
    const target = resolveUser(banUid);
    if (!target) { flash("User not found", "error"); return; }
    if (!banReason.trim()) { flash("Enter a reason", "error"); return; }

    const now = Date.now();
    const expiresAt = banType === "temp" ? now + parseInt(banDays) * 86400000 : null;

    const banData: any = {
      username: target.username,
      photoURL: target.photoURL || null,
      reason: banReason.trim(),
      bannedAt: now,
      type: banType,
      expiresAt,
    };

    await set(ref(db, `bans/${target.uid}`), banData);
    await update(ref(db, `users/${target.uid}`), { banned: true, banExpiresAt: expiresAt });
    setBans(b => [...b.filter(x => x.uid !== target.uid), { uid: target.uid, ...banData }]);
    flash(`${target.username} ${banType === "temp" ? `banned for ${banDays} day(s)` : "permanently banned"}`);
    setBanUid(""); setBanReason(""); setBanDays("1");
  }

  async function handleUnban(uid: string, username: string) {
    await remove(ref(db, `bans/${uid}`));
    await update(ref(db, `users/${uid}`), { banned: false, banExpiresAt: null });
    setBans(b => b.filter(x => x.uid !== uid));
    flash(`${username} unbanned`);
  }

  const filteredBans = bans.filter(b =>
    !search || b.username?.toLowerCase().includes(search.toLowerCase()) || b.uid.includes(search)
  );

  return (
    <div>
      <h1 style={{ fontSize:"1.4rem", fontWeight:900, marginBottom:20 }}>Bans <span style={{ color:"#4b5563", fontSize:"1rem", fontWeight:400 }}>({bans.length} active)</span></h1>
      {msg && <Msg {...msg} />}

      {/* Ban form */}
      <div style={s.card}>
        <div style={s.h2}>Issue Ban</div>
        <label style={s.label}>Username or UID</label>
        <input value={banUid} onChange={e => setBanUid(e.target.value)}
          placeholder="username or full UID" style={s.input} />

        {banUid && resolveUser(banUid) && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, padding:"8px 12px",
            background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.2)", borderRadius:8 }}>
            <Avatar src={resolveUser(banUid)?.photoURL} name={resolveUser(banUid)?.username} size={32} />
            <div>
              <div style={{ fontWeight:700 }}>{resolveUser(banUid)?.username}</div>
              <div style={{ fontSize:11, color:"#6b7280" }}>{resolveUser(banUid)?.uid?.slice(0,20)}…</div>
            </div>
          </div>
        )}

        <label style={s.label}>Reason</label>
        <input value={banReason} onChange={e => setBanReason(e.target.value)}
          placeholder="e.g. cheating, harassment" style={s.input} />

        <label style={s.label}>Ban type</label>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          {(["temp", "permanent"] as const).map(t => (
            <button key={t} onClick={() => setBanType(t)} style={{
              ...s.btn(banType === t ? "#ef4444" : "#6b7280"),
              opacity: banType === t ? 1 : 0.5,
            }}>{t === "temp" ? "⏱ Temporary" : "🔒 Permanent"}</button>
          ))}
        </div>

        {banType === "temp" && (
          <>
            <label style={s.label}>Duration (days)</label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, marginBottom:12 }}>
              {["1","3","7","14","30","90"].map(d => (
                <button key={d} onClick={() => setBanDays(d)} style={{
                  ...s.btn(banDays === d ? "#ef4444" : "#6b7280"),
                  opacity: banDays === d ? 1 : 0.5, padding:"6px 12px",
                }}>{d}d</button>
              ))}
              <input value={banDays} onChange={e => setBanDays(e.target.value.replace(/\D/g,""))}
                placeholder="custom" style={{ ...s.input, marginBottom:0, width:80 }} />
            </div>
          </>
        )}

        <button onClick={handleBan} style={{
          width:"100%", background:"linear-gradient(135deg,#ef4444,#b91c1c)",
          border:"none", borderRadius:10, color:"#fff", fontSize:"0.95rem",
          fontWeight:800, padding:"12px", cursor:"pointer",
        }}>
          {banType === "temp" ? `Ban for ${banDays} day(s)` : "Permanently Ban"}
        </button>
      </div>

      {/* Active bans */}
      <div style={s.card}>
        <div style={s.h2}>Active Bans</div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search bans…" style={s.input} />
        {loading ? <div style={{ color:"#6b7280" }}>Loading…</div> :
          filteredBans.length === 0 ? <div style={{ color:"#4b5563" }}>No bans found</div> :
          filteredBans.map(b => {
            const isExpired = b.expiresAt && b.expiresAt < Date.now();
            const daysLeft = b.expiresAt ? Math.max(0, Math.ceil((b.expiresAt - Date.now()) / 86400000)) : null;
            return (
              <div key={b.uid} style={{ ...s.row, flexWrap:"wrap" as const, gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0 }}>
                  <Avatar src={b.photoURL} name={b.username || "?"} size={36} />
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontWeight:700 }}>{b.username}</span>
                      {b.type === "permanent"
                        ? <span style={s.tag("239,68,68")}>permanent</span>
                        : isExpired
                          ? <span style={s.tag("107,114,128")}>expired</span>
                          : <span style={s.tag("245,158,11")}>{daysLeft}d left</span>
                      }
                    </div>
                    <div style={{ fontSize:11, color:"#6b7280" }}>{b.reason}</div>
                    <div style={{ fontSize:10, color:"#4b5563" }}>
                      {new Date(b.bannedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <button onClick={() => handleUnban(b.uid, b.username)} style={s.success}>Unban</button>
              </div>
            );
          })
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
  const [tab, setTab] = useState("users");
  const [initBanUid, setInitBanUid] = useState<string|undefined>();

  useEffect(() => {
    // Check for ?ban=uid param
    const params = new URLSearchParams(window.location.search);
    const banParam = params.get("ban");
    if (banParam) { setInitBanUid(banParam); setTab("bans"); }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        const snap = await get(ref(db, `users/${u.uid}/isAdmin`));
        setIsAdmin(snap.exists() && snap.val() === true);
      }
    });
    return () => unsub();
  }, []);

  if (authLoading) return (
    <div style={{ ...s.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#6b7280" }}>Loading…</div>
    </div>
  );

  if (!user) return (
    <div style={{ ...s.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:20, padding:"32px 28px", maxWidth:360, textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🔐</div>
        <div style={{ fontSize:"1.2rem", fontWeight:900, marginBottom:8 }}>Admin Access</div>
        <div style={{ color:"#6b7280", fontSize:14, marginBottom:24 }}>Sign in to continue</div>
        <button onClick={() => signInWithPopup(auth, googleProvider)}
          style={{ display:"flex", alignItems:"center", gap:8, background:"#fff", border:"none",
            borderRadius:10, color:"#1f2937", fontSize:14, fontWeight:700, padding:"10px 20px",
            cursor:"pointer", margin:"0 auto" }}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.7 29.3 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.1-2.7-.4-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 16.3 3 9.7 7.9 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 45c5.3 0 10.2-1.9 13.9-5.1l-6.4-5.4C29.6 36.1 26.9 37 24 37c-5.2 0-9.6-3.3-11.3-8H6.2C9.5 38.9 16.2 45 24 45z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.4 5.4C41.2 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );

  if (!isAdmin) return (
    <div style={{ ...s.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:20, padding:"32px 28px", maxWidth:360, textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🚫</div>
        <div style={{ fontSize:"1.2rem", fontWeight:900, marginBottom:8 }}>Access Denied</div>
        <div style={{ color:"#6b7280", fontSize:14, marginBottom:6 }}>Signed in as {user.email}</div>
        <div style={{ color:"#4b5563", fontSize:13 }}>Your account doesn't have admin privileges.</div>
        <a href="/" style={{ display:"inline-block", marginTop:20, color:"#f59e0b", fontSize:13 }}>← Back to TrivQuic</a>
      </div>
    </div>
  );

  return (
    <div style={{ ...s.page, display:"flex" }}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={{ padding:"0 16px 20px", borderBottom:"1px solid #1e1e30", marginBottom:8 }}>
          <div style={{ fontSize:"1rem", fontWeight:900, color:"#f59e0b" }}>⚡ Admin</div>
          <div style={{ fontSize:11, color:"#4b5563", marginTop:2 }}>TrivQuic</div>
        </div>
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} style={{
            width:"100%", background: tab === item.id ? "rgba(245,158,11,0.1)" : "transparent",
            border:"none", borderLeft: `3px solid ${tab === item.id ? "#f59e0b" : "transparent"}`,
            color: tab === item.id ? "#f59e0b" : "#6b7280",
            fontSize:14, fontWeight:700, padding:"11px 16px", cursor:"pointer",
            textAlign:"left", display:"flex", alignItems:"center", gap:10,
          }}>
            <span>{item.icon}</span>{item.label}
          </button>
        ))}
        <div style={{ position:"absolute", bottom:20, padding:"0 16px" }}>
          <a href="/" style={{ color:"#4b5563", fontSize:12, textDecoration:"none" }}>← Back to game</a>
        </div>
      </div>

      {/* Main content */}
      <div style={s.main}>
        {tab === "users" && <UsersPanel />}
        {tab === "leaderboard" && <LeaderboardPanel />}
        {tab === "bans" && <BansPanel initUid={initBanUid} />}
      </div>
    </div>
  );
}
