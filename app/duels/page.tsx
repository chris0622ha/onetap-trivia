"use client";
export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { db, auth, googleProvider } from "../lib/firebase";
import { ref, get, set, update, onValue, off, remove, push } from "firebase/database";
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

import { geography } from "../data/geography";
import { science } from "../data/science";
import { history } from "../data/history";
import { math } from "../data/math";
import { sports } from "../data/sports";
import { entertainment } from "../data/entertainment";

const ALL_Q = [...geography,...science,...history,...math,...sports,...entertainment]
  .map((x:any) => ({ q:x.q, a:x.a, w:x.w??x.wrong??[] }));

function shuffle<T>(arr:T[]):T[] {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

const TIMER_PER_Q = 8;
const ROUND_OPTIONS = [10,20,30];
const BREAK_OPTIONS = [5,10,20,30];
const ROUND_COUNT_OPTIONS = [3,4,5,6,7,8,9,10];

type Screen = "home"|"settings"|"searching"|"countdown"|"game"|"break"|"result";
type Slot = "p1"|"p2";

function Avatar({src,name,size=40,color="#f59e0b"}:{src?:string|null;name:string;size?:number;color?:string}) {
  return src ? (
    <img src={src} alt="" width={size} height={size} style={{borderRadius:"50%",border:`3px solid ${color}`,display:"block",objectFit:"cover",flexShrink:0}}/>
  ):(
    <div style={{width:size,height:size,borderRadius:"50%",background:`rgba(99,102,241,0.2)`,border:`3px solid ${color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:900,color,flexShrink:0}}>
      {(name||"?")[0].toUpperCase()}
    </div>
  );
}

function Badge({badge}:{badge?:string}) {
  if(!badge) return null;
  if(badge==="star")  return <span style={{fontSize:13}}>⭐</span>;
  if(badge==="check") return <span style={{fontSize:12,color:"#3b82f6",fontWeight:900}}>✓</span>;
  if(badge==="crown") return <span style={{fontSize:13}}>👑</span>;
  return null;
}

function PlayerStrip({name,score,photo,badge,isMe,total}:{name:string;score:number;photo?:string|null;badge?:string;isMe:boolean;total:number}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
      <Avatar src={photo} name={name} size={40} color={isMe?"#f59e0b":"#6366f1"} />
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>
          {name} <Badge badge={badge} />
          {isMe && <span style={{fontSize:10,color:"#6b7280"}}>(you)</span>}
        </div>
        <div style={{fontSize:11,color:"#6b7280"}}>{score}/{total} correct</div>
      </div>
      <div style={{fontSize:26,fontWeight:900,color:isMe?"#f59e0b":"#6366f1",flexShrink:0}}>{score}</div>
    </div>
  );
}

// ── Friend Challenge Modal ────────────────────────────────────────────────────
function ChallengeFriendModal({user,userData,settings,onClose}:{user:User;userData:any;settings:any;onClose:()=>void}) {
  const [friends,setFriends] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  const [sent,setSent] = useState<string|null>(null);

  useEffect(()=>{
    const ids:string[] = userData?.friendIds||[];
    if(!ids.length){setLoading(false);return;}
    Promise.all(ids.map((id:string)=>get(ref(db,`users/${id}`)).then(s=>s.exists()?{uid:id,...s.val()}:null)))
      .then(r=>{setFriends(r.filter(Boolean) as any[]);setLoading(false);});
  },[userData?.friendIds]);

  async function challenge(friend:any) {
    const challengeData = {
      fromUid: user.uid,
      fromName: userData?.username||user.displayName?.split(" ")[0]||"Player",
      fromPhoto: userData?.photoURL||user.photoURL||null,
      fromBadge: userData?.badge||null,
      settings,
      sentAt: Date.now(),
    };
    await set(ref(db,`duelChallenges/${friend.uid}/${user.uid}`), challengeData);
    setSent(friend.uid);
  }

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:20,width:"100%",maxWidth:380,padding:"24px",color:"#fff",maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:"1.1rem",fontWeight:900}}>⚔️ Challenge a Friend</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        <div style={{fontSize:12,color:"#6b7280",marginBottom:16}}>
          {settings.rounds} rounds · {settings.questionsPerRound}Q each · {settings.breakTime}s break
        </div>
        {loading ? <div style={{color:"#6b7280",textAlign:"center",padding:"20px 0"}}>Loading friends…</div> :
          friends.length===0 ? <div style={{color:"#4b5563",textAlign:"center",padding:"20px 0"}}>No friends yet. Add some first!</div> :
          friends.map(fp=>(
            <div key={fp.uid} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid #2d2d44"}}>
              <Avatar src={fp.photoURL} name={fp.username||"?"} size={36} color="#6366f1"/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:4}}>{fp.username} <Badge badge={fp.badge}/></div>
                <div style={{fontSize:11,color:"#6b7280"}}>Best: {fp.bestScore??0}</div>
              </div>
              <button onClick={()=>challenge(fp)} disabled={sent===fp.uid}
                style={{background:sent===fp.uid?"rgba(16,185,129,0.15)":"rgba(99,102,241,0.2)",border:`1px solid ${sent===fp.uid?"rgba(16,185,129,0.5)":"rgba(99,102,241,0.5)"}`,borderRadius:8,color:sent===fp.uid?"#10b981":"#a5b4fc",fontWeight:700,fontSize:12,padding:"6px 12px",cursor:sent===fp.uid?"default":"pointer"}}>
                {sent===fp.uid?"Sent ✓":"Challenge"}
              </button>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── Main Duels Page ───────────────────────────────────────────────────────────
export default function DuelsPage() {
  const [user,setUser] = useState<User|null>(null);
  const [userData,setUserData] = useState<any>(null);
  const [authLoading,setAuthLoading] = useState(true);
  const [screen,setScreen] = useState<Screen>("home");
  const [isMobile,setIsMobile] = useState(false);

  // Settings
  const [rounds,setRounds] = useState(3);
  const [questionsPerRound,setQuestionsPerRound] = useState(10);
  const [breakTime,setBreakTime] = useState(10);
  const [isRandom,setIsRandom] = useState(false);
  const [showChallenge,setShowChallenge] = useState(false);

  // Duel state
  const [duelId,setDuelId] = useState<string|null>(null);
  const [duel,setDuel] = useState<any>(null);
  const [mySlot,setMySlot] = useState<Slot|null>(null);
  const [currentRound,setCurrentRound] = useState(0); // 0-indexed
  const [qIndex,setQIndex] = useState(0);
  const [options,setOptions] = useState<string[]>([]);
  const [selected,setSelected] = useState<string|null>(null);
  const [timeLeft,setTimeLeft] = useState(TIMER_PER_Q);
  const [myRoundScore,setMyRoundScore] = useState(0);
  const [theirRoundScore,setTheirRoundScore] = useState(0);
  const [myTotalScore,setMyTotalScore] = useState(0);
  const [theirTotalScore,setTheirTotalScore] = useState(0);
  const [countdown,setCountdown] = useState(3);
  const [breakLeft,setBreakLeft] = useState(10);
  const [incomingChallenges,setIncomingChallenges] = useState<any[]>([]);

  const timerRef = useRef<any>(null);
  const answerRef = useRef(false);
  const myRoundRef = useRef(0);
  const searchTimeoutRef = useRef<any>(null);
  const breakTimerRef = useRef<any>(null);

  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<700);
    check(); window.addEventListener("resize",check);
    return ()=>window.removeEventListener("resize",check);
  },[]);

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth,async u=>{
      setUser(u); setAuthLoading(false);
      if(u){
        const snap=await get(ref(db,`users/${u.uid}`));
        if(snap.exists()) setUserData(snap.val());
      }
    });
    return ()=>unsub();
  },[]);

  // Listen for incoming challenges
  useEffect(()=>{
    if(!user) return;
    const chalRef = ref(db,`duelChallenges/${user.uid}`);
    const unsub = onValue(chalRef,snap=>{
      if(!snap.exists()){setIncomingChallenges([]);return;}
      const list = Object.entries(snap.val()).map(([fromUid,d]:any)=>({fromUid,...d}));
      setIncomingChallenges(list.filter((c:any)=>Date.now()-c.sentAt<300000)); // 5min expiry
    });
    return ()=>off(chalRef);
  },[user?.uid]);

  // Listen to duel
  useEffect(()=>{
    if(!duelId||!mySlot) return;
    const duelRef = ref(db,`duels/${duelId}`);
    const unsub = onValue(duelRef,snap=>{
      if(!snap.exists()) return;
      const data=snap.val();
      setDuel(data);
      const otherSlot:Slot = mySlot==="p1"?"p2":"p1";
      setTheirRoundScore(data[`${otherSlot}RoundScore`]??0);
      setTheirTotalScore(data[`${otherSlot}TotalScore`]??0);
    });
    return ()=>off(duelRef);
  },[duelId,mySlot]);

  function startCountdown(duelData:any,slot:Slot,id:string) {
    setScreen("countdown");
    let c=3; setCountdown(c);
    const iv = setInterval(()=>{
      c--; setCountdown(c);
      if(c<=0){
        clearInterval(iv);
        myRoundRef.current=0;
        setMyRoundScore(0); setTheirRoundScore(0);
        setQIndex(0); setSelected(null); setTimeLeft(TIMER_PER_Q);
        answerRef.current=false;
        setScreen("game");
      }
    },1000);
  }

  const handleAnswer = useCallback(async(ans:string)=>{
    if(answerRef.current||!duel||!mySlot||!duelId) return;
    answerRef.current=true;
    clearInterval(timerRef.current);
    setSelected(ans);
    const questions = duel.rounds[currentRound].questions;
    const q = questions[qIndex];
    const isCorrect = ans===q.a;
    const newRound = isCorrect ? myRoundRef.current+1 : myRoundRef.current;
    myRoundRef.current=newRound;
    setMyRoundScore(newRound);
    const updates:any={};
    updates[`duels/${duelId}/${mySlot}RoundScore`]=newRound;
    updates[`duels/${duelId}/${mySlot}Answered/${currentRound}_${qIndex}`]=true;
    await update(ref(db),updates);

    const qPerRound = duel.questionsPerRound;
    setTimeout(async()=>{
      if(qIndex+1>=qPerRound){
        // Round done for me
        const newTotal = (duel[`${mySlot}TotalScore`]??0)+newRound;
        await update(ref(db,`duels/${duelId}`),{
          [`${mySlot}TotalScore`]:newTotal,
          [`${mySlot}RoundDone_${currentRound}`]:true,
        });
        setMyTotalScore(newTotal);
        // Check if other player also done
        const snap = await get(ref(db,`duels/${duelId}`));
        const d=snap.val();
        const otherSlot:Slot=mySlot==="p1"?"p2":"p1";
        if(d[`${otherSlot}RoundDone_${currentRound}`]){
          await advanceRound(d,newTotal);
        } else {
          // Wait for them — show waiting screen (still "game" but answers disabled)
        }
      } else {
        const next=questions[qIndex+1];
        setQIndex(qIndex+1);
        setOptions(shuffle([next.a,...next.w]));
        setSelected(null);
        setTimeLeft(TIMER_PER_Q);
        answerRef.current=false;
      }
    },900);
  },[duel,mySlot,duelId,qIndex,currentRound]);

  async function advanceRound(d:any,myNewTotal:number) {
    if(!duelId||!mySlot) return;
    const totalRounds = d.rounds.length;
    const nextRound = currentRound+1;
    if(nextRound>=totalRounds){
      // Game over
      await update(ref(db,`duels/${duelId}`),{status:"done"});
      await saveDuelResult(d,myNewTotal);
      setScreen("result");
      return;
    }
    // Break time
    setScreen("break");
    setCurrentRound(nextRound);
    setMyRoundScore(0); myRoundRef.current=0;
    setTheirRoundScore(0);
    const bTime = d.breakTime;
    let b=bTime; setBreakLeft(b);
    breakTimerRef.current=setInterval(()=>{
      b--; setBreakLeft(b);
      if(b<=0){
        clearInterval(breakTimerRef.current);
        setQIndex(0); setSelected(null); setTimeLeft(TIMER_PER_Q);
        answerRef.current=false;
        setScreen("game");
      }
    },1000);
  }

  // Listen for other player finishing round
  useEffect(()=>{
    if(screen!=="game"||!duel||!mySlot||!duelId) return;
    const otherSlot:Slot=mySlot==="p1"?"p2":"p1";
    const myDone = duel[`${mySlot}RoundDone_${currentRound}`];
    const theirDone = duel[`${otherSlot}RoundDone_${currentRound}`];
    if(myDone&&theirDone){
      const myTotal = duel[`${mySlot}TotalScore`]??myTotalScore;
      advanceRound(duel,myTotal);
    }
  },[duel,screen]);

  async function saveDuelResult(d:any,myTotal:number) {
    if(!user||!mySlot) return;
    const otherSlot:Slot=mySlot==="p1"?"p2":"p1";
    const theirTotal = d[`${otherSlot}TotalScore`]??0;
    const result = myTotal>theirTotal?"win":myTotal<theirTotal?"loss":"draw";
    await update(ref(db,`users/${user.uid}`),{
      duelWins:   (userData?.duelWins  ||0)+(result==="win" ?1:0),
      duelLosses: (userData?.duelLosses||0)+(result==="loss"?1:0),
      duelDraws:  (userData?.duelDraws ||0)+(result==="draw"?1:0),
      duelsPlayed:(userData?.duelsPlayed||0)+1,
    });
    remove(ref(db,`duelQueue/${user.uid}`));
  }

  async function acceptChallenge(challenge:any) {
    if(!user||!userData) return;
    const myName = userData.username||user.displayName?.split(" ")[0]||"Player";
    const s = challenge.settings;
    const roundQuestions = Array.from({length:s.rounds},()=>shuffle(ALL_Q).slice(0,s.questionsPerRound));
    const id=`${challenge.fromUid}_${user.uid}_${Date.now()}`;
    const duelData={
      id, status:"countdown",
      p1:{uid:challenge.fromUid,name:challenge.fromName,photoURL:challenge.fromPhoto||null,badge:challenge.fromBadge||null},
      p2:{uid:user.uid,name:myName,photoURL:userData.photoURL||user.photoURL||null,badge:userData.badge||null},
      rounds:roundQuestions.map((qs:any[])=>({questions:qs})),
      questionsPerRound:s.questionsPerRound,
      breakTime:s.breakTime,
      p1TotalScore:0,p2TotalScore:0,
      p1RoundScore:0,p2RoundScore:0,
      createdAt:Date.now(),
    };
    await set(ref(db,`duels/${id}`),duelData);
    // Notify challenger
    await set(ref(db,`duelChallenges/${challenge.fromUid}/${user.uid}/acceptedDuelId`),id);
    await remove(ref(db,`duelChallenges/${user.uid}/${challenge.fromUid}`));
    setDuelId(id); setMySlot("p2"); setDuel(duelData);
    setCurrentRound(0); setMyTotalScore(0); setTheirTotalScore(0);
    const firstQ = duelData.rounds[0].questions[0];
    setOptions(shuffle([firstQ.a,...firstQ.w]));
    startCountdown(duelData,"p2",id);
  }

  async function declineChallenge(challenge:any) {
    await remove(ref(db,`duelChallenges/${user!.uid}/${challenge.fromUid}`));
    setIncomingChallenges(c=>c.filter(x=>x.fromUid!==challenge.fromUid));
  }

  // Challenger polls for acceptance
  useEffect(()=>{
    if(!user||screen!=="searching") return;
    // Poll duelChallenges for my sent challenge being accepted
    const myRef = ref(db,`duelChallenges`);
    // Just listening is enough — handled in findMatch logic
  },[screen,user?.uid]);

  async function findMatch() {
    if(!user||!userData) return;
    setScreen("searching");
    const myName=userData.username||user.displayName?.split(" ")[0]||"Player";
    const myBest=userData.bestScore||0;
    const settings={rounds,questionsPerRound,breakTime,isRandom};

    await set(ref(db,`duelQueue/${user.uid}`),{
      uid:user.uid,name:myName,bestScore:myBest,
      photoURL:userData.photoURL||user.photoURL||null,
      badge:userData.badge||null,
      settings, joinedAt:Date.now(),
    });

    const snap=await get(ref(db,"duelQueue"));
    if(snap.exists()){
      const queue:any[]=Object.values(snap.val()).filter((p:any)=>p.uid!==user.uid);
      const compatible = queue.filter((p:any)=>{
        if(Date.now()-p.joinedAt>60000) return false;
        if(isRandom||p.settings?.isRandom) return true; // random matches anyone
        return p.settings?.rounds===rounds&&p.settings?.questionsPerRound===questionsPerRound&&p.settings?.breakTime===breakTime;
      }).sort((a:any,b:any)=>Math.abs(a.bestScore-myBest)-Math.abs(b.bestScore-myBest));

      const match=compatible[0];
      if(match){
        const effectiveRounds = isRandom&&match.settings?.isRandom ? Math.floor(Math.random()*8)+3 : rounds;
        const effectiveQPR = isRandom&&match.settings?.isRandom ? [10,20,30][Math.floor(Math.random()*3)] : questionsPerRound;
        const effectiveBreak = isRandom&&match.settings?.isRandom ? [5,10,20,30][Math.floor(Math.random()*4)] : breakTime;
        const roundQuestions=Array.from({length:effectiveRounds},()=>shuffle(ALL_Q).slice(0,effectiveQPR));
        const id=`${user.uid}_${match.uid}_${Date.now()}`;
        const duelData={
          id,status:"countdown",
          p1:{uid:user.uid,name:myName,photoURL:userData.photoURL||user.photoURL||null,badge:userData.badge||null},
          p2:{uid:match.uid,name:match.name,photoURL:match.photoURL||null,badge:match.badge||null},
          rounds:roundQuestions.map((qs:any[])=>({questions:qs})),
          questionsPerRound:effectiveQPR,
          breakTime:effectiveBreak,
          p1TotalScore:0,p2TotalScore:0,
          p1RoundScore:0,p2RoundScore:0,
          createdAt:Date.now(),
        };
        await set(ref(db,`duels/${id}`),duelData);
        await update(ref(db,`duelQueue/${match.uid}`),{matchedDuelId:id});
        await remove(ref(db,`duelQueue/${user.uid}`));
        setDuelId(id); setMySlot("p1"); setDuel(duelData);
        setCurrentRound(0); setMyTotalScore(0); setTheirTotalScore(0);
        const firstQ=duelData.rounds[0].questions[0];
        setOptions(shuffle([firstQ.a,...firstQ.w]));
        startCountdown(duelData,"p1",id);
        return;
      }
    }

    // Wait for match
    const queueRef=ref(db,`duelQueue/${user.uid}`);
    const unsub=onValue(queueRef,async snap=>{
      if(!snap.exists()) return;
      const data=snap.val();
      if(data.matchedDuelId){
        off(queueRef);
        const dSnap=await get(ref(db,`duels/${data.matchedDuelId}`));
        if(!dSnap.exists()) return;
        const d=dSnap.val();
        setDuelId(data.matchedDuelId); setMySlot("p2"); setDuel(d);
        setCurrentRound(0); setMyTotalScore(0); setTheirTotalScore(0);
        const firstQ=d.rounds[0].questions[0];
        setOptions(shuffle([firstQ.a,...firstQ.w]));
        await remove(ref(db,`duelQueue/${user.uid}`));
        startCountdown(d,"p2",data.matchedDuelId);
      }
    });

    searchTimeoutRef.current=setTimeout(async()=>{
      off(queueRef);
      await remove(ref(db,`duelQueue/${user.uid}`));
      setScreen("settings");
    },30000);
  }

  // Timer effect
  useEffect(()=>{
    if(screen!=="game"||selected!==null||!duel) return;
    timerRef.current=setInterval(()=>{
      setTimeLeft(t=>{
        if(t<=1){clearInterval(timerRef.current);handleAnswer("__timeout__");return 0;}
        return t-1;
      });
    },1000);
    return ()=>clearInterval(timerRef.current);
  },[screen,qIndex,selected,duel,currentRound]);

  function resetDuel(){
    clearInterval(timerRef.current);
    clearInterval(breakTimerRef.current);
    if(searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setScreen("home"); setDuelId(null); setDuel(null); setMySlot(null);
    setCurrentRound(0); setQIndex(0); setSelected(null);
    setMyRoundScore(0); setTheirRoundScore(0);
    setMyTotalScore(0); setTheirTotalScore(0);
    myRoundRef.current=0; answerRef.current=false;
  }

  const myName=userData?.username||user?.displayName?.split(" ")[0]||"You";
  const theirSlot:Slot=mySlot==="p1"?"p2":"p1";
  const theirName=duel?.[theirSlot]?.name||"Opponent";
  const totalRounds=duel?.rounds?.length||rounds;
  const qPerRound=duel?.questionsPerRound||questionsPerRound;
  const q=duel?.rounds?.[currentRound]?.questions?.[qIndex];

  const SettingPill=({label,active,onClick}:{label:string;active:boolean;onClick:()=>void})=>(
    <button onClick={onClick} style={{
      background:active?"rgba(99,102,241,0.25)":"rgba(255,255,255,0.04)",
      border:`1px solid ${active?"#6366f1":"#2d2d44"}`,
      borderRadius:99,color:active?"#a5b4fc":"#6b7280",
      fontSize:13,fontWeight:700,padding:"7px 14px",cursor:"pointer",flexShrink:0,
    }}>{label}</button>
  );

  if(authLoading) return(
    <div style={{minHeight:"100vh",background:"#0f0f1a",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#6b7280"}}>Loading…</div>
    </div>
  );

  if(!user) return(
    <div style={{minHeight:"100vh",background:"#0f0f1a",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:20,padding:"32px 28px",maxWidth:360,textAlign:"center" as const,color:"#fff"}}>
        <div style={{fontSize:40,marginBottom:12}}>⚔️</div>
        <div style={{fontSize:"1.3rem",fontWeight:900,marginBottom:8}}>Duels</div>
        <div style={{color:"#6b7280",fontSize:14,marginBottom:24}}>Sign in to challenge other players</div>
        <button onClick={()=>signInWithPopup(auth,googleProvider)}
          style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"none",borderRadius:10,color:"#1f2937",fontSize:14,fontWeight:700,padding:"10px 20px",cursor:"pointer",margin:"0 auto"}}>
          <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.7 29.3 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 16.3 3 9.7 7.9 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.3 0 10.2-1.9 13.9-5.1l-6.4-5.4C29.6 36.1 26.9 37 24 37c-5.2 0-9.6-3.3-11.3-8H6.2C9.5 38.9 16.2 45 24 45z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.4 5.4C41.2 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
          Sign in with Google
        </button>
        <a href="/" style={{display:"block",marginTop:16,color:"#6b7280",fontSize:13}}>← Back to TrivQuic</a>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"#0f0f1a",color:"#fff",display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 16px"}}>

      {showChallenge&&user&&userData&&(
        <ChallengeFriendModal user={user} userData={userData} settings={{rounds,questionsPerRound,breakTime}} onClose={()=>setShowChallenge(false)}/>
      )}

      {/* Incoming challenge notifications */}
      {incomingChallenges.length>0&&screen==="home"&&(
        <div style={{width:"100%",maxWidth:480,marginBottom:16}}>
          {incomingChallenges.map(ch=>(
            <div key={ch.fromUid} style={{background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:14,padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14}}>{ch.fromName} challenged you!</div>
                <div style={{fontSize:12,color:"#6b7280"}}>{ch.settings?.rounds}R · {ch.settings?.questionsPerRound}Q · {ch.settings?.breakTime}s break</div>
              </div>
              <button onClick={()=>acceptChallenge(ch)} style={{background:"linear-gradient(135deg,#10b981,#059669)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:13,padding:"8px 14px",cursor:"pointer"}}>Accept</button>
              <button onClick={()=>declineChallenge(ch)} style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.4)",borderRadius:8,color:"#ef4444",fontWeight:700,fontSize:13,padding:"8px 12px",cursor:"pointer"}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* HOME */}
      {screen==="home"&&(
        <div style={{width:"100%",maxWidth:480,textAlign:"center"}}>
          <a href="/" style={{display:"block",color:"#6b7280",fontSize:13,marginBottom:24,textDecoration:"none"}}>← Back</a>
          <div style={{fontSize:48,marginBottom:12}}>⚔️</div>
          <h1 style={{fontSize:"2rem",fontWeight:900,margin:"0 0 8px",background:"linear-gradient(135deg,#6366f1,#a855f7)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Duels</h1>
          <p style={{color:"#6b7280",marginBottom:32}}>1v1 real-time trivia. Matched by skill.</p>

          {userData&&(
            <div style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:16,padding:"16px 20px",marginBottom:24}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
                {[["Played",userData.duelsPlayed||0,"#e5e7eb"],["Wins",userData.duelWins||0,"#10b981"],["Losses",userData.duelLosses||0,"#ef4444"],["Draws",userData.duelDraws||0,"#6b7280"]].map(([l,v,col])=>(
                  <div key={l as string} style={{textAlign:"center"}}>
                    <div style={{fontSize:22,fontWeight:900,color:col as string}}>{v as number}</div>
                    <div style={{fontSize:10,color:"#4b5563",textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={()=>setScreen("settings")} style={{width:"100%",background:"linear-gradient(135deg,#6366f1,#a855f7)",border:"none",borderRadius:14,color:"#fff",fontSize:"1.1rem",fontWeight:900,padding:"18px",cursor:"pointer",marginBottom:12}}>
            Find a Match ⚔️
          </button>
          <button onClick={()=>{setScreen("settings");setTimeout(()=>setShowChallenge(true),100);}} style={{width:"100%",background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:14,color:"#a5b4fc",fontSize:"1rem",fontWeight:700,padding:"14px",cursor:"pointer"}}>
            Challenge a Friend 👥
          </button>
        </div>
      )}

      {/* SETTINGS */}
      {screen==="settings"&&(
        <div style={{width:"100%",maxWidth:480}}>
          <button onClick={()=>setScreen("home")} style={{background:"transparent",border:"none",color:"#6b7280",fontSize:13,cursor:"pointer",marginBottom:20,padding:0}}>← Back</button>
          <h2 style={{fontSize:"1.4rem",fontWeight:900,marginBottom:20,textAlign:"center"}}>⚔️ Duel Settings</h2>

          <div style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:16,padding:"18px 20px",marginBottom:14}}>
            <div style={{fontSize:11,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Matchmaking mode</div>
            <div style={{display:"flex",gap:8}}>
              <SettingPill label="🎯 Custom" active={!isRandom} onClick={()=>setIsRandom(false)}/>
              <SettingPill label="🎲 Random" active={isRandom} onClick={()=>setIsRandom(true)}/>
            </div>
            {isRandom&&<div style={{fontSize:12,color:"#4b5563",marginTop:8}}>Random matches you with anyone regardless of settings — rounds and questions are randomized.</div>}
          </div>

          {!isRandom&&(<>
            <div style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:16,padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:11,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Rounds (3–10)</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
                {ROUND_COUNT_OPTIONS.map(r=><SettingPill key={r} label={`${r}`} active={rounds===r} onClick={()=>setRounds(r)}/>)}
              </div>
            </div>
            <div style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:16,padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:11,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Questions per round</div>
              <div style={{display:"flex",gap:6}}>
                {ROUND_OPTIONS.map(r=><SettingPill key={r} label={`${r}Q`} active={questionsPerRound===r} onClick={()=>setQuestionsPerRound(r)}/>)}
              </div>
            </div>
            <div style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:16,padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:11,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Break between rounds</div>
              <div style={{display:"flex",gap:6}}>
                {BREAK_OPTIONS.map(b=><SettingPill key={b} label={`${b}s`} active={breakTime===b} onClick={()=>setBreakTime(b)}/>)}
              </div>
            </div>
          </>)}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:4}}>
            <button onClick={findMatch} style={{background:"linear-gradient(135deg,#6366f1,#a855f7)",border:"none",borderRadius:14,color:"#fff",fontSize:"1rem",fontWeight:900,padding:"16px",cursor:"pointer"}}>
              Find Match ⚔️
            </button>
            <button onClick={()=>setShowChallenge(true)} style={{background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:14,color:"#a5b4fc",fontSize:"1rem",fontWeight:700,padding:"16px",cursor:"pointer"}}>
              Challenge Friend 👥
            </button>
          </div>
        </div>
      )}

      {/* SEARCHING */}
      {screen==="searching"&&(
        <div style={{textAlign:"center",marginTop:80,width:"100%",maxWidth:480}}>
          <div style={{fontSize:48,marginBottom:16}}>🔍</div>
          <div style={{fontSize:"1.3rem",fontWeight:900,marginBottom:8}}>Finding your match…</div>
          <div style={{color:"#6b7280",marginBottom:8}}>
            {isRandom?"Matching with anyone available":"Looking for players with same settings"}
          </div>
          <div style={{color:"#4b5563",fontSize:13,marginBottom:32}}>
            {!isRandom&&`${rounds} rounds · ${questionsPerRound}Q · ${breakTime}s break`}
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:32}}>
            {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",opacity:0.4+(i*0.3)}}/>) }
          </div>
          <button onClick={()=>{if(searchTimeoutRef.current)clearTimeout(searchTimeoutRef.current);remove(ref(db,`duelQueue/${user.uid}`));setScreen("settings");}}
            style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.4)",borderRadius:10,color:"#ef4444",fontWeight:700,padding:"10px 24px",cursor:"pointer"}}>
            Cancel
          </button>
        </div>
      )}

      {/* COUNTDOWN */}
      {screen==="countdown"&&duel&&(
        <div style={{textAlign:"center",marginTop:40,width:"100%",maxWidth:480}}>
          <div style={{fontSize:13,color:"#6b7280",marginBottom:20,textTransform:"uppercase",letterSpacing:"0.1em"}}>
            {totalRounds} rounds · {qPerRound}Q each · {duel.breakTime}s break
          </div>
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:isMobile?12:24,marginBottom:32}}>
            <div style={{textAlign:"center"}}>
              <Avatar src={duel.p1.photoURL} name={duel.p1.name} size={isMobile?48:60} color={mySlot==="p1"?"#f59e0b":"#6366f1"}/>
              <div style={{fontWeight:700,fontSize:13,marginTop:8,display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>{duel.p1.name}<Badge badge={duel.p1.badge}/></div>
            </div>
            <div style={{fontSize:72,fontWeight:900,color:"#f59e0b",minWidth:60}}>{countdown}</div>
            <div style={{textAlign:"center"}}>
              <Avatar src={duel.p2.photoURL} name={duel.p2.name} size={isMobile?48:60} color={mySlot==="p2"?"#f59e0b":"#6366f1"}/>
              <div style={{fontWeight:700,fontSize:13,marginTop:8,display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>{duel.p2.name}<Badge badge={duel.p2.badge}/></div>
            </div>
          </div>
          <div style={{color:"#6b7280"}}>Get ready!</div>
        </div>
      )}

      {/* BREAK */}
      {screen==="break"&&duel&&(
        <div style={{textAlign:"center",marginTop:40,width:"100%",maxWidth:480}}>
          <div style={{fontSize:13,color:"#a5b4fc",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>
            Round {currentRound} Complete
          </div>
          <div style={{fontSize:13,color:"#6b7280",marginBottom:24}}>
            Round {currentRound+1} of {totalRounds} starts in…
          </div>
          <div style={{fontSize:80,fontWeight:900,color:"#6366f1",marginBottom:24}}>{breakLeft}</div>
          {/* Round scores */}
          <div style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:16,padding:"16px 20px",marginBottom:16}}>
            <div style={{fontSize:11,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:12}}>Total Scores</div>
            <div style={{display:"flex",justifyContent:"space-around",alignItems:"center"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:32,fontWeight:900,color:"#f59e0b"}}>{myTotalScore}</div>
                <div style={{fontSize:12,color:"#6b7280"}}>{myName}</div>
              </div>
              <div style={{fontSize:20,color:"#4b5563",fontWeight:900}}>VS</div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:32,fontWeight:900,color:"#6366f1"}}>{theirTotalScore}</div>
                <div style={{fontSize:12,color:"#6b7280"}}>{theirName}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GAME */}
      {screen==="game"&&duel&&q&&(
        <div style={{width:"100%",maxWidth:480}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,fontSize:12,color:"#6b7280"}}>
            <span>Round {currentRound+1}/{totalRounds}</span>
            <span>Q {qIndex+1}/{qPerRound}</span>
          </div>
          {/* Scoreboard */}
          <div style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <PlayerStrip name={myName} score={myRoundScore} photo={mySlot&&duel[mySlot]?.photoURL} badge={mySlot&&duel[mySlot]?.badge} isMe={true} total={qIndex}/>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0}}>
              <div style={{position:"relative",width:44,height:44}}>
                <svg width="44" height="44" style={{transform:"rotate(-90deg)"}}>
                  <circle cx="22" cy="22" r="18" fill="none" stroke="#0f0f1a" strokeWidth="4"/>
                  <circle cx="22" cy="22" r="18" fill="none"
                    stroke={timeLeft<=2?"#ef4444":timeLeft<=4?"#f59e0b":"#10b981"}
                    strokeWidth="4" strokeDasharray={113} strokeDashoffset={113*(1-timeLeft/TIMER_PER_Q)}
                    style={{transition:"stroke-dashoffset 1s linear,stroke 0.3s"}}/>
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900}}>
                  {selected?"✓":timeLeft}
                </div>
              </div>
              <div style={{fontSize:10,color:"#4b5563",textTransform:"uppercase",letterSpacing:"0.05em"}}>VS</div>
            </div>
            <PlayerStrip name={theirName} score={theirRoundScore} photo={theirSlot&&duel[theirSlot]?.photoURL} badge={theirSlot&&duel[theirSlot]?.badge} isMe={false} total={qIndex}/>
          </div>
          {/* Progress */}
          <div style={{width:"100%",height:3,background:"#1a1a2e",borderRadius:2,marginBottom:16,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${(qIndex/qPerRound)*100}%`,background:"linear-gradient(90deg,#6366f1,#a855f7)",borderRadius:2,transition:"width 0.3s"}}/>
          </div>
          {/* Question */}
          <div style={{background:"#1a1a2e",borderRadius:20,padding:"22px 20px",marginBottom:14,textAlign:"center"}}>
            <div style={{fontSize:"1.15rem",fontWeight:700,lineHeight:1.4}}>{q.q}</div>
          </div>
          {/* Waiting message */}
          {duel[`${mySlot}RoundDone_${currentRound}`]&&(
            <div style={{textAlign:"center",color:"#6b7280",fontSize:14,marginBottom:14}}>
              Waiting for {theirName}…
            </div>
          )}
          {/* Answers */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {options.map((opt,i)=>{
              const isCorrect=opt===q.a;
              const isWrong=selected===opt&&!isCorrect;
              const show=selected!==null;
              return(
                <button key={i} onClick={()=>handleAnswer(opt)}
                  disabled={!!selected||!!duel[`${mySlot}RoundDone_${currentRound}`]}
                  style={{background:show&&isCorrect?"#064e3b":show&&isWrong?"#450a0a":"#1a1a2e",border:`2px solid ${show&&isCorrect?"#10b981":show&&isWrong?"#ef4444":"#2d2d44"}`,borderRadius:14,color:show&&isCorrect?"#10b981":show&&isWrong?"#ef4444":"#e5e7eb",fontSize:"0.95rem",fontWeight:700,padding:isMobile?"16px 12px":"18px 14px",cursor:selected?"default":"pointer",transition:"all 0.2s",lineHeight:1.3}}>
                  {opt}
                </button>
              );
            })}
          </div>
          {selected==="__timeout__"&&(
            <div style={{marginTop:14,color:"#ef4444",fontWeight:700,textAlign:"center"}}>
              ⏰ Too slow! Answer: <span style={{color:"#10b981"}}>{q.a}</span>
            </div>
          )}
        </div>
      )}

      {/* RESULT */}
      {screen==="result"&&duel&&mySlot&&(
        <div style={{width:"100%",maxWidth:480,textAlign:"center"}}>
          {(()=>{
            const myFinal=duel[`${mySlot}TotalScore`]??myTotalScore;
            const theirFinal=duel[`${theirSlot}TotalScore`]??theirTotalScore;
            const win=myFinal>theirFinal; const draw=myFinal===theirFinal;
            return(<>
              <div style={{fontSize:64,marginBottom:8}}>{win?"🏆":draw?"🤝":"💀"}</div>
              <h2 style={{fontSize:"2rem",fontWeight:900,margin:"0 0 24px",color:win?"#f59e0b":draw?"#6b7280":"#ef4444"}}>
                {win?"You Win!":draw?"Draw!":"You Lost"}
              </h2>
              <div style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:16,padding:"16px 20px",marginBottom:24}}>
                <div style={{fontSize:11,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:12}}>Final Score</div>
                <div style={{display:"flex",justifyContent:"space-around",alignItems:"center"}}>
                  <div>
                    <Avatar src={duel[mySlot].photoURL} name={duel[mySlot].name} size={48} color="#f59e0b"/>
                    <div style={{fontSize:28,fontWeight:900,color:"#f59e0b",marginTop:8}}>{myFinal}</div>
                    <div style={{fontSize:12,color:"#6b7280"}}>{duel[mySlot].name}</div>
                  </div>
                  <div style={{fontSize:20,color:"#4b5563",fontWeight:900}}>VS</div>
                  <div>
                    <Avatar src={duel[theirSlot].photoURL} name={duel[theirSlot].name} size={48} color="#6366f1"/>
                    <div style={{fontSize:28,fontWeight:900,color:"#6366f1",marginTop:8}}>{theirFinal}</div>
                    <div style={{fontSize:12,color:"#6b7280"}}>{duel[theirSlot].name}</div>
                  </div>
                </div>
                <div style={{fontSize:12,color:"#4b5563",marginTop:12}}>{totalRounds} rounds · {qPerRound}Q each</div>
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap" as const}}>
                <button onClick={()=>{resetDuel();setScreen("settings");}}
                  style={{background:"linear-gradient(135deg,#6366f1,#a855f7)",border:"none",borderRadius:12,color:"#fff",fontSize:"1rem",fontWeight:800,padding:"14px 22px",cursor:"pointer"}}>
                  Play Again ⚔️
                </button>
                <button onClick={resetDuel}
                  style={{background:"#1a1a2e",border:"1px solid #2d2d44",borderRadius:12,color:"#9ca3af",fontSize:"1rem",fontWeight:600,padding:"14px 22px",cursor:"pointer"}}>
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
