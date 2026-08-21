import React,{useEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";
import {vocabulary} from "./vocabulary";

const STORE="hsk4-progress-v4";
const SESSION_STORE="hsk4-active-session-v1";
const DAY_TRACK_STORE="hsk4-day-tracker-v1";
const DAY=86400000, intervals=[1,2,4,7,14,30];

const load=()=>{try{return JSON.parse(localStorage.getItem(STORE))||{}}catch{return {}}};
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const loadDayTrack=()=>{try{return JSON.parse(localStorage.getItem(DAY_TRACK_STORE))||{startedOn:null,days:[]}}catch{return {startedOn:null,days:[]}}};
const saveDayTrack=t=>{localStorage.setItem(DAY_TRACK_STORE,JSON.stringify(t));return t};
const dayLabel=n=>`Day ${n}`;
const dayComplete=d=>d?.completedAt!=null;
const updateDayPosition=(track,dayNo,idx,step)=>{
 const days=[...(track.days||[])];
 const i=days.findIndex(d=>d.day===dayNo);
 if(i<0)return track;
 days[i]={...days[i],currentIdx:idx,currentStep:step,lastSavedAt:Date.now()};
 return {...track,days};
};

const loadSession=()=>{try{const x=JSON.parse(localStorage.getItem(SESSION_STORE)); if(!x) return null; if(x.date!==localDate() || !Array.isArray(x.cards) || !x.cards.length) return null; const byId=new Map(vocabulary.map(v=>[String(v.id),v])); const cards=x.cards.map(c=>byId.get(String(c.id))).filter(Boolean); if(!cards.length || x.idx>=cards.length)return null; return {...x,cards};}catch{return null}};
const saveSession=s=>{if(s)localStorage.setItem(SESSION_STORE,JSON.stringify(s));else localStorage.removeItem(SESSION_STORE); return s};
const save=p=>{localStorage.setItem(STORE,JSON.stringify(p));return p};
const st=(p,id)=>p[id]||{status:"new",level:0,seen:0,correct:0,wrong:0,nextReview:0};
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};

