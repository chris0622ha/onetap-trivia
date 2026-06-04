"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { db, auth, googleProvider } from "./lib/firebase";
import { ref, get, set, update, remove, onValue, off, query, orderByChild, equalTo } from "firebase/database";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

import { geography } from "./data/geography";
import { science } from "./data/science";
import { history } from "./data/history";
import { math } from "./data/math";
import { sports } from "./data/sports";
import { entertainment } from "./data/entertainment";

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

function shuffle(arr: any[]): any[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Badge component ──────────────────────────────────────────────────────────
function Badges({ userData }: { userData: any }) {
  if (!userData) return null;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3, marginLeft:4 }}>
      {userData.badge === "star"  && <span title="Loyal Player" style={{ fontSize:14 }}>⭐</span>}
      {userData.badge === "check" && <span title="Verified"     style={{ fontSize:13, color:"#3b82f6", fontWeight:900 }}>✓</span>}
      {userData.badge === "crown" && <span title="Champion"     style={{ fontSize:14 }}>👑</span>}
    </span>
  );
}

// ── User helpers ──────────────────────────────────────────────────────────────

async function loadUserData(uid: string) {
  try {
    const snap = await get(ref(db, `users/${uid}`));
    return snap.exists() ? snap.val() : null;
  } catch { return null; }
}

async function isUsernameTaken(username: string, excludeUid?: string): Promise<boolean> {
  try {
    const snap = await get(ref(db, "usernames"));
    if (!snap.exists()) return false;
    const val = snap.val();
    const uid = val[username.toLowerCase()];
    if (!uid) return false;
    if (excludeUid && uid === excludeUid) return false;
    return true;
  } catch { return false; }
}

async function claimUsername(uid: string, username: string, oldUsername?: string) {
  const updates: any = {};
  updates[`usernames/${username.toLowerCase()}`] = uid;
  if (oldUsername) delete updates[`usernames/${oldUsername.toLowerCase()}`];
  await update(ref(db), updates);
}

async function saveUserStats(uid: string, username: string, displayName: string, gameResult: {
  score: number; bestStreak: number; correct: number; total: number; category: string;
}) {
  try {
    const existing = await loadUserData(uid);
    const prev = existing || {
      username, displayName, gamesPlayed: 0, totalScore: 0, totalCorrect: 0,
      totalQuestions: 0, bestScore: 0, bestStreak: 0, categoryBests: {},
      usernameChangesLeft: 3, friendIds: [],
    };
    const categoryBests = { ...(prev.categoryBests || {}) };
    if (gameResult.score > (categoryBests[gameResult.category] || 0)) {
      categoryBests[gameResult.category] = gameResult.score;
    }
    await update(ref(db, `users/${uid}`), {
      username,
      displayName,
      gamesPlayed: (prev.gamesPlayed || 0) + 1,
      totalScore: (prev.totalScore || 0) + gameResult.score,
      totalCorrect: (prev.totalCorrect || 0) + gameResult.correct,
      totalQuestions: (prev.totalQuestions || 0) + gameResult.total,
      bestScore: Math.max(prev.bestScore || 0, gameResult.score),
      bestStreak: Math.max(prev.bestStreak || 0, gameResult.bestStreak),
      categoryBests,
      lastPlayed: new Date().toLocaleDateString(),
    });
  } catch {}
}

async function saveToGlobalLB(uid: string, displayName: string, username: string, score: number, streak: number, category: string, roundSize: number, timerDuration: number) {
  try {
    // Key per user+category+rounds+timer so each combo has its own personal best
    const entryKey = `${uid}_${category}_${roundSize}_${timerDuration}`;
    const lbRef = ref(db, `leaderboard/${entryKey}`);
    const snap = await get(lbRef);
    const lbName = displayName.toLowerCase() !== username.toLowerCase()
      ? `${displayName}(${username})`
      : displayName;
    if (snap.exists() && snap.val().score >= score) {
      await update(lbRef, { name: lbName });
      return;
    }
    const now = new Date();
    await set(lbRef, {
      uid, name: lbName, username, score, streak, category,
      roundSize, timerDuration,
      date: now.toLocaleDateString("en-US", { weekday:"short", year:"numeric", month:"short", day:"numeric" }),
      ts: now.getTime(),
    });
  } catch {}
}

// ── Username picker modal ─────────────────────────────────────────────────────