function normalize(s){return (s||"").trim().replace(/\s+/g,"")}
function grade(p,id,q){
 const s=st(p,id);
 let l=s.level;
 if(q==="again")l=0;
 else if(q==="hard")l=Math.max(0,l);
 else if(q==="good")l=Math.min(5,l+1);
 else l=Math.min(5,l+2);
 const now=Date.now();
 // "Need review" means the word is immediately placed in the Review Due queue.
 // It is persisted in localStorage, so the count survives closing/reopening the app.
 const nextReview=q==="again" ? now : now+(intervals[l]??30)*DAY;
 return save({...p,[id]:{
   ...s,
   level:l,
   status:l>=5?"mastered":"learning",
   seen:s.seen+1,
   correct:q==="again"?s.correct:s.correct+1,
   wrong:q==="again"?s.wrong+1:s.wrong,
   nextReview,
   lastSeen:now,
   needsReview:q==="again"
 }})
}
function mark(p,id,m){
 const s=st(p,id);
 const now=Date.now();
 return save({...p,[id]:{
   ...s,
   status:m?"mastered":"new",
   level:m?5:0,
   seen:m?Math.max(1,s.seen):s.seen,
   nextReview:m?now+30*DAY:now,
   needsReview:false,
   manual:true,
   lastSeen:now
 }})
}
function downloadBackup(progress){const blob=new Blob([JSON.stringify({app:"HSK4 Trainer",version:6,exportedAt:new Date().toISOString(),progress,dayTrack:loadDayTrack()},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`hsk4-backup-${new Date().toISOString().slice(0,10)}.json`;a.click()}
function restore(file,setProgress){const r=new FileReader();r.onload=e=>{try{const x=JSON.parse(e.target.result);if(!x.progress)throw 0;localStorage.setItem(STORE,JSON.stringify(x.progress));if(x.dayTrack)localStorage.setItem(DAY_TRACK_STORE,JSON.stringify(x.dayTrack));setProgress(x.progress);alert("Backup restored.")}catch{alert("Invalid HSK4 backup.")}};r.readAsText(file)}
function tone(ok){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type="sine";o.frequency.value=ok?740:180;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.24,c.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+(ok?.24:.34));o.start();o.stop(c.currentTime+(ok?.2:.3))}catch{}}

function splitSentences(text){
  const lines=String(text??"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const chinese=lines.filter(x=>/[\u3400-\u9fff]/.test(x));
  const source=chinese.length?chinese:lines;
  const joined=source.join(" ");
  const raw=joined.split(/(?<=[。！？!?])\s*|(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
  return raw.length?raw.slice(0,3):[text||""];
}
function chunkSentence(sentence){
  const clean=(sentence||"").replace(/\s+/g,"").trim();
  const chars=Array.from(clean);
  const chunks=[];
  for(let i=0;i<chars.length;){
    const remain=chars.length-i;
    const n=remain<=4?remain:(Math.random()<0.18?4:3);
    chunks.push(chars.slice(i,i+n).join(""));
    i+=n;
  }
  return chunks.length?chunks:[clean];
}
function makeOrder(sentence){
  const correct=chunkSentence(sentence);
  // Always start P3 in a genuinely scrambled state.
  // A normal random shuffle can occasionally return the exact same order.
  if(correct.length < 2) return {correct,shuffled:[...correct]};
  let shuffled=[...correct];
  for(let attempt=0; attempt<12 && shuffled.every((x,i)=>x===correct[i]); attempt++){
    shuffled=shuffle(correct);
  }
  // Deterministic fallback in the very unlikely event all random attempts match.
  if(shuffled.every((x,i)=>x===correct[i])){
    shuffled=[...correct.slice(1), correct[0]];
  }
  return {correct,shuffled};
}
function blankTarget(sentence,word){
  const i=sentence.indexOf(word);
  return i>=0?sentence.slice(0,i)+"_____ "+sentence.slice(i+word.length):sentence+" _____";
}
function getSuggestions(v){
  return [
    `我觉得${v.word}……`,
    `我们可以用“${v.word}”来谈论……`,
    `昨天我……${v.word}……`,
    `因为……，所以我${v.word}……`
  ];
}

class AppErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){console.error("HSK4 Trainer UI error",error,info)}
 render(){if(this.state.error)return <div style={{padding:40,fontFamily:"sans-serif"}}><h2>Something went wrong</h2><p>{String(this.state.error?.message||this.state.error)}</p><button onClick={()=>location.reload()}>Reload</button></div>;return this.props.children}
}
function App(){
 const initialSession=useMemo(()=>loadSession(),[]);
 const [page,setPage]=useState(initialSession?"study":"home"),[p,setP]=useState(load),[session,setSessionRaw]=useState(initialSession),[query,setQuery]=useState("");
 const setSession=updater=>setSessionRaw(prev=>{const next=typeof updater==="function"?updater(prev):updater; saveSession(next); return next});
 useEffect(()=>{
   if(session){
     saveSession(session);
     if(session.mode==="daily"){
       const track=loadDayTrack();
       saveDayTrack(updateDayPosition(track,session.day,session.idx,session.step));
     }
   }
 },[session]);
 const file=useRef();
 const mastered=vocabulary.filter(v=>st(p,v.id).status==="mastered").length,
 needReview=vocabulary.filter(v=>st(p,v.id).status!=="mastered"&&st(p,v.id).needsReview===true).length,
 untouched=vocabulary.filter(v=>st(p,v.id).seen===0&&st(p,v.id).status!=="mastered"),
 due=vocabulary.filter(v=>st(p,v.id).status!=="new"&&st(p,v.id).nextReview<=Date.now()).length;
 const persist=np=>setP(np);
 const startDayReview=day=>{
   const ids=day?.newIds||[];
   const byId=new Map(vocabulary.map(v=>[String(v.id),v]));
   const cards=ids.map(id=>byId.get(String(id))).filter(Boolean);
   if(!cards.length){alert(`No saved words found for Day ${day?.day||""}.`);return;}
   setSession({mode:"day-review",date:localDate(),day:day.day,cards,idx:0,step:0,typed:"",choice:null,feedback:null,order:null,dragIndex:null,reviewCount:cards.length});
   setPage("study");
 };
 const start=mode=>{
   const today=localDate();
   const saved=loadSession();
   const valid=vocabulary.filter(v=>v.word&&v.meaning&&v.example);
   if(mode==="daily"||mode==="new"){
     let track=loadDayTrack();
     const last=track.days?.[track.days.length-1];
     // Migrate an unfinished V19 new-word session into Day 1.
     if(!track.days?.length && saved?.mode==="new" && saved.cards?.length){
       const ids=saved.cards.map(c=>c.id);
       const day={day:1,date:saved.date||today,reviewIds:[],newIds:ids,startedAt:Date.now(),completedAt:null,reviewDone:false,newDone:false};
       track={startedOn:day.date,days:[day]};saveDayTrack(track);
       const cards=ids.map(id=>valid.find(v=>String(v.id)===String(id))).filter(Boolean);
       setSession({...saved,mode:"daily",date:today,day:1,reviewCount:0,cards});setPage("study");return;
     }
     if(saved?.mode==="daily" && saved?.cards?.length && saved.idx<saved.cards.length){setSession(saved);setPage("study");return;}
     // A Day stays open until all of its review + new cards are finished, even across dates.
     if(last && !dayComplete(last)){
       const ids=[...(last.reviewIds||[]),...(last.newIds||[])];
       const byId=new Map(valid.map(v=>[String(v.id),v]));
       const cards=ids.map(id=>byId.get(String(id))).filter(Boolean);
       if(cards.length){
       const resumeIdx=Math.min(last.currentIdx||0,Math.max(0,cards.length-1));
       const resumeStep=last.currentStep||0;
       setSession({mode:"daily",date:today,day:last.day,cards,idx:resumeIdx,step:resumeStep,typed:"",choice:null,feedback:null,order:null,dragIndex:null,reviewCount:last.reviewIds?.length||0});
       setPage("study");return;
     }
     }
     // Do not create Day 2 on the same calendar day that Day 1 was completed.
     if(last && last.date===today && dayComplete(last)){setPage("progress");return;}
     const dayNo=(track.days?.length||0)+1;
     const previous=last?.newIds||[];
     const pool=valid.filter(v=>st(p,v.id).seen===0&&st(p,v.id).status!=="mastered");
     const newCards=shuffle(pool).slice(0,30);
     if(newCards.length<30){alert(`Only ${newCards.length} new words remain.`);}
     const reviewIds=dayNo>1?previous:[];
     const day={day:dayNo,date:today,reviewIds,newIds:newCards.map(v=>v.id),startedAt:Date.now(),completedAt:null,reviewDone:reviewIds.length===0,newDone:false,currentIdx:0,currentStep:0,lastSavedAt:Date.now()};
     track={startedOn:track.startedOn||today,days:[...(track.days||[]),day]};
     saveDayTrack(track);
     const cards=[...reviewIds.map(id=>valid.find(v=>String(v.id)===String(id))).filter(Boolean),...newCards];
     const next={mode:"daily",date:today,day:dayNo,cards,idx:0,step:0,typed:"",choice:null,feedback:null,order:null,dragIndex:null,reviewCount:reviewIds.length};
     setSession(next);setPage("study");return;
   }
   if(saved?.mode==="review" && saved?.date===today && saved?.cards?.length && saved.idx<saved.cards.length){setSession(saved);setPage("study");return;}
   const pool=valid.filter(v=>st(p,v.id).status!=="new"&&st(p,v.id).nextReview<=Date.now());
   const cards=shuffle(pool).slice(0,30);
   const next={mode:"review",date:today,day:null,cards,idx:0,step:0,typed:"",choice:null,feedback:null,order:null,dragIndex:null,reviewCount:0};
   setSession(next);setPage("study");
 };
 const completeDaily=()=>{
   const track=loadDayTrack();
   const i=(track.days||[]).findIndex(d=>d.day===session.day);
   if(i>=0){
   track.days[i]={...track.days[i],completedAt:Date.now(),reviewDone:true,newDone:true,currentIdx:session.cards.length,currentStep:0,lastSavedAt:Date.now()};
   saveDayTrack(track);
 }
 };
 const advanceCard=()=>{
   if(session.idx+1>=session.cards.length){
     if(session.mode==="daily")completeDaily();
     saveSession(null);setSession(null);setPage("progress");
   }else setSession(s=>({...s,idx:s.idx+1,step:0,typed:"",choice:null,feedback:null,order:null,dragIndex:null}));
 };
 const finish=q=>{const np=grade(p,session.cards[session.idx].id,q);persist(np);advanceCard()};
 const masterFinish=()=>{const np=mark(p,session.cards[session.idx].id,true);persist(np);advanceCard()};
 return <div className="app"><header className="topbar"><button className="brand" onClick={()=>setPage("home")}>HSK4<span>Trainer</span></button><nav>{["home","study","review","vocab","progress","data"].map(k=><button className={page===k?"active":""} key={k} onClick={()=>k==="study"?start("daily"):setPage(k)}>{k==="vocab"?"Vocabulary":k==="data"?"Data":k[0].toUpperCase()+k.slice(1)}</button>)}</nav></header>
 {page==="home"&&<Home mastered={mastered} learning={needReview} untouched={untouched.length} due={due} start={start} track={loadDayTrack()}/>}
 {page==="study"&&session&&<Study s={session} set={setSession} grade={finish} masterFinish={masterFinish} exit={()=>{setPage("home")}}/>}
 {page==="review"&&<Review due={due} start={()=>start("review")}/>}
 {page==="vocab"&&<Vocab q={query} setQ={setQuery} p={p} setP={persist}/>}
 {page==="progress"&&<Progress p={p} mastered={mastered} learning={needReview} untouched={untouched.length} track={loadDayTrack()} startDayReview={startDayReview}/>}
 {page==="data"&&<Data progress={p} file={file} exportB={()=>downloadBackup(p)} importB={e=>restore(e.target.files?.[0],np=>setP(np))}/>}
 </div>
}

function Home({mastered,learning,untouched,due,start,track}){
 const pct=Math.round(mastered/vocabulary.length*100);
 const last=track.days?.[track.days.length-1];
 const today=localDate();
 const active=last?.date===today&&!last.completedAt;
 const dayNo=last?.day||1;
 const reviewCount=active?(last.reviewIds?.length||0):0;
 const newCount=active?(last.newIds?.length||0):0;
 return <main className="container"><section className="hero"><div><p className="eyebrow">HSK 4 • {vocabulary.length} WORDS</p><h1>30 words a day.<br/><em>Actually remember them.</em></h1><p className="sub">Day {dayNo}: review yesterday's 30 first, then learn today's 30. Your daily plan is saved automatically.</p><div className="actions"><button className="primary" onClick={()=>start("daily")}>{active?`Resume Day ${dayNo} →`:`Start Day ${dayNo} →`}</button><button className="secondary" onClick={()=>start("review")}>Extra review ({due})</button></div></div><div className="ring" style={{"--p":`${pct*3.6}deg`}}><div><strong>{pct}%</strong><span>mastered</span></div></div></section><section className="stats"><Stat n={mastered} t="Mastered" c="green"/><Stat n={learning} t="Need Review" c="yellow"/><Stat n={untouched} t="Never studied" c="red"/><Stat n={due} t="Due today" c="blue"/></section><section className="panel daily-today"><div><p className="eyebrow">TODAY'S PLAN</p><h2>Day {dayNo}</h2><div className="daily-mini"><span>↻ Review yesterday <b>{reviewCount}</b></span><span>＋ New words <b>{newCount||30}</b></span><span>✓ Progress <b>Auto-saved</b></span><span>⚑ Need Review <b>{learning}</b></span></div></div></section></main>}
function Stat({n,t,c}){return <div className="stat"><b className={c}>{n}</b><span>{t}</span></div>}

function Study({s,set,grade,masterFinish,exit}){
 const v=s.cards?.[s.idx];
 if(!v)return <main className="container"><section className="panel"><h2>No word available.</h2><button className="primary" onClick={exit}>Back home</button></section></main>;
 const sentences=useMemo(()=>splitSentences(v.example),[v.example]);
 const exampleLines=String(v.example??"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const exampleParts={zh:exampleLines[0]||v.word,pinyin:exampleLines[1]||v.pinyin,meaning:exampleLines[2]||v.meaning};
 const choices=useMemo(()=>shuffle([v.meaning,...shuffle(vocabulary.filter(x=>x.meaning&&x.meaning!==v.meaning).map(x=>x.meaning)).slice(0,3)]),[v.id]);
 const order=s.order;
 const recallRef=useRef(null);
 useEffect(()=>{if(s.step===2&&!s.order){const source=sentences[0]||v.example;set(x=>({...x,order:makeOrder(source)}));}},[s.step,v.id]);
 const Shell=({title,children})=><main className="study container"><div className="study-head"><button className="ghost" onClick={exit}>← Exit</button><span>{s.mode==="daily"?`Day ${s.day} • ${s.idx < (s.reviewCount||0)?"Review":"New"}`:s.mode==="day-review"?`Review Day ${s.day}`:`${s.idx+1} / ${s.cards.length}`}</span></div><div className="progressline"><div style={{width:`${s.idx/s.cards.length*100}%`}}/></div><div className="card"><p className="eyebrow">{title}</p>{children}</div></main>;

 const choose=c=>{
   const ok=c===v.meaning;tone(ok);
   set(x=>({...x,choice:c,feedback:ok?"correct":"wrong"}));
 };
 const checkRecall=()=>{
   const typed=String(recallRef.current?.value ?? "").trim();
   const ok=normalize(typed)===normalize(v.word);
   tone(ok);
   set(x=>({...x,typed,feedback:ok?"correct":"wrong"}));
 };
 const startOrder=()=>{if(!s.order)set(x=>({...x,order:makeOrder(sentences[0]||v.example)}))};
 const move=(from,to)=>{
   const arr=[...(s.order?.shuffled||[])];
   if(from<0||to<0||from>=arr.length||to>=arr.length||from===to)return;
   const [item]=arr.splice(from,1);
   arr.splice(to,0,item);
   set(x=>({...x,order:{...x.order,shuffled:arr},feedback:null,dragIndex:null}));
 };
 const checkOrder=()=>{
   const o=s.order?.shuffled||[];
   const correct=s.order?.correct||[];
   const ok=o.length===correct.length&&o.every((x,i)=>x===correct[i]);
   tone(ok);set(x=>({...x,feedback:ok?"correct":"wrong"}));
 };
 const next=()=>set(x=>({...x,step:x.step+1,typed:"",choice:null,feedback:null,order:null,dragIndex:null}));

 if(s.step===0)return <Shell title="1 • RECOGNITION">
   <h1 className="hanzi">{v.word}</h1>
   <p className="instruction">Choose the correct meaning. You must get it right to continue.</p>
   <div className="choices">{choices.map(c=><button key={c} className={`choice ${s.choice===c?(s.feedback==="correct"?"correct":"wrong"):""}`} onClick={()=>choose(c)}>{c}</button>)}</div>
   {s.feedback==="correct"&&<Feedback ok text="Correct! ✓" detail={<><strong>{v.pinyin}</strong> · {v.meaning}</>}/>}
   {s.feedback==="wrong"&&<Feedback text={`Not quite. Correct answer: ${v.meaning}`} detail="Try again. The pinyin appears after you choose correctly."/>}
   <button className="primary wide" disabled={s.feedback!=="correct"} onClick={next}>Continue →</button>
 </Shell>;

 if(s.step===1)return <Shell title="2 • ACTIVE RECALL">
   <p className="prompt">Chinese word for:</p><h2 className="meaning">{v.meaning}</h2>
   <input
     key={`recall-${v.id}`}
     ref={recallRef}
     className="biginput chinese-input"
     autoFocus
     type="text"
     lang="zh-CN"
     inputMode="text"
     autoComplete="off"
     autoCorrect="off"
     autoCapitalize="off"
     spellCheck="false"
     defaultValue=""
     placeholder="输入中文…"/>
   <button className="primary wide" onClick={checkRecall}>Check answer</button>
   {s.feedback==="correct"&&<Feedback ok text="Correct! ✓" detail={<><strong>{v.word}</strong> · {v.pinyin}</>}/>}
   {s.feedback==="wrong"&&<Feedback text={`Not quite. Answer: ${v.word}`} detail="Fix it and check again."/>}
   <button className="primary wide nextbtn" disabled={s.feedback!=="correct"} onClick={next}>Continue →</button>
 </Shell>;

 if(s.step===2)return <Shell title="3 • SENTENCE ORDER">
   <p className="instruction">Drag the chunks into the correct order to rebuild the sentence.</p>
   <div className="order-source"><b>Example sentence</b><span>Each chunk is about 2–3 characters.</span></div>
   <div className="order-board">
     <div className="order-track" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const from=Number(e.dataTransfer.getData("text/plain"));const to=Number(e.currentTarget.dataset.index);if(Number.isInteger(from)&&Number.isInteger(to))move(from,to)}}>
       {(order?.shuffled||[]).filter(Boolean).map((chunk,i)=><React.Fragment key={`${chunk}-${i}`}>
         {s.dragIndex===i && <div className="drop-preview" aria-hidden="true"/>}
         <div
           className={`drag-chip ${s.dragIndex===i?"selected":""}`}
           draggable
           data-index={i}
           onClick={()=>set(x=>{
             if(x.dragIndex===null)return {...x,dragIndex:i};
             if(x.dragIndex===i)return {...x,dragIndex:null};
             const arr=[...(x.order?.shuffled||[])];
             const [item]=arr.splice(x.dragIndex,1); arr.splice(i,0,item);
             return {...x,order:{...x.order,shuffled:arr},dragIndex:null,feedback:null};
           })}
           onDragStart={e=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(i));set(x=>({...x,dragIndex:i}))}}
           onDragEnd={()=>set(x=>({...x,dragIndex:null}))}
           onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move"}}
           onDrop={e=>{e.preventDefault();e.stopPropagation();const from=Number(e.dataTransfer.getData("text/plain"));if(Number.isInteger(from))move(from,i)}}
         >{chunk}</div>
       </React.Fragment>)}
       {s.dragIndex===null && <div className="drop-end" aria-hidden="true"/>}
     </div>
   </div>
   <div className="drag-hint">↔ Drag a chunk — the insertion point will preview as you move</div>
   <button className="primary wide" onClick={checkOrder}>Check order</button>
   {s.feedback==="correct"&&<div className="answer-reveal"><Feedback ok text="Perfect order! ✓" detail="Your sentence is correct."/><div className="answer-details"><b>{exampleParts.zh}</b><span>{exampleParts.pinyin}</span><small>Meaning: {exampleParts.meaning}</small></div></div>}
   {s.feedback==="wrong"&&<Feedback text="Not yet." detail="Rearrange the chunks and check again."/>}
   <button className="primary wide nextbtn" disabled={s.feedback!=="correct"} onClick={next}>Continue →</button>
 </Shell>;

 return <Shell title="4 • FINISH WORD">
   <h1 className="hanzi small">{v.word}</h1><p className="pinyin">{v.pinyin}</p><h2 className="meaning">{v.meaning}</h2><div className="example example-3lines"><div className="example-zh">{exampleParts.zh}</div><div className="example-pinyin">{exampleParts.pinyin}</div><div className="example-meaning">{exampleParts.meaning}</div></div>
   <p className="instruction">Did you learn this word today?</p>
   <div className="finish-actions">
     <button className="need-review" onClick={()=>{grade("again")}}>Need review<small>Keep it in SRS</small></button>
     <button className="ok-mastered" onClick={masterFinish}>OK ✓<small>Mark as mastered</small></button>
   </div>
 </Shell>;
}
function Feedback({ok,text,detail}){return <div className={`feedback ${ok?"ok":"bad"}`}><b>{text}</b><span>{detail}</span></div>}
function Review({due,start}){return <main className="container narrow"><section className="page-title"><p className="eyebrow">SMART REVIEW</p><h1><em>{due}</em> due.</h1><p>Reviews intentionally repeat words so they stay in memory.</p></section><div className="panel"><button className="primary" disabled={!due} onClick={start}>{due?"Start review →":"Nothing due"}</button></div></main>}
function Vocab({q,setQ,p,setP}){const [filter,setFilter]=useState("all");const counts={all:vocabulary.length,mastered:vocabulary.filter(v=>st(p,v.id).status==="mastered").length,unmastered:vocabulary.filter(v=>st(p,v.id).status!=="mastered").length};const f=vocabulary.filter(v=>{const m=st(p,v.id).status==="mastered";const matches=(v.word+" "+v.pinyin+" "+v.meaning).toLowerCase().includes(q.toLowerCase());return matches&&(filter==="all"||(filter==="mastered"&&m)||(filter==="unmastered"&&!m));});return <main className="container"><div className="page-title"><p className="eyebrow">VOCABULARY</p><h1>Mark what you <em>know.</em></h1><input className="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search Chinese, pinyin, or meaning…"/><div className="vocab-filters" role="tablist" aria-label="Vocabulary filter">{[["all","All"],["mastered","Mastered"],["unmastered","Not mastered"]].map(([key,label])=><button key={key} className={filter===key?"filter-btn active":"filter-btn"} onClick={()=>setFilter(key)}>{label}<span>{counts[key]}</span></button>)}</div></div><div className="wordlist">{f.map(v=>{const m=st(p,v.id).status==="mastered";return <article className="wordrow" key={v.id}><label className="checkcell"><input type="checkbox" checked={m} onChange={e=>setP(mark(p,v.id,e.target.checked))}/><span>{m?"Mastered":"Not mastered"}</span></label><div><b>{v.word}</b><span>{v.pinyin}</span></div><div><strong>{v.meaning}</strong><small>{v.example}</small></div></article>})}{!f.length&&<div className="empty-filter">No words match this filter.</div>}</div></main>}
function Progress({p,mastered,learning,untouched,track,startDayReview}){
 const studied=vocabulary.filter(v=>st(p,v.id).seen>0||st(p,v.id).status==="mastered").length,
 a=Object.values(p).reduce((x,s)=>x+s.seen,0),
 c=Object.values(p).reduce((x,s)=>x+s.correct,0);
 const days=track.days||[];
 return <main className="container"><div className="page-title"><p className="eyebrow">PROGRESS</p><h1>Your learning <em>roadmap.</em></h1><p>Every Day is locked to a saved set of 30 new words. From Day 2 onward, yesterday's 30 are reviewed before today's new 30.</p></div><section className="stats"><Stat n={mastered} t="Mastered" c="green"/><Stat n={learning} t="Need Review" c="yellow"/><Stat n={untouched} t="Never studied" c="red"/><Stat n={a?Math.round(c/a*100)+"%":"—"} t="Recall accuracy" c="blue"/></section><section className="panel"><div style={{width:"100%"}}><h2>Coverage</h2><div className="bar"><div style={{width:`${studied/vocabulary.length*100}%`}}/></div><p>{studied}/{vocabulary.length} studied.</p></div></section><section className="panel day-tracker"><div style={{width:"100%"}}><div className="tracker-head"><div><p className="eyebrow">DAY TRACKER</p><h2>{days.length} day{days.length===1?"":"s"} planned</h2></div><span className="saved-badge">● Auto-saved</span></div><div className="day-list">{days.length?days.map(d=>{
   const total=(d.reviewIds?.length||0)+(d.newIds?.length||0);
   const idx=Math.min(d.currentIdx||0,total);
   const reviewDone=Math.min(idx,d.reviewIds?.length||0);
   const newDone=Math.max(0,idx-(d.reviewIds?.length||0));
   return <div className={`day-row ${d.completedAt?"done":"active"}`} key={d.day}>
     <div className="day-num">{d.day}</div>
     <div className="day-main">
       <strong>Day {d.day}</strong><small>{d.date}</small>
       <div className="day-meta">
         <span>↻ Review {reviewDone}/{d.reviewIds?.length||0}</span>
         <span>＋ New {newDone}/{d.newIds?.length||0}</span>
       </div>
       {!d.completedAt&&<div className="day-progress-track"><div style={{width:`${total?idx/total*100:0}%`}}/></div>}
     </div>
     <div className="day-status">
       {d.completedAt?<><div>✓ Complete</div><button type="button" className="day-review-btn" onClick={()=>startDayReview(d)}>Review Day {d.day} →</button></>:`In progress · ${idx}/${total}`}
     </div>
   </div>
 }):<p>No study days yet. Start Day 1 to create your first saved set.</p>}</div></div></section></main>}
function Data({file,exportB,importB}){return <main className="container narrow"><section className="page-title"><p className="eyebrow">DATA & BACKUP</p><h1>Keep your progress <em>safe.</em></h1><p>Auto-save is on. Export a backup before changing devices or browsers.</p></section><div className="panel block"><h2>Download backup</h2><p>Creates a portable JSON file containing your progress only.</p><button className="primary" onClick={exportB}>Export progress ↓</button></div><div className="panel block"><h2>Restore backup</h2><p>Choose a previously exported HSK4 JSON file.</p><input ref={file} type="file" accept=".json,application/json" onChange={importB}/></div></main>}

createRoot(document.getElementById("root")).render(<AppErrorBoundary><App/></AppErrorBoundary>);