function UsernamePickerModal({ user, onDone }: { user: User; onDone: (username: string, userData: any) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const suggested = (user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "player").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 15);

  async function handleSubmit() {
    const clean = value.trim();
    if (!clean) { setError("Enter a username"); return; }
    if (clean.length < 2) { setError("At least 2 characters"); return; }
    if (clean.length > 15) { setError("Max 15 characters"); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) { setError("Letters, numbers, underscores only"); return; }
    setLoading(true);
    const taken = await isUsernameTaken(clean);
    if (taken) { setError("That username is taken"); setLoading(false); return; }
    const newUserData = {
      username: clean,
      displayName: clean,
      usernameChangesLeft: 3,
      friendIds: [],
      photoURL: user.photoURL || null,
      gamesPlayed: 0, totalScore: 0, totalCorrect: 0,
      totalQuestions: 0, bestScore: 0, bestStreak: 0,
      categoryBests: {}, lastPlayed: null,
    };
    await set(ref(db, `users/${user.uid}`), newUserData);
    await claimUsername(user.uid, clean);
    setLoading(false);
    onDone(clean, newUserData);
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:500,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:20,
        padding:"32px 28px", width:"100%", maxWidth:380, color:"#fff" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>⚡</div>
          <div style={{ fontSize:"1.4rem", fontWeight:900, marginBottom:6 }}>Choose your username</div>
          <div style={{ fontSize:13, color:"#6b7280", lineHeight:1.6 }}>
            Choose wisely — you can only change it{" "}
            <span style={{ color:"#f59e0b", fontWeight:700 }}>3 times</span>.
          </div>
        </div>

        {user.photoURL && (
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <img src={user.photoURL} alt="" width={52} height={52}
              style={{ borderRadius:"50%", border:"3px solid #2d2d44" }} />
          </div>
        )}

        <input
          autoFocus
          value={value}
          maxLength={15}
          placeholder={suggested}
          onChange={e => { setValue(e.target.value.replace(/[^a-zA-Z0-9_]/g, "")); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          style={{ width:"100%", background:"#0f0f1a", border:`1px solid ${error ? "#ef4444" : "#2d2d44"}`,
            borderRadius:10, color:"#fff", fontSize:18, fontWeight:700, padding:"12px 16px",
            outline:"none", boxSizing:"border-box", textAlign:"center", letterSpacing:"0.05em" }}
        />
        {error && <div style={{ color:"#ef4444", fontSize:12, marginTop:6, textAlign:"center" }}>{error}</div>}
        <div style={{ fontSize:11, color:"#4b5563", textAlign:"center", marginTop:6 }}>
          Letters, numbers, underscores · max 15
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width:"100%", background:"linear-gradient(135deg, #f59e0b, #ef4444)", border:"none",
            borderRadius:12, color:"#fff", fontSize:"1rem", fontWeight:800,
            padding:"14px", cursor: loading ? "default" : "pointer", marginTop:18,
            opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Checking…" : "Claim Username ⚡"}
        </button>
      </div>
    </div>
  );
}

// ── Profile Modal ─────────────────────────────────────────────────────────────

function ProfileModal({ user, userData, onClose, onUserDataChange }: {
  user: User; userData: any; onClose: () => void; onUserDataChange: (d: any) => void;
}) {
  const [tab, setTab] = useState<"stats"|"edit"|"status"|"friends">("stats");

  // Edit tab state
  const [newUsername, setNewUsername] = useState(userData?.username || "");
  const [newPhotoURL, setNewPhotoURL] = useState(userData?.photoURL || user.photoURL || "");
  const [usernameError, setUsernameError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setPhotoError("Image must be under 2 MB"); return; }
    setPhotoError("");
    setPhotoUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setNewPhotoURL(reader.result as string);
      setPhotoUploading(false);
    };
    reader.onerror = () => { setPhotoError("Failed to read file"); setPhotoUploading(false); };
    reader.readAsDataURL(file);
  }

  // Friends tab state
  const [friendInput, setFriendInput] = useState("");
  const [friendError, setFriendError] = useState("");
  const [friendMsg, setFriendMsg] = useState("");
  const [friendProfiles, setFriendProfiles] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [chatFriend, setChatFriend] = useState<any>(null);

  // Status tab state
  const [statusPreset, setStatusPreset] = useState(userData?.status?.preset || "online");
  const [customStatus, setCustomStatus] = useState(userData?.status?.custom || "");
  const [mutedUids, setMutedUids] = useState<string[]>(userData?.mutedUids || []);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const STATUS_PRESETS = [
    { id:"online",    label:"🟢 Online",           notif: true  },
    { id:"dnd",       label:"⛔ Do Not Disturb",    notif: false },
    { id:"sleeping",  label:"😴 Sleeping",          notif: false },
    { id:"focused",   label:"🎯 Focused",           notif: false },
    { id:"custom",    label:"✏️ Custom",            notif: true  },
  ];

  async function saveStatus() {
    setStatusSaving(true);
    await update(ref(db, `users/${user.uid}`), {
      status: { preset: statusPreset, custom: customStatus.trim(), notif: STATUS_PRESETS.find(s=>s.id===statusPreset)?.notif ?? true },
      mutedUids,
    });
    onUserDataChange({ ...userData, status: { preset: statusPreset, custom: customStatus.trim() }, mutedUids });
    setStatusMsg("Saved!"); setStatusSaving(false);
    setTimeout(() => setStatusMsg(""), 2000);
  }

  async function unmuteUser(uid: string) {
    const newMuted = mutedUids.filter(id => id !== uid);
    setMutedUids(newMuted);
    await update(ref(db, `users/${user.uid}`), { mutedUids: newMuted });
    onUserDataChange({ ...userData, mutedUids: newMuted });
  }

  const changesLeft = userData?.usernameChangesLeft ?? 3;
  const displayName = userData?.username || user.displayName?.split(" ")[0] || "Player";
  const photoSrc = userData?.photoURL || user.photoURL || null;
  const acc = userData?.totalQuestions > 0
    ? Math.round((userData.totalCorrect / userData.totalQuestions) * 100) : null;

  useEffect(() => {
    if (tab !== "friends") return;
    // Load friends
    // Firebase may return friendIds as object or array
    const rawIds = userData?.friendIds || [];
    const ids: string[] = Array.isArray(rawIds) ? rawIds : Object.values(rawIds);
    setLoadingFriends(true);
    if (ids.length) {
      Promise.all(ids.map((id: string) => get(ref(db, `users/${id}`)).then(s => s.exists() ? { uid: id, ...s.val() } : null)))
        .then(results => { setFriendProfiles(results.filter(Boolean) as any[]); setLoadingFriends(false); });
    } else {
      setFriendProfiles([]); setLoadingFriends(false);
    }
    // Load incoming requests
    setLoadingRequests(true);
    get(ref(db, `friendRequests/${user.uid}`)).then(snap => {
      if (!snap.exists()) { setIncomingRequests([]); setLoadingRequests(false); return; }
      const reqs = Object.entries(snap.val()).map(([fromUid, data]: [string, any]) => ({ fromUid, ...data }));
      setIncomingRequests(reqs);
      setLoadingRequests(false);
    });
  }, [tab, userData?.friendIds]);

  async function saveProfile() {
    setSaving(true); setSaveMsg(""); setUsernameError(""); setPhotoError("");
    const trimmed = newUsername.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 15 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameError("2–15 chars, letters/numbers/underscores only");
      setSaving(false); return;
    }
    if (trimmed !== userData?.username) {
      if (changesLeft <= 0) { setUsernameError("No changes left"); setSaving(false); return; }
      const taken = await isUsernameTaken(trimmed, user.uid);
      if (taken) { setUsernameError("That username is taken"); setSaving(false); return; }
      await claimUsername(user.uid, trimmed, userData?.username);
    }
    const updates: any = {
      username: trimmed,
      displayName: trimmed,
      photoURL: newPhotoURL || user.photoURL || null,
    };
    if (trimmed !== userData?.username) {
      updates.usernameChangesLeft = changesLeft - 1;
    }
    await update(ref(db, `users/${user.uid}`), updates);
    const updated = { ...userData, ...updates };
    onUserDataChange(updated);
    setSaveMsg("Saved!");
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 2000);
  }

  async function sendFriendRequest() {
    setFriendError(""); setFriendMsg("");
    const input = friendInput.trim();
    if (!input) return;

    let targetUid: string | null = null;
    const snapDirect = await get(ref(db, `users/${input}`));
    if (snapDirect.exists()) {
      targetUid = input;
    } else {
      const snapUN = await get(ref(db, `usernames/${input.toLowerCase()}`));
      if (snapUN.exists()) targetUid = snapUN.val();
    }

    if (!targetUid) { setFriendError("User not found"); return; }
    if (targetUid === user.uid) { setFriendError("That's you!"); return; }
    const existing: string[] = userData?.friendIds || [];
    if (existing.includes(targetUid)) { setFriendError("Already friends"); return; }

    // Check if request already sent
    const alreadySent = await get(ref(db, `friendRequests/${targetUid}/${user.uid}`));
    if (alreadySent.exists()) { setFriendError("Request already sent"); return; }

    // Check if they already sent us a request — auto-accept
    const theyRequested = await get(ref(db, `friendRequests/${user.uid}/${targetUid}`));
    if (theyRequested.exists()) {
      await acceptFriendRequest(targetUid, theyRequested.val().fromUsername);
      return;
    }

    await set(ref(db, `friendRequests/${targetUid}/${user.uid}`), {
      fromUid: user.uid,
      fromUsername: userData?.username || "Unknown",
      fromPhotoURL: userData?.photoURL || user.photoURL || null,
      sentAt: Date.now(),
    });
    // Push notification
    try {
      const tokenSnap = await get(ref(db, `users/${targetUid}/fcmToken`));
      if (tokenSnap.exists()) {
        await fetch("/api/send-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenSnap.val(), title: "👥 Friend Request", body: `${userData?.username || "Someone"} wants to be friends!`, url: "/" }),
        });
      }
    } catch {}
    setFriendMsg("Request sent!");
    setFriendInput("");
    setTimeout(() => setFriendMsg(""), 2500);
  }

  async function acceptFriendRequest(fromUid: string, fromUsername: string) {
    const myFriends = [...(userData?.friendIds || []), fromUid];
    // Add each other mutually
    const theirSnap = await get(ref(db, `users/${fromUid}`));
    const theirFriends = theirSnap.exists() ? [...(theirSnap.val().friendIds || []), user.uid] : [user.uid];
    const updates: any = {};
    updates[`users/${user.uid}/friendIds`] = myFriends;
    updates[`users/${fromUid}/friendIds`] = theirFriends;
    updates[`friendRequests/${user.uid}/${fromUid}`] = null;
    await update(ref(db), updates);
    onUserDataChange({ ...userData, friendIds: myFriends });
    setIncomingRequests(r => r.filter(req => req.fromUid !== fromUid));
    setFriendMsg(`You and ${fromUsername} are now friends!`);
    setTimeout(() => setFriendMsg(""), 2500);
  }

  async function declineFriendRequest(fromUid: string) {
    await set(ref(db, `friendRequests/${user.uid}/${fromUid}`), null);
    setIncomingRequests(r => r.filter(req => req.fromUid !== fromUid));
  }

  async function removeFriend(uid: string) {
    const newFriends = (userData?.friendIds || []).filter((id: string) => id !== uid);
    await update(ref(db, `users/${user.uid}`), { friendIds: newFriends });
    onUserDataChange({ ...userData, friendIds: newFriends });
    setFriendProfiles(fp => fp.filter(f => f.uid !== uid));
  }

  const pendingRequestCount = incomingRequests.length;

  const TabBtn = ({ id, label, badge }: { id: typeof tab; label: string; badge?: number }) => (
    <button onClick={() => setTab(id)} style={{
      flex:1, background: tab === id ? "rgba(245,158,11,0.15)" : "transparent",
      border:"none", borderBottom: `2px solid ${tab === id ? "#f59e0b" : "transparent"}`,
      color: tab === id ? "#f59e0b" : "#6b7280", fontSize:13, fontWeight:700,
      padding:"10px 0", cursor:"pointer", transition:"all 0.15s", position:"relative",
    }}>
      {label}
      {badge && badge > 0 ? (
        <span style={{ marginLeft:5, background:"#ef4444", borderRadius:"99px",
          fontSize:10, fontWeight:900, color:"#fff", padding:"1px 5px", verticalAlign:"middle" }}>
          {badge}
        </span>
      ) : null}
    </button>
  );

  return (
    <>
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:300,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#1a1a2e", border:"1px solid #2d2d44",
        borderRadius:20, padding:"0", width:"100%", maxWidth:400, color:"#fff", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"24px 24px 16px", display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ position:"relative", flexShrink:0 }}>
            {photoSrc ? (
              <img src={photoSrc} alt="" width={52} height={52}
                style={{ borderRadius:"50%", border:"3px solid #f59e0b", display:"block" }} />
            ) : (
              <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(245,158,11,0.2)",
                border:"3px solid #f59e0b", display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:22, fontWeight:900, color:"#f59e0b" }}>
                {displayName[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:"1.1rem", fontWeight:900, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:4 }}>
              {displayName}
              {userData?.badge === "star"  && <span title="Loyal Player" style={{ fontSize:16 }}>⭐</span>}
              {userData?.badge === "check" && <span title="Verified"     style={{ fontSize:14, color:"#3b82f6", fontWeight:900 }}>✓</span>}
              {userData?.badge === "crown" && <span title="Champion"     style={{ fontSize:16 }}>👑</span>}
            </div>
            <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>
              Friend ID: <span style={{ color:"#9ca3af", fontFamily:"monospace", fontSize:11 }}>{user.uid.slice(0,12)}…</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"none",
            color:"#6b7280", fontSize:20, cursor:"pointer", lineHeight:1, padding:"4px 8px" }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid #2d2d44" }}>
          <TabBtn id="stats" label="Stats" />
          <TabBtn id="edit" label="Edit Profile" />
          <TabBtn id="status" label="Status" />
          <TabBtn id="friends" label="Friends" badge={incomingRequests.length} />
        </div>

        <div style={{ padding:"20px 24px 24px", maxHeight:420, overflowY:"auto" }}>

          {/* STATS TAB */}
          {tab === "stats" && (
            !userData || userData.gamesPlayed === 0 ? (
              <div style={{ textAlign:"center", color:"#6b7280", padding:"20px 0", lineHeight:1.7 }}>
                No games played yet.<br />
                <span style={{ color:"#f59e0b" }}>Start playing to track your stats!</span>
              </div>
            ) : (<>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                {[
                  ["Games", userData.gamesPlayed, "#e5e7eb"],
                  ["Best Score", userData.bestScore, "#f59e0b"],
                  ["Best Streak", `${userData.bestStreak}🔥`, "#ef4444"],
                  ["Accuracy", acc !== null ? `${acc}%` : "—", "#10b981"],
                ].map(([label, val, color]) => (
                  <div key={label as string} style={{ background:"#0f0f1a", borderRadius:12,
                    padding:"14px 12px", textAlign:"center", border:"1px solid #2d2d44" }}>
                    <div style={{ fontSize:22, fontWeight:900, color: color as string }}>{val}</div>
                    <div style={{ fontSize:10, color:"#6b7280", marginTop:4,
                      textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</div>
                  </div>
                ))}
              </div>
              {userData.categoryBests && Object.keys(userData.categoryBests).length > 0 && (<>
                <div style={{ fontSize:11, color:"#f59e0b", textTransform:"uppercase",
                  letterSpacing:"0.1em", fontWeight:700, marginBottom:10 }}>Category bests</div>
                {Object.entries(userData.categoryBests)
                  .sort(([,a],[,b]) => (b as number) - (a as number))
                  .map(([cat, score]) => (
                    <div key={cat} style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"center", padding:"7px 0", borderBottom:"1px solid #2d2d44" }}>
                      <span style={{ color:"#d1d5db", fontSize:13 }}>
                        {CATEGORY_MAP[cat]?.emoji} {CATEGORY_MAP[cat]?.label ?? cat}
                      </span>
                      <span style={{ color:"#f59e0b", fontWeight:800 }}>{score as number}</span>
                    </div>
                  ))}
              </>)}
              <div style={{ marginTop:12, fontSize:11, color:"#4b5563", textAlign:"right" }}>
                Last played: {userData.lastPlayed}
              </div>
            </>)
          )}

          {/* EDIT TAB */}
          {tab === "edit" && (<>
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase",
                letterSpacing:"0.05em", marginBottom:8 }}>
                Username
                <span style={{ marginLeft:8, color: changesLeft > 0 ? "#f59e0b" : "#ef4444", fontWeight:700 }}>
                  {changesLeft} change{changesLeft !== 1 ? "s" : ""} left
                </span>
              </div>
              <input
                value={newUsername}
                maxLength={15}
                onChange={e => { setNewUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "")); setUsernameError(""); }}
                style={{ width:"100%", background:"#0f0f1a", border:`1px solid ${usernameError ? "#ef4444" : "#2d2d44"}`,
                  borderRadius:10, color: changesLeft <= 0 ? "#4b5563" : "#fff",
                  fontSize:15, padding:"11px 14px", outline:"none", boxSizing:"border-box" }}
              />
              {usernameError && <div style={{ color:"#ef4444", fontSize:12, marginTop:4 }}>{usernameError}</div>}
              {changesLeft <= 0 && <div style={{ color:"#ef4444", fontSize:12, marginTop:4 }}>No username changes remaining.</div>}
            </div>

            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase",
                letterSpacing:"0.05em", marginBottom:8 }}>Profile picture</div>

              {/* Hidden file input — accept triggers iOS native sheet: Photo Library / Take Photo / Files */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display:"none" }}
              />

              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                {/* Preview */}
                <div style={{ flexShrink:0 }}>
                  {newPhotoURL ? (
                    <img src={newPhotoURL} alt=""
                      style={{ width:64, height:64, borderRadius:"50%", border:"2px solid #f59e0b", display:"block", objectFit:"cover" }} />
                  ) : (
                    <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(255,255,255,0.06)",
                      border:"2px dashed #2d2d44", display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:24, color:"#4b5563" }}>
                      👤
                    </div>
                  )}
                </div>

                <div style={{ flex:1 }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoUploading}
                    style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid #2d2d44",
                      borderRadius:10, color: photoUploading ? "#6b7280" : "#e5e7eb",
                      fontSize:14, fontWeight:600, padding:"11px 14px", cursor: photoUploading ? "default" : "pointer",
                      textAlign:"left" as const }}
                  >
                    {photoUploading ? "Loading…" : newPhotoURL ? "Change photo" : "Choose photo"}
                  </button>
                  {newPhotoURL && (
                    <button
                      onClick={() => { setNewPhotoURL(""); setPhotoError(""); }}
                      style={{ marginTop:6, background:"transparent", border:"none",
                        color:"#ef4444", fontSize:12, cursor:"pointer", padding:0 }}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>

              {photoError && <div style={{ color:"#ef4444", fontSize:12, marginTop:8 }}>{photoError}</div>}
              <div style={{ fontSize:11, color:"#4b5563", marginTop:6 }}>JPG, PNG, GIF · max 2 MB</div>
            </div>

            <button onClick={saveProfile} disabled={saving} style={{
              width:"100%", background:"linear-gradient(135deg, #f59e0b, #ef4444)",
              border:"none", borderRadius:10, color:"#fff", fontSize:"0.95rem",
              fontWeight:800, padding:"13px", cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
            {saveMsg && <div style={{ color:"#10b981", textAlign:"center", marginTop:8, fontWeight:700 }}>{saveMsg}</div>}
          </>)}

          {/* STATUS TAB */}
          {tab === "status" && (<>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Status</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {STATUS_PRESETS.map(s => (
                  <button key={s.id} onClick={() => setStatusPreset(s.id)} style={{
                    background: statusPreset===s.id ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${statusPreset===s.id ? "#f59e0b" : "#2d2d44"}`,
                    borderRadius:10, color: statusPreset===s.id ? "#f59e0b" : "#9ca3af",
                    fontSize:14, fontWeight:600, padding:"11px 16px", cursor:"pointer",
                    textAlign:"left" as const, display:"flex", justifyContent:"space-between", alignItems:"center",
                  }}>
                    <span>{s.label}</span>
                    <span style={{ fontSize:11, color: s.notif ? "#10b981" : "#ef4444" }}>
                      {s.notif ? "notifications on" : "notifications off"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {statusPreset === "custom" && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Custom status text</div>
                <input value={customStatus} onChange={e => setCustomStatus(e.target.value.slice(0,40))}
                  placeholder="e.g. In a duel, brb" maxLength={40}
                  style={{ width:"100%", background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:10, color:"#fff", fontSize:14, padding:"10px 14px", outline:"none", boxSizing:"border-box" as const }} />
                <div style={{ fontSize:11, color:"#4b5563", marginTop:4, textAlign:"right" as const }}>{customStatus.length}/40</div>
              </div>
            )}

            <button onClick={saveStatus} disabled={statusSaving} style={{
              width:"100%", background:"linear-gradient(135deg,#f59e0b,#ef4444)", border:"none",
              borderRadius:10, color:"#fff", fontWeight:800, padding:"12px", cursor:"pointer", marginBottom:16,
            }}>{statusSaving ? "Saving…" : "Save Status"}</button>
            {statusMsg && <div style={{ color:"#10b981", textAlign:"center", marginBottom:12, fontWeight:700 }}>{statusMsg}</div>}

            {/* Muted users */}
            <div style={{ borderTop:"1px solid #2d2d44", paddingTop:14 }}>
              <div style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>
                Muted users ({mutedUids.length})
              </div>
              {mutedUids.length === 0 ? (
                <div style={{ color:"#4b5563", fontSize:13 }}>No muted users</div>
              ) : mutedUids.map(uid => {
                const friend = friendProfiles.find(f => f.uid === uid);
                return (
                  <div key={uid} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #2d2d44" }}>
                    <span style={{ color:"#d1d5db", fontSize:13 }}>{friend?.username || uid.slice(0,12)+"…"}</span>
                    <button onClick={() => unmuteUser(uid)} style={{ background:"rgba(16,185,129,0.15)", border:"1px solid rgba(16,185,129,0.4)", borderRadius:8, color:"#10b981", fontSize:12, fontWeight:700, padding:"4px 10px", cursor:"pointer" }}>
                      Unmute
                    </button>
                  </div>
                );
              })}
            </div>
          </>)}

          {/* FRIENDS TAB */}
          {tab === "friends" && (<>

            {/* Incoming requests */}
            {incomingRequests.length > 0 && (
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:11, color:"#10b981", textTransform:"uppercase",
                  letterSpacing:"0.05em", fontWeight:700, marginBottom:10 }}>
                  Pending requests ({incomingRequests.length})
                </div>
                {incomingRequests.map(req => (
                  <div key={req.fromUid} style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"10px 12px", background:"rgba(16,185,129,0.06)",
                    border:"1px solid rgba(16,185,129,0.2)", borderRadius:10, marginBottom:8 }}>
                    {req.fromPhotoURL ? (
                      <img src={req.fromPhotoURL} alt="" width={36} height={36}
                        style={{ borderRadius:"50%", border:"2px solid #2d2d44", flexShrink:0 }} />
                    ) : (
                      <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(16,185,129,0.2)",
                        border:"2px solid #2d2d44", display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:14, fontWeight:900, color:"#10b981", flexShrink:0 }}>
                        {(req.fromUsername || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14 }}>{req.fromUsername}</div>
                      <div style={{ fontSize:11, color:"#6b7280" }}>wants to be friends</div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={() => acceptFriendRequest(req.fromUid, req.fromUsername)} style={{
                        background:"rgba(16,185,129,0.2)", border:"1px solid rgba(16,185,129,0.5)",
                        borderRadius:8, color:"#10b981", fontSize:12, fontWeight:700,
                        padding:"6px 12px", cursor:"pointer" }}>Accept</button>
                      <button onClick={() => declineFriendRequest(req.fromUid)} style={{
                        background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                        borderRadius:8, color:"#ef4444", fontSize:12, fontWeight:700,
                        padding:"6px 12px", cursor:"pointer" }}>Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add friend */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase",
                letterSpacing:"0.05em", marginBottom:8 }}>Add by username or Friend ID</div>
              <div style={{ display:"flex", gap:8 }}>
                <input
                  value={friendInput}
                  placeholder="username or Friend ID"
                  onChange={e => { setFriendInput(e.target.value); setFriendError(""); setFriendMsg(""); }}
                  onKeyDown={e => e.key === "Enter" && sendFriendRequest()}
                  style={{ flex:1, background:"#0f0f1a", border:"1px solid #2d2d44",
                    borderRadius:10, color:"#fff", fontSize:14, padding:"10px 12px",
                    outline:"none", boxSizing:"border-box" as const }}
                />
                <button onClick={sendFriendRequest} style={{
                  background:"rgba(245,158,11,0.15)", border:"1px solid rgba(245,158,11,0.4)",
                  borderRadius:10, color:"#f59e0b", fontWeight:800, fontSize:14,
                  padding:"10px 14px", cursor:"pointer", flexShrink:0,
                }}>Send</button>
              </div>
              {friendError && <div style={{ color:"#ef4444", fontSize:12, marginTop:6 }}>{friendError}</div>}
              {friendMsg && <div style={{ color:"#10b981", fontSize:12, marginTop:6, fontWeight:700 }}>{friendMsg}</div>}
              <div style={{ fontSize:11, color:"#4b5563", marginTop:6 }}>
                Your Friend ID: <span style={{ color:"#9ca3af", fontFamily:"monospace", fontSize:10 }}>{user.uid}</span>
              </div>
            </div>

            {/* Friends list */}
            <div style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase",
              letterSpacing:"0.05em", marginBottom:10 }}>
              Friends ({(userData?.friendIds || []).length})
            </div>

            {loadingFriends ? (
              <div style={{ color:"#6b7280", fontSize:13, textAlign:"center", padding:"12px 0" }}>Loading…</div>
            ) : friendProfiles.length === 0 ? (
              <div style={{ color:"#4b5563", fontSize:13, textAlign:"center", padding:"12px 0" }}>
                No friends yet — send a request above!
              </div>
            ) : friendProfiles.map(fp => (
              <div key={fp.uid} onClick={() => setChatFriend(fp)} style={{ display:"flex", alignItems:"center", gap:10,
                padding:"10px 0", borderBottom:"1px solid #2d2d44", cursor:"pointer" }}>
                {fp.photoURL ? (
                  <img src={fp.photoURL} alt="" width={36} height={36}
                    style={{ borderRadius:"50%", border:"2px solid #2d2d44", flexShrink:0 }} />
                ) : (
                  <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(245,158,11,0.2)",
                    border:"2px solid #2d2d44", display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:14, fontWeight:900, color:"#f59e0b", flexShrink:0 }}>
                    {(fp.username || "?")[0].toUpperCase()}
                  </div>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {fp.username}
                    {fp.badge === "star"  && <span style={{ fontSize:12, marginLeft:3 }}>⭐</span>}
                    {fp.badge === "check" && <span style={{ fontSize:11, color:"#3b82f6", fontWeight:900, marginLeft:3 }}>✓</span>}
                    {fp.badge === "crown" && <span style={{ fontSize:12, marginLeft:3 }}>👑</span>}
                  </div>
                  <div style={{ fontSize:11, color:"#6b7280" }}>
                    {fp.status?.preset === "dnd"      && <span style={{ color:"#ef4444" }}>⛔ Do Not Disturb · </span>}
                    {fp.status?.preset === "sleeping"  && <span style={{ color:"#6366f1" }}>😴 Sleeping · </span>}
                    {fp.status?.preset === "focused"   && <span style={{ color:"#f59e0b" }}>🎯 Focused · </span>}
                    {fp.status?.preset === "custom" && fp.status?.custom && <span style={{ color:"#10b981" }}>✏️ {fp.status.custom} · </span>}
                    Best: {fp.bestScore ?? 0}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <button onClick={() => setChatFriend(fp)} style={{
                    background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.4)",
                    borderRadius:8, color:"#a5b4fc", fontSize:11, fontWeight:700, padding:"5px 10px",
                    cursor:"pointer",
                  }}>💬</button>
                  <button onClick={async () => {
                    const isMuted = mutedUids.includes(fp.uid);
                    const newMuted = isMuted ? mutedUids.filter(id=>id!==fp.uid) : [...mutedUids, fp.uid];
                    setMutedUids(newMuted);
                    await update(ref(db, `users/${user.uid}`), { mutedUids: newMuted });
                    onUserDataChange({ ...userData, mutedUids: newMuted });
                  }} style={{
                    background: mutedUids.includes(fp.uid) ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)",
                    border:`1px solid ${mutedUids.includes(fp.uid) ? "rgba(245,158,11,0.4)" : "#2d2d44"}`,
                    borderRadius:8, color: mutedUids.includes(fp.uid) ? "#f59e0b" : "#6b7280", fontSize:11, padding:"5px 10px",
                    cursor:"pointer",
                  }}>{mutedUids.includes(fp.uid) ? "🔕" : "🔔"}</button>
                  <button onClick={e => { e.stopPropagation(); removeFriend(fp.uid); }} style={{
                    background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                    borderRadius:8, color:"#ef4444", fontSize:11, padding:"5px 10px",
                    cursor:"pointer",
                  }}>✕</button>
                </div>
              </div>
            ))}
          </>)}
        </div>
      </div>
    </div>
    {chatFriend && user && (
      <ChatModal
        myUid={user.uid}
        myName={userData?.username || user.displayName?.split(" ")[0] || "Me"}
        friend={chatFriend}
        onClose={() => setChatFriend(null)}
      />
    )}
    </>
  );
}

// ── Chat Modal ────────────────────────────────────────────────────────────────
function ChatModal({ myUid, myName, friend, onClose }: { myUid:string; myName:string; friend:any; onClose:()=>void }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [reportedKey, setReportedKey] = useState<string|null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatKey = [myUid, friend.uid].sort().join("_");

  async function reportMessage(m: any, msgKey: string) {
    if (reportedKey === msgKey) return;
    await set(ref(db, `chatReports/${Date.now()}_${myUid.slice(0,6)}`), {
      chatKey,
      msgKey,
      senderUid: m.senderUid,
      senderName: m.senderName,
      reporterUid: myUid,
      reporterName: myName,
      text: m.text,
      ts: m.ts,
      reportedAt: Date.now(),
      reportedAtStr: new Date().toLocaleString(),
    });
    setReportedKey(msgKey);
    setTimeout(() => setReportedKey(null), 3000);
  }

  useEffect(() => {
    const msgRef = ref(db, `chats/${chatKey}/messages`);
    let prevCount = 0;
    const unsub = onValue(msgRef, snap => {
      if (!snap.exists()) { setMessages([]); prevCount = 0; return; }
      const list = (Object.values(snap.val() as any) as any[]).sort((a,b) => a.ts-b.ts);
      // Fire browser notif if new message from other person arrived while modal open
      if (list.length > prevCount && prevCount > 0) {
        const newest = list[list.length - 1];
        if (newest.senderUid !== myUid && "Notification" in window && Notification.permission === "granted") {
          try { new Notification(`💬 ${newest.senderName}`, { body: newest.text, icon: "/favicon.ico" }); } catch {}
        }
      }
      prevCount = list.length;
      setMessages(list);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:"smooth" }), 50);
    });
    // Mark as read
    set(ref(db, `chats/${chatKey}/unread/${myUid}`), 0);
    return () => off(msgRef);
  }, [chatKey, myUid]);

  async function send() {
    const msg = text.trim();
    if (!msg) return;
    setText("");
    const msgKey = Date.now().toString();
    await set(ref(db, `chats/${chatKey}/messages/${msgKey}`), {
      senderUid: myUid, senderName: myName, text: msg, ts: Date.now(),
    });
    // Bump unread for the other person
    const theirUnread = (await get(ref(db, `chats/${chatKey}/unread/${friend.uid}`))).val() || 0;
    await set(ref(db, `chats/${chatKey}/unread/${friend.uid}`), theirUnread + 1);
    // Send push notification
    try {
      const tokenSnap = await get(ref(db, `users/${friend.uid}/fcmToken`));
      const mutedSnap = await get(ref(db, `users/${friend.uid}/mutedUids`));
      const muted: string[] = mutedSnap.exists() ? Object.values(mutedSnap.val()) : [];
      const statusSnap = await get(ref(db, `users/${friend.uid}/status`));
      const theirStatus = statusSnap.exists() ? statusSnap.val() : null;
      const notifAllowed = !theirStatus || theirStatus.notif !== false;
      if (tokenSnap.exists() && !muted.includes(myUid) && notifAllowed) {
        await fetch("/api/send-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenSnap.val(), title: `💬 ${myName}`, body: msg, url: "/" }),
        });
      }
    } catch {}
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:20, width:"100%", maxWidth:420, height:"min(600px,85vh)", display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #2d2d44", display:"flex", alignItems:"center", gap:10 }}>
          {friend.photoURL ? (
            <img src={friend.photoURL} alt="" width={36} height={36} style={{ borderRadius:"50%", border:"2px solid #6366f1" }} />
          ) : (
            <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(99,102,241,0.2)", border:"2px solid #6366f1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900, color:"#a5b4fc" }}>
              {(friend.username||"?")[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, color:"#fff" }}>{friend.username}</div>
            {friend.status?.preset && friend.status.preset !== "online" && (
              <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>
                {friend.status.preset === "dnd"     && "⛔ Do Not Disturb"}
                {friend.status.preset === "sleeping" && "😴 Sleeping"}
                {friend.status.preset === "focused"  && "🎯 Focused"}
                {friend.status.preset === "custom"   && friend.status.custom && `✏️ ${friend.status.custom}`}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:"#6b7280", fontSize:20, cursor:"pointer" }}>×</button>
        </div>
        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
          {messages.length === 0 && (
            <div style={{ color:"#4b5563", fontSize:13, textAlign:"center", marginTop:40 }}>No messages yet. Say hi!</div>
          )}
          {messages.map((m:any, i) => {
            const isMe = m.senderUid === myUid;
            const msgKey = String(m.ts) + "_" + i;
            const justReported = reportedKey === msgKey;
            return (
              <div key={i} style={{ display:"flex", justifyContent: isMe?"flex-end":"flex-start", alignItems:"flex-end", gap:4 }}>
                {!isMe && (
                  <button onClick={() => reportMessage(m, msgKey)} title="Report message"
                    style={{ background:"transparent", border:"none", color: justReported?"#10b981":"#2d2d44", fontSize:11, cursor:"pointer", padding:"0 2px", flexShrink:0, lineHeight:1, alignSelf:"center" }}>
                    {justReported ? "✓" : "🚩"}
                  </button>
                )}
                <div style={{ maxWidth:"75%", background: isMe?"rgba(245,158,11,0.2)":"rgba(255,255,255,0.06)", border:`1px solid ${isMe?"rgba(245,158,11,0.4)":"#2d2d44"}`, borderRadius: isMe?"14px 14px 2px 14px":"14px 14px 14px 2px", padding:"8px 12px" }}>
                  <div style={{ color:"#e5e7eb", fontSize:14, lineHeight:1.5 }}>{m.text}</div>
                  <div style={{ color:"#4b5563", fontSize:10, marginTop:2, textAlign:"right" }}>
                    {new Date(m.ts).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        {/* Input */}
        <div style={{ padding:"10px 14px", borderTop:"1px solid #2d2d44", display:"flex", gap:8 }}>
          <input
            value={text} onChange={e=>setText(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&send()}
            placeholder="Message…"
            style={{ flex:1, background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:10, color:"#fff", fontSize:14, padding:"10px 14px", outline:"none" }}
          />
          <button onClick={send} style={{ background:"linear-gradient(135deg,#6366f1,#a855f7)", border:"none", borderRadius:10, color:"#fff", fontWeight:800, fontSize:14, padding:"10px 16px", cursor:"pointer" }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Language Modal ───────────────────────────────────────────────────────────

const LANGUAGES = [
  { code:"en",    label:"English",    flag:"🇺🇸", native:"English" },
  { code:"ko",    label:"Korean",     flag:"🇰🇷", native:"한국어" },
  { code:"es",    label:"Spanish",    flag:"🇪🇸", native:"Español" },
  { code:"fr",    label:"French",     flag:"🇫🇷", native:"Français" },
  { code:"pt",    label:"Portuguese", flag:"🇧🇷", native:"Português" },
  { code:"zh-CN", label:"Chinese",    flag:"🇨🇳", native:"中文" },
  { code:"ja",    label:"Japanese",   flag:"🇯🇵", native:"日本語" },
  { code:"ar",    label:"Arabic",     flag:"🇸🇦", native:"العربية" },
  { code:"hi",    label:"Hindi",      flag:"🇮🇳", native:"हिन्दी" },
  { code:"de",    label:"German",     flag:"🇩🇪", native:"Deutsch" },
  { code:"it",    label:"Italian",    flag:"🇮🇹", native:"Italiano" },
  { code:"ru",    label:"Russian",    flag:"🇷🇺", native:"Русский" },
  { code:"vi",    label:"Vietnamese", flag:"🇻🇳", native:"Tiếng Việt" },
  { code:"tl",    label:"Filipino",   flag:"🇵🇭", native:"Filipino" },
];

let _translateInterval: any = null;

function initGoogleTranslate(langCode: string) {
  // Set cookie
  document.cookie = `googtrans=/en/${langCode}; path=/`;
  document.cookie = `googtrans=/en/${langCode}; path=/; domain=${window.location.hostname}`;

  // Inject hidden widget container
  if (!document.getElementById("google_translate_element")) {
    const el = document.createElement("div");
    el.id = "google_translate_element";
    el.style.cssText = "position:fixed;bottom:-9999px;left:-9999px;visibility:hidden;";
    document.body.appendChild(el);
  }

  const doTranslate = () => {
    const select = document.querySelector(".goog-te-combo") as HTMLSelectElement;
    if (select && select.value !== langCode) {
      select.value = langCode;
      select.dispatchEvent(new Event("change"));
    }
  };

  if ((window as any).google?.translate?.TranslateElement) {
    doTranslate();
  } else {
    (window as any).googleTranslateElementInit = () => {
      new (window as any).google.translate.TranslateElement(
        { pageLanguage: "en", autoDisplay: false },
        "google_translate_element"
      );
      setTimeout(doTranslate, 600);
    };
    if (!document.querySelector('script[src*="translate.google.com"]')) {
      const script = document.createElement("script");
      script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      document.body.appendChild(script);
    }
  }

  // Keep retranslating after React re-renders using MutationObserver
  if (_translateInterval) clearInterval(_translateInterval);
  _translateInterval = setInterval(doTranslate, 800);
}

function applyGoogleTranslate(langCode: string) {
  if (langCode === "en") {
    if (_translateInterval) { clearInterval(_translateInterval); _translateInterval = null; }
    document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
    window.location.reload();
    return;
  }
  initGoogleTranslate(langCode);
}

function triggerTranslate(_langCode: string) { /* kept for compat */ }

function LangModal({ currentLang, onSelect, onClose }: {
  currentLang: string; onSelect: (lang: string) => void; onClose: () => void;
}) {
  function choose(code: string) {
    applyGoogleTranslate(code);
    onSelect(code);
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:400,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#1a1a2e", border:"1px solid #2d2d44",
        borderRadius:20, width:"100%", maxWidth:400, maxHeight:"85vh", display:"flex", flexDirection:"column",
        overflow:"hidden", color:"#fff" }}>
        {/* Header */}
        <div style={{ padding:"18px 24px 14px", borderBottom:"1px solid #2d2d44", display:"flex",
          alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div style={{ fontSize:"1.1rem", fontWeight:900 }}>🌐 Language</div>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:"#6b7280", fontSize:20, cursor:"pointer" }}>×</button>
        </div>
        {/* List */}
        <div style={{ overflowY:"auto", padding:"12px 16px" }}>
          {LANGUAGES.map(lang => (
            <button key={lang.code} onClick={() => choose(lang.code)} style={{
              width:"100%", display:"flex", alignItems:"center", gap:14,
              background: currentLang === lang.code ? "rgba(245,158,11,0.1)" : "transparent",
              border:`1px solid ${currentLang === lang.code ? "rgba(245,158,11,0.4)" : "transparent"}`,
              borderRadius:10, padding:"11px 14px", cursor:"pointer", marginBottom:4, textAlign:"left" as const,
            }}>
              <span style={{ fontSize:24, flexShrink:0 }}>{lang.flag}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:14, color: currentLang === lang.code ? "#f59e0b" : "#e5e7eb" }}>
                  {lang.native}
                </div>
                <div style={{ fontSize:11, color:"#6b7280" }}>{lang.label}</div>
              </div>
              {currentLang === lang.code && <span style={{ color:"#f59e0b", fontSize:16 }}>✓</span>}
            </button>
          ))}
        </div>
        <div style={{ padding:"10px 20px 16px", fontSize:11, color:"#4b5563", textAlign:"center" as const, flexShrink:0 }}>
          Powered by Google Translate
        </div>
      </div>
    </div>
  );
}

// ── Report Modal ─────────────────────────────────────────────────────────────

function ReportModal({ target, reporter, onClose }: { target: any; reporter: { uid: string; name: string }; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  const REASONS = ["Suspicious/impossible score", "Cheating", "Inappropriate name", "Other"];

  async function submit() {
    if (!reason) return;
    setSaving(true);
    try {
      const reportKey = `${Date.now()}_${reporter.uid.slice(0,6)}`;
      await set(ref(db, `reports/${reportKey}`), {
        reportedName: target.name,
        reportedUid: target.uid || null,
        score: target.score,
        category: target.category,
        roundSize: target.roundSize,
        timerDuration: target.timerDuration,
        reason,
        note: note.trim() || null,
        reporterUid: reporter.uid,
        reporterName: reporter.name,
        date: new Date().toLocaleString(),
        ts: Date.now(),
      });
      setSent(true);
    } catch {}
    setSaving(false);
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:20, padding:"28px 24px", width:"100%", maxWidth:380, color:"#fff" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:"1.1rem", fontWeight:900 }}>🚩 Report Score</div>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:"#6b7280", fontSize:20, cursor:"pointer" }}>×</button>
        </div>
        {sent ? (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:36, marginBottom:10 }}>✅</div>
            <div style={{ fontWeight:700, marginBottom:6 }}>Report submitted</div>
            <div style={{ color:"#6b7280", fontSize:13 }}>An admin will review this.</div>
            <button onClick={onClose} style={{ marginTop:16, background:"rgba(245,158,11,0.15)", border:"1px solid rgba(245,158,11,0.4)", borderRadius:10, color:"#f59e0b", fontWeight:700, padding:"10px 24px", cursor:"pointer" }}>Close</button>
          </div>
        ) : (<>
          <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:13 }}>
            <span style={{ color:"#e5e7eb", fontWeight:700 }}>{target.name}</span>
            <span style={{ color:"#f59e0b", fontWeight:800, marginLeft:10 }}>{target.score} pts</span>
            <div style={{ color:"#4b5563", fontSize:11, marginTop:2 }}>{target.category} · {target.roundSize}Q · {target.timerDuration === 0 ? "∞" : `${target.timerDuration}s`}</div>
          </div>
          <div style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Reason</div>
          {REASONS.map(r => (
            <button key={r} onClick={() => setReason(r)} style={{ display:"block", width:"100%", background: reason===r ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)", border:`1px solid ${reason===r?"#ef4444":"#2d2d44"}`, borderRadius:8, color: reason===r ? "#ef4444" : "#9ca3af", fontWeight:600, fontSize:13, padding:"9px 14px", cursor:"pointer", marginBottom:6, textAlign:"left" }}>
              {r}
            </button>
          ))}
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Additional notes (optional)" style={{ width:"100%", background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:8, color:"#fff", fontSize:13, padding:"9px 12px", outline:"none", boxSizing:"border-box", resize:"vertical", minHeight:60, marginTop:4, marginBottom:12 }} />
          <button onClick={submit} disabled={!reason||saving} style={{ width:"100%", background: reason ? "linear-gradient(135deg,#ef4444,#b91c1c)" : "#1a1a2e", border:"none", borderRadius:10, color: reason ? "#fff" : "#4b5563", fontWeight:800, fontSize:"0.95rem", padding:"12px", cursor: reason ? "pointer" : "default" }}>
            {saving ? "Submitting…" : "Submit Report"}
          </button>
        </>)}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
  const [userData, setUserData] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showUsernamePicker, setShowUsernamePicker] = useState(false);
  const [modal, setModal] = useState<"about"|"updates"|"profile"|null>(null);
  const [reportTarget, setReportTarget] = useState<any>(null);
  const [showLangModal, setShowLangModal] = useState(false);
  const [currentLang, setCurrentLang] = useState("en");
  const [isMobile, setIsMobile] = useState(false);

  const [category, setCategory] = useState("all");
  const [roundSize, setRoundSize] = useState(20);
  const [timerDuration, setTimerDuration] = useState(3);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerRef = useRef(false);
  const resultsRef = useRef({ score: 0, correct: 0, total: 0, bestStreak: 0, category: "all" });
  const gameStateRef = useRef({ streak: 0, bestStreak: 0, score: 0, correct: 0, total: 0, category: "all", timerDuration: 3 });

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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        const data = await loadUserData(u.uid);
        if (!data || !data.username) {
          setShowUsernamePicker(true);
        } else {
          setUserData(data);
          setName(data.username);
          try { localStorage.setItem("onetap_name", data.username); } catch {}
        }
        // Request push notification permission + get FCM token
        try {
          if ("Notification" in window && Notification.permission === "default") {
            await Notification.requestPermission();
          }
          if (Notification.permission === "granted" && "serviceWorker" in navigator) {
            const reg = await navigator.serviceWorker.ready;
            const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
            if (vapidKey) {
              const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
              const supported = await isSupported();
              if (supported) {
                const { initializeApp, getApps } = await import("firebase/app");
                const msgApp = getApps().find((a: any) => a.name === "msg") ?? (await import("firebase/app")).initializeApp({
                  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "placeholder",
                  authDomain: "onetap-trivia.firebaseapp.com",
                  databaseURL: "https://onetap-trivia-default-rtdb.firebaseio.com",
                  projectId: "onetap-trivia",
                  storageBucket: "onetap-trivia.firebasestorage.app",
                  messagingSenderId: "986046986694",
                  appId: "1:986046986694:web:2a4441bf46965ccbb3dac7",
                }, "msg");
                const messaging = getMessaging(msgApp);
                const fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
                if (fcmToken) await update(ref(db, `users/${u.uid}`), { fcmToken });
              }
            }
          }
        } catch {}
        // Log login
        const loginKey = Date.now().toString();
        try {
          await set(ref(db, `users/${u.uid}/loginHistory/${loginKey}`), {
            loginAt: new Date().toLocaleString(),
            ts: Date.now(),
          });
          // Store session start in sessionStorage to calc duration on logout
          sessionStorage.setItem("loginKey", loginKey);
          sessionStorage.setItem("loginUid", u.uid);
          sessionStorage.setItem("loginTs", Date.now().toString());
        } catch {}
      } else {
        // Log session duration on sign out
        try {
          const loginKey = sessionStorage.getItem("loginKey");
          const loginUid = sessionStorage.getItem("loginUid");
          const loginTs = sessionStorage.getItem("loginTs");
          if (loginKey && loginUid && loginTs) {
            const duration = Math.round((Date.now() - parseInt(loginTs)) / 60000);
            await update(ref(db, `users/${loginUid}/loginHistory/${loginKey}`), { durationMin: duration });
            sessionStorage.clear();
          }
        } catch {}
        setUserData(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setModal((e as CustomEvent).detail);
    window.addEventListener("onetap-modal", handler);
    return () => window.removeEventListener("onetap-modal", handler);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 700);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const lbRef = ref(db, "leaderboard");
    const unsub = onValue(lbRef, (snap) => {
      if (!snap.exists()) return;
      const entries: any[] = Object.values(snap.val());
      setGlobalLB(entries.sort((a, b) => b.score - a.score));
    });
    return () => off(lbRef);
  }, []);

  // Live incoming friend request count for badge
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const [duelChallenges, setDuelChallenges] = useState<any[]>([]);
  useEffect(() => {
    if (!user) { setPendingCount(0); setUnreadChats(0); setDuelChallenges([]); return; }
    const reqRef = ref(db, `friendRequests/${user.uid}`);
    const unsub1 = onValue(reqRef, snap => {
      setPendingCount(snap.exists() ? Object.keys(snap.val()).length : 0);
    });
    const chatRef = ref(db, "chats");
    const unsub2 = onValue(chatRef, snap => {
      if (!snap.exists()) { setUnreadChats(0); return; }
      let total = 0;
      Object.entries(snap.val()).forEach(([key, chat]: [string, any]) => {
        if (key.includes(user.uid) && chat.unread?.[user.uid]) {
          total += chat.unread[user.uid];
        }
      });
      setUnreadChats(total);
    });
    const chalRef = ref(db, `duelChallenges/${user.uid}`);
    const unsub3 = onValue(chalRef, snap => {
      if (!snap.exists()) { setDuelChallenges([]); return; }
      const list = Object.entries(snap.val()).map(([fromUid, d]: [string, any]) => ({ fromUid, ...d }));
      setDuelChallenges(list.filter((c: any) => Date.now() - c.sentAt < 300000));
    });
    return () => { off(reqRef); off(chatRef); off(chalRef); };
  }, [user?.uid]);

  // Register service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Restore language from cookie on mount
    const match = document.cookie.match(/googtrans=\/en\/([^;]+)/);
    if (match) {
      const lang = match[1];
      setCurrentLang(lang);
      initGoogleTranslate(lang);
    }
  }, []);

  // Browser notification helper
  function sendBrowserNotif(title: string, body: string, url = "/") {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, icon: "/favicon.ico", data: { url } });
    } catch {}
  }

  // Send push to another user via their FCM token
  async function sendPushToUser(targetUid: string, title: string, body: string, url = "/") {
    try {
      const snap = await get(ref(db, `users/${targetUid}/fcmToken`));
      if (!snap.exists()) return;
      const token = snap.val();
      await fetch("/api/send-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, title, body, url }),
      });
    } catch {}
  }

  // Announcement + maintenance mode
  const [announcement, setAnnouncement] = useState<{text:string;postedAt:string}|null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  useEffect(() => {
    get(ref(db, "config/announcement")).then(s => { if(s.exists()) setAnnouncement(s.val()); });
    get(ref(db, "config/maintenanceMode")).then(s => { if(s.exists()) setMaintenanceMode(s.val()); });
  }, []);

  // Custom questions from Firebase (admin-added)
  const [customQuestions, setCustomQuestions] = useState<Record<string,any[]>>({});
  useEffect(() => {
    get(ref(db, "customQuestions")).then(snap => {
      if (!snap.exists()) return;
      const data: Record<string,any[]> = {};
      Object.entries(snap.val()).forEach(([cat, qs]: [string, any]) => {
        data[cat] = Object.values(qs);
      });
      setCustomQuestions(data);
    });
  }, []);

  const endGame = useCallback(
    async (finalScore: number, finalBest: number, finalCorrect: number, finalTotal: number, finalCat: string, finalRounds: number, finalTimer: number) => {
      if (timerRef.current) clearInterval(timerRef.current);
      resultsRef.current = { score: finalScore, correct: finalCorrect, total: finalTotal, bestStreak: finalBest, category: finalCat };

      if (user && userData?.username) {
        const currentName = name || userData.username;
        await saveUserStats(user.uid, userData.username, currentName, {
          score: finalScore, bestStreak: finalBest,
          correct: finalCorrect, total: finalTotal, category: finalCat,
        });
        await saveToGlobalLB(user.uid, currentName, userData.username, finalScore, finalBest, finalCat, finalRounds, finalTimer);
      } else if (!user) {
        const lbName = name || "Anonymous";
        try {
          const now = new Date();
          const entryKey = `anon_${lbName.replace(/[.#$[\]]/g, "_")}_${finalCat}_${finalRounds}_${finalTimer}`;
          const lbRef = ref(db, `leaderboard/${entryKey}`);
          const snap = await get(lbRef);
          if (!snap.exists() || snap.val().score < finalScore) {
            await set(lbRef, {
              name: lbName, score: finalScore, streak: finalBest, category: finalCat,
              roundSize: finalRounds, timerDuration: finalTimer,
              date: now.toLocaleDateString("en-US", { weekday:"short", year:"numeric", month:"short", day:"numeric" }),
              ts: now.getTime(),
            });
          }
        } catch {}
      }

      setScore(finalScore);
      setCorrect(finalCorrect);
      setTotal(finalTotal);
      setBestStreak(finalBest);
      setScreen("result");
    },
    [name, user, userData]
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
      gameStateRef.current = { streak: newStreak, bestStreak: newBest, score: newScore, correct: newCorrect, total: newTotal, category: curCat, timerDuration: gameStateRef.current.timerDuration };
      setStreak(newStreak);
      setAnim(isCorrect ? "pop" : "shake");
      if (isCorrect && newStreak > 1) {
        setShowStreak(true);
        setTimeout(() => setShowStreak(false), 900);
      }
      setTimeout(() => {
        if (idx + 1 >= qs.length) {
          endGame(newScore, newBest, newCorrect, newTotal, curCat, qs.length, gameStateRef.current.timerDuration);
        } else {
          const next = qs[idx + 1];
          setQIndex(idx + 1);
          setOptions(shuffle([next.a, ...next.w]));
          setSelected(null);
          const td = gameStateRef.current.timerDuration;
          setTimeLeft(td === 0 ? 99 : td);
          setAnim("");
          answerRef.current = false;
        }
      }, 800);
    },
    [endGame]
  );

  useEffect(() => {
    if (screen !== "game" || selected !== null) return;
    if (gameStateRef.current.timerDuration === 0) return;
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
    const base = toQ(CATEGORY_MAP[cat]?.questions ?? []);
    const custom = cat === "all"
      ? Object.values(customQuestions).flat()
      : toQ(customQuestions[cat] || []);
    const pool = [...base, ...custom];
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


  // ── MODALS ───────────────────────────────────────────────────────────────────
  const InfoModal = ({ type }: { type: "about"|"updates" }) => (
    <div onClick={() => setModal(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:20, width:"100%", maxWidth:400, maxHeight:"85vh", display:"flex", flexDirection:"column", position:"relative", color:"#fff" }}>
        <div style={{ padding:"20px 24px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #2d2d44", flexShrink:0 }}>
          <div style={{ fontSize:"1.2rem", fontWeight:900 }}>{type === "about" ? "⚡ About" : "🆕 Updates"}</div>
          <button onClick={() => setModal(null)} style={{ background:"transparent", border:"none", color:"#6b7280", fontSize:20, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
        <div style={{ overflowY:"auto", padding:"16px 24px 24px", flex:1 }}>
        {type === "about" && (<>
          <p style={{ color:"#d1d5db", lineHeight:1.7, marginBottom:12 }}><strong style={{ color:"#f59e0b" }}>TrivQuic</strong> is a fast-paced trivia game. Fast trivia. No mercy.</p>
          <p style={{ color:"#d1d5db", lineHeight:1.7, marginBottom:20 }}>Play solo across 6 categories or go head-to-head in real-time multiplayer.</p>
          <div style={{ borderTop:"1px solid #2d2d44", paddingTop:16, fontSize:13, color:"#4b5563", lineHeight:1.8 }}>
            <div>By: Chris</div><div>Made in: 2026</div>
            <div>Email: <a href="mailto:chris0622ha@gmail.com" style={{ color:"#f59e0b", textDecoration:"none" }}>chris0622ha@gmail.com</a></div>
          </div>
        </>)}
        {type === "updates" && (<>
          {[
            { version:"Jun 4", date:"Wednesday, June 4, 2026", items:["🌐 Language selector — 14 languages via Google Translate, persists across all pages", "🔔 Clear notifications button next to avatar", "Status system — Online, DND, Sleeping, Focused, or custom", "Status shown on friend rows and in chat", "Mute specific friends — 🔔/🔕 toggle on friend rows", "Friends chat with real-time messages and unread badge", "Chat message reporting — 🚩 button on each message", "Admin: Chat Reports panel", "Full FCM push notifications — chat, friend requests, duel challenges", "Duels overhauled — 3–10 rounds, custom Q per round, break time between rounds", "Random matchmaking mode in duels", "Challenge a friend to a duel from your friends list", "Duel challenge notifications shown on home screen", "Leaderboard filters by category, questions per round, and time limit", "Each leaderboard entry shows exact timer used", "Scrollable About and Updates modals", "Multiple build fixes — app deploys reliably"] },
            { version:"Jun 3", date:"Tuesday, June 3, 2026", items:["Username picker on first login — choose wisely (3 changes left)", "Leaderboard shows displayName(username) when name differs", "Two-way friend requests with accept/decline and notification badge", "Profile picture upload from device/photo library", "User profiles with per-category stats", "Leaderboard now UID-keyed — no more duplicate names", "Profile modal accessible from your avatar", "Admin panel — Dashboard, Users, Leaderboard, Bans, Reports, Questions, Announcements", "Maintenance mode toggle", "Badges: ⭐ Star, ✓ Verified, 👑 Crown — assignable from admin", "Login history tracking in admin", "Score reporting button on leaderboard", "Duels feature — 1v1 real-time matchmaking"] },
            { version:"v1.3", date:"Monday, Jun 2, 2026", items:["Google sign-in added", "About & Updates modals"] },
            { version:"v1.2", date:"Sunday, Jun 1, 2026", items:["Global Firebase leaderboard (live across all players)", "Bug fix: result screen showing 0/total"] },
            { version:"v1.1", date:"Saturday, May 31, 2026", items:["Category picker", "Round size selector: 10 / 20 / 30 questions"] },
            { version:"v1.0", date:"Friday, May 30, 2026", items:["Initial launch: solo mode + real-time multiplayer", "3-second timer, streak bonuses, leaderboard"] },
          ].map(({ version, date, items }) => (
            <div key={version} style={{ marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6 }}>
                <span style={{ color:"#f59e0b", fontWeight:800, fontSize:14 }}>{version}</span>
                <span style={{ color:"#4b5563", fontSize:12 }}>{date}</span>
              </div>
              {items.map(item => (
                <div key={item} style={{ color:"#d1d5db", fontSize:13, lineHeight:1.6, paddingLeft:12, borderLeft:"2px solid #2d2d44", marginBottom:3 }}>{item}</div>
              ))}
            </div>
          ))}
        </>)}
        </div>
      </div>
    </div>
  );

  // ── AUTH HEADER ──────────────────────────────────────────────────────────────
  const AuthHeader = () => (
    <div style={{ position:"fixed", top:0, right:0, padding:"12px 16px", zIndex:200, display:"flex", alignItems:"center", gap:10 }}>
      {authLoading ? null : user ? (
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={() => setModal("profile")} title="View your profile"
            style={{ background:"transparent", border:"none", cursor:"pointer", padding:0, display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ position:"relative", display:"inline-block" }}>
              {(userData?.photoURL || user.photoURL) ? (
                <img src={userData?.photoURL || user.photoURL} alt="" width={32} height={32}
                  style={{ borderRadius:"50%", border:"2px solid #f59e0b", display:"block" }} />
              ) : (
                <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(245,158,11,0.2)",
                  border:"2px solid #f59e0b", display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:14, fontWeight:900, color:"#f59e0b" }}>
                  {(userData?.username || user.email || "?")[0].toUpperCase()}
                </div>
              )}
              {(pendingCount + unreadChats) > 0 && (
                <div style={{ position:"absolute", top:-3, right:-3, width:16, height:16,
                  borderRadius:"50%", background:"#ef4444", border:"2px solid #0f0f1a",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:9, fontWeight:900, color:"#fff", lineHeight:1 }}>
                  {(pendingCount + unreadChats) > 9 ? "9+" : (pendingCount + unreadChats)}
                </div>
              )}
            </div>
            <span style={{ color:"#e5e7eb", fontSize:13, fontWeight:600, maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:3 }}>
              {userData?.username || user.displayName?.split(" ")[0] || user.email?.split("@")[0]}
              {userData?.badge === "star"  && <span style={{ fontSize:12 }}>⭐</span>}
              {userData?.badge === "check" && <span style={{ fontSize:11, color:"#3b82f6", fontWeight:900 }}>✓</span>}
              {userData?.badge === "crown" && <span style={{ fontSize:12 }}>👑</span>}
            </span>
          </button>
          {(pendingCount + unreadChats) > 0 && (
            <button onClick={async () => {
              // Clear all unread chat counts
              if (!user) return;
              try {
                const { ref: r, get: g, update: u, off: o } = await import("firebase/database");
                const snap = await g(r(db, "chats"));
                if (snap.exists()) {
                  const updates: any = {};
                  Object.keys(snap.val()).forEach(key => {
                    if (key.includes(user.uid)) updates[`chats/${key}/unread/${user.uid}`] = 0;
                  });
                  if (Object.keys(updates).length) await u(r(db), updates);
                }
              } catch {}
            }} title="Clear all notifications"
              style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, color:"#ef4444", fontSize:12, fontWeight:700, padding:"5px 10px", cursor:"pointer" }}>
              🔔 Clear
            </button>
          )}
          <button onClick={() => signOut(auth)}
            style={{ background:"rgba(255,255,255,0.07)", border:"1px solid #2d2d44", borderRadius:8, color:"#9ca3af", fontSize:12, fontWeight:600, padding:"5px 12px", cursor:"pointer" }}>
            Sign out
          </button>
        </div>
      ) : (
        <button onClick={async () => { try { await signInWithPopup(auth, googleProvider); } catch {} }}
          style={{ display:"flex", alignItems:"center", gap:8, background:"#fff", border:"none", borderRadius:8, color:"#1f2937", fontSize:13, fontWeight:700, padding:"8px 14px", cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.3)" }}>
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

  // ── LEADERBOARD WIDGET ───────────────────────────────────────────────────────
  const TIMER_BUCKETS = [
    { label: "All",      min: -1,  max: Infinity },
    { label: "1s",       min: 1,   max: 1 },
    { label: "2s",       min: 2,   max: 2 },
    { label: "3s",       min: 3,   max: 3 },
    { label: "4s",       min: 4,   max: 4 },
    { label: "5s",       min: 5,   max: 5 },
    { label: "6–8s",     min: 6,   max: 8 },
    { label: "9–10s",    min: 9,   max: 10 },
    { label: "11–15s",   min: 11,  max: 15 },
    { label: "16–20s",   min: 16,  max: 20 },
    { label: "21–30s",   min: 21,  max: 30 },
    { label: "31–60s",   min: 31,  max: 60 },
    { label: "61–120s",  min: 61,  max: 120 },
    { label: "2–5m",     min: 121, max: 300 },
    { label: "5–8m",     min: 301, max: 480 },
    { label: "8–11m",    min: 481, max: 660 },
    { label: "11–15m",   min: 661, max: 900 },
    { label: "∞",        min: 0,   max: 0 },
  ];

  const LeaderboardView = () => {
    const [expanded, setExpanded] = useState(false);
    const [catFilter, setCatFilter] = useState("all");
    const [roundFilter, setRoundFilter] = useState(0);
    const [timerFilter, setTimerFilter] = useState(0);
    const INITIAL = 5;

    const filtered = globalLB.filter(e => {
      if (catFilter !== "all" && e.category !== catFilter) return false;
      if (roundFilter !== 0 && e.roundSize !== roundFilter) return false;
      const bucket = TIMER_BUCKETS[timerFilter];
      if (timerFilter !== 0) {
        const t = e.timerDuration ?? 0;
        if (bucket.min === 0 && bucket.max === 0) { if (t !== 0) return false; }
        else { if (t < bucket.min || t > bucket.max) return false; }
      }
      return true;
    }).sort((a, b) => b.score - a.score);

    const visible = expanded ? filtered : filtered.slice(0, INITIAL);

    const Pill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
      <button onClick={onClick} style={{
        background: active ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? "#f59e0b" : "#2d2d44"}`,
        borderRadius: 99, color: active ? "#f59e0b" : "#6b7280",
        fontSize: 11, fontWeight: 700, padding: "4px 10px", cursor: "pointer",
        whiteSpace: "nowrap" as const, flexShrink: 0,
      }}>{label}</button>
    );

    if (globalLB.length === 0) return null;
    return (
      <div style={{ width:"100%", maxWidth:400, background:"#1a1a2e", borderRadius:16, padding:"20px" }}>
        <div style={{ fontSize:13, color:"#f59e0b", marginBottom:12, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:700 }}>
          🏆 Global Leaderboard
        </div>

        {/* Category filter */}
        <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Category</div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
          <Pill label="All" active={catFilter === "all"} onClick={() => setCatFilter("all")} />
          {Object.entries(CATEGORY_MAP).filter(([k]) => k !== "all").map(([k, v]) => (
            <Pill key={k} label={`${v.emoji} ${v.label}`} active={catFilter === k} onClick={() => setCatFilter(k)} />
          ))}
        </div>

        {/* Questions filter */}
        <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Questions</div>
        <div style={{ display:"flex", gap:5, marginBottom:10 }}>
          {[["All", 0], ["10", 10], ["20", 20], ["30", 30]].map(([label, val]) => (
            <Pill key={val} label={label as string} active={roundFilter === val} onClick={() => setRoundFilter(val as number)} />
          ))}
        </div>

        {/* Timer filter */}
        <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Time limit</div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
          {TIMER_BUCKETS.map((b, i) => (
            <Pill key={i} label={b.label} active={timerFilter === i} onClick={() => setTimerFilter(i)} />
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ color:"#4b5563", fontSize:13, textAlign:"center", padding:"16px 0" }}>No scores yet for this combination</div>
        ) : (
          <>
            <div style={{ maxHeight: expanded ? 420 : "none", overflowY: expanded ? "auto" : "visible" }}>
              {visible.map((e, i) => {
                const rankLabel = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
                const rankColor = i < 3 ? undefined : "#4b5563";
                const timerLabel = e.timerDuration === 0 ? "∞" : e.timerDuration != null ? `${e.timerDuration}s` : "—";
                return (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 6px", borderBottom:"1px solid #2d2d44" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize: i < 3 ? 18 : 12, fontWeight:800, color: rankColor, width:28, textAlign:"right", flexShrink:0 }}>{rankLabel}</span>
                      <div>
                        <span style={{ color:"#e5e7eb", fontWeight:600, fontSize:14 }}>{e.name}</span>
                        {e.badge === "star"  && <span title="Loyal Player" style={{ fontSize:13 }}>⭐</span>}
                        {e.badge === "check" && <span title="Verified"     style={{ fontSize:12, color:"#3b82f6", fontWeight:900 }}>✓</span>}
                        {e.badge === "crown" && <span title="Champion"     style={{ fontSize:13 }}>👑</span>}
                        <div style={{ fontSize:10, color:"#4b5563" }}>
                          {CATEGORY_MAP[e.category]?.emoji} {CATEGORY_MAP[e.category]?.label ?? e.category}
                          {e.roundSize != null ? ` · ${e.roundSize}Q` : ""}
                          {` · ${timerLabel}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign:"right", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                      <div style={{ color:"#f59e0b", fontWeight:800, fontSize:16 }}>{e.score}</div>
                      <div style={{ color:"#6b7280", fontSize:11 }}>🔥{e.streak}</div>
                      {user && (
                        <button onClick={() => setReportTarget(e)} style={{ background:"transparent", border:"none", color:"#4b5563", fontSize:10, cursor:"pointer", padding:0, marginTop:1 }}>
                          🚩 report
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {filtered.length > INITIAL && (
              <button onClick={() => setExpanded(x => !x)}
                style={{ width:"100%", background:"transparent", border:"none", color:"#6b7280",
                  fontSize:12, fontWeight:600, padding:"10px 0 0", cursor:"pointer",
                  letterSpacing:"0.05em", textTransform:"uppercase" }}>
                {expanded ? "Show less ▲" : "Show all ▼"}
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  // ── HOME ──────────────────────────────────────────────────────────────────────
  // Maintenance mode — block non-admins
  if (maintenanceMode && !userData?.isAdmin) return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px", color:"#fff", textAlign:"center" }}>
      <AuthHeader />
      <div style={{ fontSize:56, marginBottom:16 }}>🔧</div>
      <h1 style={{ fontSize:"2rem", fontWeight:900, margin:"0 0 12px" }}>Down for Maintenance</h1>
      <p style={{ color:"#6b7280", maxWidth:360, lineHeight:1.7 }}>TrivQuic is currently undergoing maintenance. Check back soon!</p>
    </div>
  );

  if (screen === "home") return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px 16px", color:"#fff" }}>
      <AuthHeader />
      {announcement && (
        <div style={{ width:"100%", maxWidth: isMobile ? 460 : 860, background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"flex-start", gap:10 }}>
          <span style={{ fontSize:18, flexShrink:0 }}>📢</span>
          <div>
            <div style={{ color:"#f59e0b", fontWeight:700, fontSize:14 }}>{announcement.text}</div>
            <div style={{ color:"#4b5563", fontSize:11, marginTop:2 }}>{announcement.postedAt}</div>
          </div>
        </div>
      )}

      {duelChallenges.length > 0 && (
        <div style={{ width:"100%", maxWidth: isMobile ? 460 : 860, marginBottom:16, display:"flex", flexDirection:"column", gap:8 }}>
          {duelChallenges.map(ch => (
            <div key={ch.fromUid} style={{ background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.4)", borderRadius:12, padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:20, flexShrink:0 }}>⚔️</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, color:"#a5b4fc" }}>
                  {ch.fromName} challenged you to a duel!
                </div>
                <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
                  {ch.settings?.rounds}R · {ch.settings?.questionsPerRound}Q · {ch.settings?.breakTime}s break
                </div>
              </div>
              <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                <a href="/duels" style={{ background:"linear-gradient(135deg,#6366f1,#a855f7)", border:"none", borderRadius:8, color:"#fff", fontWeight:800, fontSize:13, padding:"8px 14px", cursor:"pointer", textDecoration:"none", display:"block" }}>
                  Accept ⚔️
                </a>
                <button onClick={async () => {
                  await remove(ref(db, `duelChallenges/${user!.uid}/${ch.fromUid}`));
                  setDuelChallenges(c => c.filter(x => x.fromUid !== ch.fromUid));
                }} style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.4)", borderRadius:8, color:"#ef4444", fontWeight:700, fontSize:13, padding:"8px 12px", cursor:"pointer" }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showUsernamePicker && user && (
        <UsernamePickerModal user={user} onDone={(username, ud) => {
          setUserData(ud);
          setName(username);
          try { localStorage.setItem("onetap_name", username); } catch {}
          setShowUsernamePicker(false);
        }} />
      )}
      {modal === "profile" && user && (
        <ProfileModal user={user} userData={userData} onClose={() => setModal(null)}
          onUserDataChange={(d) => { setUserData(d); setName(d.username); try { localStorage.setItem("onetap_name", d.username); } catch {} }} />
      )}
      {(modal === "about" || modal === "updates") && <InfoModal type={modal} />}
      {reportTarget && user && (
        <ReportModal
          target={reportTarget}
          reporter={{ uid: user.uid, name: userData?.username || user.displayName?.split(" ")[0] || "Anonymous" }}
          onClose={() => setReportTarget(null)}
        />
      )}
      {showLangModal && (
        <LangModal currentLang={currentLang} onSelect={(lang) => { setCurrentLang(lang); setShowLangModal(false); }} onClose={() => setShowLangModal(false)} />
      )}

      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:56, marginBottom:8 }}>⚡</div>
        <h1 style={{ fontSize:"2.8rem", fontWeight:900, letterSpacing:"-0.03em", margin:0, background:"linear-gradient(135deg, #f59e0b, #ef4444)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>TrivQuic</h1>
        <p style={{ color:"#6b7280", marginTop:8, fontSize:"1.1rem" }}>Fast trivia. No mercy.</p>
      </div>

      <div style={{ width:"100%", maxWidth: isMobile ? 460 : 860, background:"#1a1a2e", borderRadius:16, padding:"16px 24px", marginBottom:16 }}>
        <div style={{ fontSize:12, color:"#6b7280", marginBottom:8, letterSpacing:"0.05em", textTransform:"uppercase" }}>
          {user ? "Name for this round" : "Your name"}
        </div>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); try { localStorage.setItem("onetap_name", e.target.value); } catch {} }}
          placeholder={userData?.username || "Enter your name..."}
          style={{ width:"100%", background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:10, color:"#fff", fontSize:16, padding:"12px 16px", outline:"none", boxSizing:"border-box" }}
        />
        {user && userData?.username && name && name.toLowerCase() !== userData.username.toLowerCase() && (
          <div style={{ fontSize:11, color:"#6b7280", marginTop:6 }}>
            Will show as <span style={{ color:"#f59e0b" }}>{name}({userData.username})</span> on the leaderboard
          </div>
        )}
      </div>

      <div style={{ width:"100%", maxWidth: isMobile ? 460 : 860, display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:16, alignItems:"start" }}>

        {/* LEFT — Solo + Duels */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ fontSize:11, color:"#f59e0b", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", paddingLeft:4 }}>⚡ Solo</div>
          <div style={{ background:"#1a1a2e", borderRadius:16, padding:"16px 20px" }}>
            <div style={{ fontSize:11, color:"#6b7280", marginBottom:10, letterSpacing:"0.05em", textTransform:"uppercase" }}>Category</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {Object.entries(CATEGORY_MAP).map(([key, cat]) => (
                <button key={key} onClick={() => { setCategory(key); try { localStorage.setItem("onetap_category", key); } catch {} }}
                  style={{ background: category === key ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)", border:`1px solid ${category === key ? "#f59e0b" : "#2d2d44"}`, borderRadius:10, color: category === key ? "#f59e0b" : "#9ca3af", fontSize:12, fontWeight:600, padding:"9px 6px", cursor:"pointer", transition:"all 0.15s", gridColumn: key === "all" ? "span 2" : "span 1" }}>
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ background:"#1a1a2e", borderRadius:16, padding:"16px 20px" }}>
            <div style={{ fontSize:11, color:"#6b7280", marginBottom:10, letterSpacing:"0.05em", textTransform:"uppercase" }}>Questions per round</div>
            <div style={{ display:"flex", gap:8 }}>
              {ROUND_SIZES.map((n) => (
                <button key={n} onClick={() => { setRoundSize(n); try { localStorage.setItem("onetap_round", String(n)); } catch {} }}
                  style={{ flex:1, background: roundSize === n ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)", border:`1px solid ${roundSize === n ? "#f59e0b" : "#2d2d44"}`, borderRadius:10, color: roundSize === n ? "#f59e0b" : "#9ca3af", fontSize:15, fontWeight:700, padding:"10px 0", cursor:"pointer", transition:"all 0.15s" }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div style={{ background:"#1a1a2e", borderRadius:16, padding:"16px 20px" }}>
            <div style={{ fontSize:11, color:"#6b7280", marginBottom:10, letterSpacing:"0.05em", textTransform:"uppercase" }}>Timer (seconds)</div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input type="text" inputMode="numeric" maxLength={3}
                value={timerDuration === 0 ? "" : String(timerDuration)}
                placeholder="e.g. 3" disabled={timerDuration === 0}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => { if (e.target.value === "" && timerDuration !== 0) { setTimerDuration(3); try { localStorage.setItem("onetap_timer", "3"); } catch {} } }}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "∞") { setTimerDuration(0); try { localStorage.setItem("onetap_timer", "0"); } catch {}; return; }
                  const cleaned = raw.replace(/[^0-9]/g, "");
                  if (cleaned === "") { setTimerDuration(0); return; }
                  const num = Math.min(900, Math.max(1, Number(cleaned) || 1));
                  setTimerDuration(num);
                  try { localStorage.setItem("onetap_timer", String(num)); } catch {}
                }}
                style={{ flex:1, background: timerDuration === 0 ? "rgba(255,255,255,0.02)" : "#0f0f1a", border:`1px solid ${timerDuration === 0 ? "#2d2d44" : "#f59e0b"}`, borderRadius:10, color: timerDuration === 0 ? "#4b5563" : "#fff", fontSize:18, fontWeight:700, padding:"10px 14px", outline:"none", textAlign:"center", opacity: timerDuration === 0 ? 0.4 : 1 }}
              />
              <button onClick={() => { const next = timerDuration === 0 ? 3 : 0; setTimerDuration(next); try { localStorage.setItem("onetap_timer", String(next)); } catch {} }}
                style={{ background: timerDuration === 0 ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)", border:`1px solid ${timerDuration === 0 ? "#f59e0b" : "#2d2d44"}`, borderRadius:10, color: timerDuration === 0 ? "#f59e0b" : "#9ca3af", fontSize:20, fontWeight:700, padding:"10px 18px", cursor:"pointer", transition:"all 0.15s", flexShrink:0 }}>
                ∞
              </button>
            </div>
          </div>
          <button onClick={() => startGame(category, roundSize, timerDuration)}
            style={{ background:"linear-gradient(135deg, #f59e0b, #ef4444)", border:"none", borderRadius:14, color:"#fff", fontSize:"1.1rem", fontWeight:800, padding:"16px", cursor:"pointer", width:"100%" }}>
            START GAME ⚡
          </button>

          {/* Duels — big green button below solo on desktop, above multiplayer on mobile */}
          <a href="/duels" style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:10,
            background:"linear-gradient(135deg, #10b981, #059669)",
            border:"none", borderRadius:14, color:"#fff",
            fontSize:"1.15rem", fontWeight:900, padding:"18px 16px",
            cursor:"pointer", textDecoration:"none", width:"100%",
            boxSizing:"border-box", letterSpacing:"0.01em",
            boxShadow:"0 4px 24px rgba(16,185,129,0.3)",
          }}>
            <span style={{ fontSize:22 }}>⚔️</span>
            <span>Duels</span>
            <span style={{ fontSize:12, fontWeight:600, opacity:0.8, background:"rgba(0,0,0,0.2)", borderRadius:99, padding:"2px 8px" }}>1v1</span>
          </a>
        </div>

        {/* RIGHT — Multiplayer + Leaderboard */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ fontSize:11, color:"#10b981", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", paddingLeft:4 }}>🎮 Multiplayer</div>
          <div style={{ background:"#1a1a2e", borderRadius:16, padding:"16px 20px", display:"flex", flexDirection:"column", gap:10 }}>
            <a href="/multiplayer" style={{ display:"block", background:"rgba(16,185,129,0.15)", border:"1px solid rgba(16,185,129,0.4)", borderRadius:10, color:"#10b981", fontSize:"1rem", fontWeight:800, padding:"13px", cursor:"pointer", textAlign:"center", textDecoration:"none" }}>🎮 Host a Game</a>
            <div style={{ fontSize:11, color:"#4b5563", textAlign:"center", letterSpacing:"0.05em" }}>— or join with a code —</div>
            <input id="jc" maxLength={6} placeholder="GAME CODE"
              style={{ width:"100%", background:"#0f0f1a", border:"1px solid #2d2d44", borderRadius:10, color:"#fff", fontSize:18, fontWeight:700, letterSpacing:"0.3em", padding:"11px 14px", outline:"none", textTransform:"uppercase", boxSizing:"border-box", textAlign:"center" }} />
            <button onClick={() => { const c = (document.getElementById("jc") as HTMLInputElement).value.trim().toUpperCase(); window.location.href = c ? `/multiplayer?join=${c}` : "/multiplayer"; }}
              style={{ width:"100%", background:"linear-gradient(135deg,#10b981,#059669)", border:"none", borderRadius:10, color:"#fff", fontSize:"1rem", fontWeight:800, padding:"13px", cursor:"pointer" }}>
              Join Game →
            </button>
          </div>
          <LeaderboardView />
        </div>
      </div>

      <div style={{ display:"flex", gap:8, marginTop:24, marginBottom:8 }}>
        <button onClick={() => window.dispatchEvent(new CustomEvent("onetap-modal", { detail:"about" }))}
          style={{ background:"transparent", border:"1px solid #2d2d44", borderRadius:8, color:"#4b5563", fontSize:12, fontWeight:600, padding:"6px 14px", cursor:"pointer", letterSpacing:"0.04em" }}>About</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent("onetap-modal", { detail:"updates" }))}
          style={{ background:"transparent", border:"1px solid #2d2d44", borderRadius:8, color:"#4b5563", fontSize:12, fontWeight:600, padding:"6px 14px", cursor:"pointer", letterSpacing:"0.04em" }}>Updates</button>
        <a href="/admin"
          style={{ background:"transparent", border:"1px solid #2d2d44", borderRadius:8, color:"#4b5563", fontSize:12, fontWeight:600, padding:"6px 14px", cursor:"pointer", letterSpacing:"0.04em", textDecoration:"none" }}>Admin</a>
        <button onClick={() => setShowLangModal(true)}
          style={{ background:"transparent", border:"1px solid #2d2d44", borderRadius:8, color:"#4b5563", fontSize:12, fontWeight:600, padding:"6px 14px", cursor:"pointer", letterSpacing:"0.04em" }}>🌐 Language</button>
        <a href="https://www.youtube.com/watch?v=jNQXAC9IVRw" target="_blank" rel="noreferrer"
          style={{ background:"transparent", border:"1px solid #2d2d44", borderRadius:8, color:"#4b5563", fontSize:12, fontWeight:600, padding:"6px 14px", cursor:"pointer", letterSpacing:"0.04em", textDecoration:"none" }}>Don't click</a>
      </div>
    </div>
  );

  // ── RESULT ────────────────────────────────────────────────────────────────────
  if (screen === "result") {
    const r = resultsRef.current;
    const acc = Math.round((r.correct / (r.total || 1)) * 100);
    const emoji = r.correct >= Math.round(r.total * 0.85) ? "🏆" : r.correct >= Math.round(r.total * 0.6) ? "🔥" : r.correct >= Math.round(r.total * 0.35) ? "👍" : "💀";
    const msg = r.correct >= Math.round(r.total * 0.85) ? "Legendary!" : r.correct >= Math.round(r.total * 0.6) ? "On Fire!" : r.correct >= Math.round(r.total * 0.35) ? "Not Bad!" : "Keep Practicing!";
    return (
      <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px", color:"#fff" }}>
        {modal === "profile" && user && <ProfileModal user={user} userData={userData} onClose={() => setModal(null)} onUserDataChange={(d) => { setUserData(d); setName(d.username); }} />}
        <AuthHeader />
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:64, marginBottom:8 }}>{emoji}</div>
          <h2 style={{ fontSize:"2rem", fontWeight:900, margin:0 }}>{msg}</h2>
          <p style={{ color:"#6b7280", marginTop:6 }}>{r.correct}/{r.total} correct · {CATEGORY_MAP[r.category]?.emoji} {CATEGORY_MAP[r.category]?.label}</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:32, width:"100%", maxWidth:400 }}>
          {([["Score", r.score, "#f59e0b"], ["Best Streak", `${r.bestStreak}🔥`, "#ef4444"], ["Accuracy", `${acc}%`, "#10b981"]] as [string,any,string][]).map(([label, val, color]) => (
            <div key={label} style={{ background:"#1a1a2e", borderRadius:12, padding:"16px 12px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:900, color }}>{val}</div>
              <div style={{ fontSize:11, color:"#6b7280", marginTop:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</div>
            </div>
          ))}
        </div>
        {user && <button onClick={() => setModal("profile")} style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:10, color:"#f59e0b", fontSize:13, fontWeight:600, padding:"10px 20px", cursor:"pointer", marginBottom:20 }}>📊 View My Stats</button>}
        <div style={{ display:"flex", gap:12, marginBottom:32 }}>
          <button onClick={() => startGame(r.category, roundSize, timerDuration)} style={{ background:"linear-gradient(135deg, #f59e0b, #ef4444)", border:"none", borderRadius:12, color:"#fff", fontSize:"1rem", fontWeight:800, padding:"14px 28px", cursor:"pointer" }}>PLAY AGAIN ⚡</button>
          <button onClick={() => setScreen("home")} style={{ background:"#1a1a2e", border:"1px solid #2d2d44", borderRadius:12, color:"#9ca3af", fontSize:"1rem", fontWeight:600, padding:"14px 28px", cursor:"pointer" }}>Home</button>
        </div>
        <LeaderboardView />
      </div>
    );
  }

  // ── GAME ──────────────────────────────────────────────────────────────────────
  if (!q) return null;
  return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", flexDirection:"column", alignItems:"center", padding:"20px", color:"#fff" }}>
      <AuthHeader />
      {modal === "profile" && user && <ProfileModal user={user} userData={userData} onClose={() => setModal(null)} onUserDataChange={(d) => { setUserData(d); setName(d.username); }} />}
      <div style={{ width:"100%", maxWidth:480, display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:22, fontWeight:900, color:"#f59e0b" }}>{score}</div>
        <div style={{ fontSize:13, color:"#6b7280" }}>{qIndex + 1} / {questions.length}</div>
        <div style={{ fontSize:16, fontWeight:700, color: streak > 0 ? "#ef4444" : "#4b5563" }}>🔥{streak}</div>
      </div>
      <div style={{ width:"100%", maxWidth:480, height:4, background:"#1a1a2e", borderRadius:2, marginBottom:24, overflow:"hidden" }}>
        <div style={{ height:"100%", width: pct + "%", background:"linear-gradient(90deg, #f59e0b, #ef4444)", borderRadius:2, transition:"width 0.3s" }} />
      </div>
      <div style={{ fontSize:11, color:"#4b5563", marginBottom:16, letterSpacing:"0.08em", textTransform:"uppercase" }}>
        {CATEGORY_MAP[category]?.emoji} {CATEGORY_MAP[category]?.label}
      </div>
      {gameStateRef.current.timerDuration !== 0 && <div style={{ position:"relative", width:80, height:80, marginBottom:24 }}>
        <svg width="80" height="80" style={{ transform:"rotate(-90deg)" }}>
          <circle cx="40" cy="40" r="34" fill="none" stroke="#1a1a2e" strokeWidth="6" />
          <circle cx="40" cy="40" r="34" fill="none" stroke={timeLeft <= 1 ? "#ef4444" : timeLeft <= 2 ? "#f59e0b" : "#10b981"}
            strokeWidth="6" strokeDasharray={213.6} strokeDashoffset={213.6 * (1 - timeLeft / gameStateRef.current.timerDuration)}
            style={{ transition:`stroke-dashoffset ${Math.min(timeLeft, 1)}s linear, stroke 0.3s` }} />
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color: timeLeft <= 1 ? "#ef4444" : "#fff" }}>
          {selected ? "✓" : timeLeft}
        </div>
      </div>}
      {showStreak && <div style={{ position:"fixed", top:"30%", left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg, #f59e0b, #ef4444)", borderRadius:16, padding:"12px 24px", fontSize:22, fontWeight:900, zIndex:100 }}>🔥 {streak}x STREAK!</div>}
      <div style={{ width:"100%", maxWidth:480, background:"#1a1a2e", borderRadius:20, padding:"28px 24px", marginBottom:20, textAlign:"center" }}>
        <div style={{ fontSize:"1.3rem", fontWeight:700, lineHeight:1.4 }}>{q.q}</div>
      </div>
      <div style={{ width:"100%", maxWidth:480, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {options.map((opt, i) => {
          const isCorrect = opt === q.a;
          const isWrong = selected === opt && !isCorrect;
          const showResult = selected !== null;
          return (
            <button key={i} onClick={() => handleAnswer(opt, questions, qIndex)} disabled={!!selected}
              className={selected === opt ? anim : ""}
              style={{ background: showResult && isCorrect ? "#064e3b" : showResult && isWrong ? "#450a0a" : "#1a1a2e", border:`2px solid ${showResult && isCorrect ? "#10b981" : showResult && isWrong ? "#ef4444" : "#2d2d44"}`, borderRadius:14, color: showResult && isCorrect ? "#10b981" : showResult && isWrong ? "#ef4444" : "#e5e7eb", fontSize:"1rem", fontWeight:700, padding:"20px 16px", cursor: selected ? "default" : "pointer", transition:"all 0.2s", lineHeight:1.3 }}>
              {opt}
            </button>
          );
        })}
      </div>
      {selected === "__timeout__" && <div style={{ marginTop:20, color:"#ef4444", fontWeight:700, fontSize:"1.1rem" }}>⏰ Too slow! Answer: <span style={{ color:"#10b981" }}>{q.a}</span></div>}
    </div>
  );
}
