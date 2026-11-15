'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, CircleHelp, Keyboard, LoaderCircle, MessageCircle, Puzzle, RotateCcw, Sparkles, SpellCheck, Trophy, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { drillSets, drillProgress, checkDrillAnswer, DRILL_XP, type DrillKind, type DrillSession, type DrillSet, type DrillQuestion, type DrillOutcome, type SkillId } from '../lib/drills';
import { courseUnits, courseProgress, makePractice, prepareGenerated, questionBank, reviewSummary, type CourseLesson } from '../lib/drill-course';
import { DrillSounds } from '../lib/drill-sounds';
import { currentStore, setting, settingValue } from '../lib/practice-store';
import type { AvatarLook } from '../lib/custom-partners';
import { PracticePath, TrophyShelf } from './practice-path';
import { DrillGuide } from './drill-guide';

const icons={blank:SpellCheck,build:Puzzle,choose:MessageCircle,write:Keyboard};
export type GenerateOptions={skill:SkillId;level:number;exclude_ids:string[];recent_prompts:string[];signal:AbortSignal};
type Result={correct:boolean;message:string;assessment:'rule'|'ai'|'self';reviewAgain:boolean};
type QueueItem={question:DrillQuestion;review:boolean};
type Props={history:DrillSession[];onComplete:(session:DrillSession,epoch:number)=>Promise<boolean>;onPartners:()=>void;onActiveChange:(active:boolean)=>void;live:boolean;onGenerate:(kind:DrillKind,options:GenerateOptions)=>Promise<DrillSet>;language:string;partnerName:string;partnerId:string;partnerLook?:AvatarLook};

export function SkillDrills({history,onComplete,onPartners,onActiveChange,live,onGenerate,language,partnerName,partnerId,partnerLook}:Props){
 const progress=drillProgress(history);const course=courseProgress(history);const review=reviewSummary(history);
 const [ai,setAI]=useState(false);const [skill,setSkill]=useState<SkillId>('observations');const [level,setLevel]=useState(1);
 const [loading,setLoading]=useState(false);const [problem,setProblem]=useState('');const [fallback,setFallback]=useState<DrillSet|null>(null);
 const [sounds,setSounds]=useState(()=>settingValue<boolean>('clearroom.drillSounds',true));
 const [lesson,setLesson]=useState<DrillSet|null>(null);const [queue,setQueue]=useState<QueueItem[]>([]);const [index,setIndex]=useState(0);
 const [answer,setAnswer]=useState('');const [chosen,setChosen]=useState<number[]>([]);const [result,setResult]=useState<Result|null>(null);
 const [hint,setHint]=useState(false);const [example,setExample]=useState(false);const [usedHint,setUsedHint]=useState(false);
 const [selfReview,setSelfReview]=useState(false);const [selfConfirmed,setSelfConfirmed]=useState(false);
 const [records,setRecords]=useState<Record<string,DrillOutcome>>({});const [done,setDone]=useState(false);const [earned,setEarned]=useState<string[]>([]);
 const busy=useRef(false);const completed=useRef(false);const request=useRef<AbortController|null>(null);const mounted=useRef(true);
 const soundsRef=useRef<DrillSounds|null>(null);const title=useRef<HTMLHeadingElement>(null);const sessionId=useRef('');const epoch=useRef(0);
 const current=queue[index];const question=current?.question;const submitted=lesson?.id==='build'?chosen.map(i=>question!.words![i]).join(' '):answer;
 const firstTry=Object.values(records).filter(r=>r.firstTry).length;

 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();soundsRef.current?.close();};},[]);
 useEffect(()=>{onActiveChange(!!lesson&&!done);return()=>onActiveChange(false);},[lesson,done,onActiveChange]);
 useEffect(()=>{const frame=requestAnimationFrame(()=>title.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[lesson,index,done]);
 function sound(kind:'correct'|'retry'|'complete'|'tap'){if(!sounds)return;if(!soundsRef.current)soundsRef.current=new DrillSounds();void soundsRef.current.play(kind);}
 function resetQuestion(){setAnswer('');setChosen([]);setResult(null);setHint(false);setExample(false);setUsedHint(false);setSelfReview(false);setSelfConfirmed(false);setProblem('');}
 function cancelRequest(){request.current?.abort();request.current=null;busy.current=false;setLoading(false);}
 function start(set:DrillSet){
  cancelRequest();setLesson(set);setQueue(set.questions.map(question=>({question,review:false})));setIndex(0);resetQuestion();setRecords({});setDone(false);setEarned([]);setFallback(null);completed.current=false;sessionId.current=crypto.randomUUID();epoch.current=Number(currentStore().settings.clearedAt||0);sound('tap');window.scrollTo({top:0});
 }
 function exit(){
  if(lesson&&!done&&!window.confirm('Leave this lesson? Your completed lessons stay saved; unfinished answers will be lost.'))return;
  cancelRequest();sessionId.current='';completed.current=false;setLesson(null);setDone(false);resetQuestion();setQueue([]);window.scrollTo({top:0});
 }
 async function choose(kind:DrillKind,unit=skill,targetLevel=level,courseLesson?:CourseLesson,personalized=ai){
  if(busy.current)return;
  const bankSet=makePractice({kind,skill:unit,level:targetLevel,history,lessonId:courseLesson?.id,mode:courseLesson?'course':'free'});
  if(!personalized){start(bankSet);return;}
  busy.current=true;setLoading(true);setProblem('');setFallback(bankSet);sound('tap');
  const controller=new AbortController();request.current=controller;
  const previous=[...history].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  try{
   const generated=await onGenerate(kind,{skill:unit,level:targetLevel,exclude_ids:previous.flatMap(s=>(s.questions||[]).map(q=>q.id)).slice(0,60),recent_prompts:previous.flatMap(s=>(s.questions||[]).map(q=>(q.context+' '+q.prompt).slice(0,500))).slice(0,6),signal:controller.signal});
   if(mounted.current&&!controller.signal.aborted)start(prepareGenerated(generated,kind,unit,courseLesson?.id));
  }catch(e){if(mounted.current&&!controller.signal.aborted)setProblem(e instanceof Error?e.message:'Could not create this variation. Try again or use the question bank.');}
  finally{if(request.current===controller){request.current=null;busy.current=false;if(mounted.current)setLoading(false);}}
 }
 function startCourse(item:CourseLesson,personalized=false){void choose(item.kind,item.unitId,item.level,item,personalized);}
 function startReview(){start(makePractice({kind:review.kind,skill:review.skill,history,mode:'review'}));}
 function recordOutcome(value:{correct:boolean;message:string},assessment:Result['assessment']){
  if(!question||!lesson)return;
  const previous=records[question.id];const attempts=(previous?.attempts||0)+1;const reviewAgain=!value.correct||(!current.review&&usedHint);
  setRecords(all=>({...all,[question.id]:{questionId:question.id,skill:question.skill||lesson.unitId||skill,attempts:Math.min(attempts,100),hintUsed:!!previous?.hintUsed||usedHint,firstTry:previous?.firstTry??(value.correct&&!usedHint&&assessment!=='self'),assessment,resolved:value.correct&&!reviewAgain}}));
  setResult({...value,assessment,reviewAgain});sound(value.correct?'correct':'retry');
 }
 async function check(){
  if(!lesson||!question||result||busy.current||!submitted.trim())return;
  const local=checkDrillAnswer(lesson.id,question,submitted);
  if(lesson.id!=='write'){recordOutcome(local,'rule');return;}
  if(!local.correct){recordOutcome(local,'rule');return;}
  if(!live||selfReview){setSelfReview(true);return;}
  busy.current=true;setLoading(true);setProblem('');const controller=new AbortController();request.current=controller;
  try{
   const response=await fetch('/api/engine/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,answer:submitted,language}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])});
   if(!response.ok){const data=await response.json() as {error?:string};throw new Error(data.error||'The writing check is unavailable. Please retry or use self-review.');}
   const assessment=await response.json() as {correct:boolean;message:string;evidence_quote:string};
   if(typeof assessment.correct!=='boolean'||typeof assessment.message!=='string'||!assessment.message.trim()||typeof assessment.evidence_quote!=='string'||(assessment.evidence_quote&&!submitted.includes(assessment.evidence_quote)))throw new Error('The writing check did not return verified feedback. Please retry.');
   if(!controller.signal.aborted&&mounted.current)recordOutcome({correct:assessment.correct,message:assessment.message+(assessment.evidence_quote?' Your words: “'+assessment.evidence_quote+'”':'')},'ai');
  }catch(e){if(!controller.signal.aborted&&mounted.current)setProblem(e instanceof Error?e.message:'Writing check unavailable.');}
  finally{if(request.current===controller){request.current=null;busy.current=false;if(mounted.current)setLoading(false);}}
 }
 function confirmSelfReview(){if(!selfConfirmed||!checkDrillAnswer('write',question!,submitted).correct)return;recordOutcome({correct:true,message:'You reviewed your response against the goal. This is self-reviewed practice, not an AI assessment.'},'self');}
 async function next(){
  if(!lesson||!result||busy.current)return;
  const rest=queue.slice(index+1);const updated=result.reviewAgain&&!rest.some(item=>item.question.id===question!.id)?[...queue,{question:question!,review:true}]:queue;
  if(index+1<updated.length){setQueue(updated);setIndex(i=>i+1);resetQuestion();window.scrollTo({top:0});return;}
  if(completed.current)return;
  const outcomes=lesson.questions.map(q=>records[q.id]);
  if(outcomes.some(o=>!o?.resolved)){setProblem('A question still needs review. Please finish it before saving this lesson.');return;}
  completed.current=true;busy.current=true;setLoading(true);
  const savingSessionId=sessionId.current;
  const session:DrillSession={id:sessionId.current,date:new Date().toISOString(),kind:lesson.id,total:3,firstTry:outcomes.filter(o=>o.firstTry).length,xp:DRILL_XP,source:lesson.ai?'ai':'authored',lessonId:lesson.lessonId,unitId:lesson.unitId,mode:lesson.mode,outcomes,questions:lesson.questions};
  try{
   const success=await onComplete(session,epoch.current);
   if(!mounted.current||sessionId.current!==savingSessionId)return;
   if(!success){completed.current=false;setProblem('Could not save your lesson. Keep this tab open and press Finish lesson to retry.');return;}
   const after=drillProgress([...history,session]);const before=drillProgress(history);
   const gained=after.trophies.filter(t=>t.tier>(before.trophies.find(b=>b.id===t.id)?.tier||0)).map(t=>['','Bronze','Silver','Gold'][t.tier]+' · '+t.title);
   for(let n=before.pathTrophies;n<after.pathTrophies;n++)gained.push(after.rounds[n].name+' practice trophy');
   setEarned(gained);setDone(true);sound('complete');
  }catch{if(mounted.current&&sessionId.current===savingSessionId){completed.current=false;setProblem('Could not save your lesson. Please retry.');}}
  finally{if(sessionId.current===savingSessionId){busy.current=false;if(mounted.current)setLoading(false);}}
  if(sessionId.current===savingSessionId)window.scrollTo({top:0});
 }
 async function toggleSound(){const value=!sounds;setSounds(value);if(!value)soundsRef.current?.close();try{await setting('clearroom.drillSounds',value);}catch{setProblem('Sound preference could not be saved, but your choice applies to this visit.');}}
 const soundButton=<button className="drill-sound-toggle" onClick={()=>void toggleSound()} aria-pressed={sounds} aria-label={sounds?'Turn practice sounds off':'Turn practice sounds on'}>{sounds?<Volume2 size={18}/>:<VolumeX size={18}/>}<span>Sound {sounds?'on':'off'}</span></button>;
 if(!lesson)return <>
  <div className="learning-heading"><div><p className="eyebrow">A LITTLE PRACTICE, EVERY DAY</p><h1>Find your words. Grow your confidence.</h1><p>Six skills. Twenty-four lessons. Choose any lesson.</p></div>{soundButton}</div>
  <div className="course-intro"><DrillGuide partner={partnerId} look={partnerLook} message="Start with a small pattern. Build toward the conversation you want to have."/><div className="bank-summary"><span><strong>{questionBank.length}</strong>bank questions</span><span><strong>24</strong>guided lessons</span><span><strong>15 XP</strong>per lesson</span></div></div>
  {loading&&<div className="generation-progress" role="status"><LoaderCircle className="spin" size={23}/><div><strong>Creating and checking your three exercises…</strong><p>Qwen is using the question bank and your situation with {partnerName}. This can take a minute or two.</p></div><button className="text-button" onClick={cancelRequest}>Cancel</button></div>}
  {problem&&<div className="notice" role="alert"><p>{problem}</p>{fallback&&<button className="button secondary" onClick={()=>start(fallback)}>Use the question bank <ArrowRight size={16}/></button>}</div>}
  <PracticePath course={course} onStart={item=>startCourse(item)} onPersonalize={item=>startCourse(item,true)} onReview={startReview} review={review} live={live} loading={loading}/>
  <section className="free-practice"><div className="section-heading"><div><p className="eyebrow">PICK YOUR OWN WARM-UP</p><h2>A different way to practise.</h2><p>Explore a skill, or let Qwen create a variation for {partnerName}.</p></div></div><div className="adaptive-controls"><button className={!ai?'chosen':''} aria-pressed={!ai} onClick={()=>setAI(false)}>Question bank</button><button className={ai?'chosen':''} disabled={!live} aria-pressed={ai} onClick={()=>setAI(true)}><Sparkles size={15}/>Qwen variations</button><label className="language-field">Focus<select value={skill} onChange={e=>setSkill(e.target.value as SkillId)}>{courseUnits.map(unit=><option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label><label className="language-field">Challenge<select value={level} onChange={e=>setLevel(Number(e.target.value))}><option value={1}>Foundation</option><option value={2}>Build confidence</option><option value={3}>Stretch yourself</option></select></label></div><div className="drill-modes">{drillSets.map(set=>{const Icon=icons[set.id];return <button className={'drill-mode '+set.color} key={set.id} disabled={loading} onClick={()=>void choose(set.id)}><span className="drill-mode-icon"><Icon size={27}/></span><div className="drill-mode-content"><span>{set.skill}</span><h2>{set.title}</h2><p>{set.id==='write'?'Respond in your own words. Review the meaning, not a required phrase.':set.description}</p><div className="drill-mode-meta"><span>{ai?'3 checked AI variations':'3 questions · rotating selection'}</span><strong>+15 XP</strong></div></div><ChevronRight size={19}/></button>;})}</div></section>
  <TrophyShelf progress={progress}/><div className="drill-to-partner"><MessageCircle size={23}/><div><strong>Bring your practice to life.</strong><p>Try these ideas with an AI partner and hear their response.</p></div><button className="button primary" onClick={onPartners}>Meet your partners <ArrowRight size={17}/></button></div><p className="drill-disclaimer">Questions practise communication choices. Writing uses Qwen when connected, or an explicit self-review. Rewards reflect effort, not a score of your communication ability.</p>
 </>;
 if(done)return <div className="drill-finished"><div className="drill-celebration" aria-hidden="true">{Array.from({length:8},(_,i)=><i key={i} style={{'--piece':i} as React.CSSProperties}/>)}</div><DrillGuide partner={partnerId} look={partnerLook} mood="happy" message="Another small step, and a little more ready for the real conversation."/><p className="eyebrow">ROOM TO GROW</p><h1 ref={title} tabIndex={-1}>Lesson complete!</h1><p>{lesson.title}</p><div className="drill-rewards"><span><Zap size={22}/><strong>+15 XP</strong><small>For finishing</small></span><span><Check size={22}/><strong>{firstTry}/3</strong><small>First try, without hints</small></span><span><RotateCcw size={22}/><strong>{Object.values(records).filter(o=>o.attempts>1||o.hintUsed).length}</strong><small>Revisited &amp; resolved</small></span></div>{earned.length>0&&<div className="new-trophy" role="status"><Trophy size={32}/><div><strong>New trophy unlocked!</strong>{earned.map(t=><p key={t}>{t}</p>)}</div></div>}{Object.values(records).some(o=>o.assessment==='self')&&<p className="game-fineprint">Writing marked as self-reviewed earns effort XP and does not count as a verified first-try answer.</p>}<div className="drill-lesson-takeaway"><Sparkles size={20}/><p>{courseUnits.find(u=>u.id===lesson.unitId)?.tip||'Try these ideas in a real conversation, and adapt to the other person.'}</p></div>{course.next&&<button className="button primary full" onClick={()=>startCourse(course.next!)}>Continue the course <ArrowRight size={18}/></button>}<button className="button secondary full" onClick={onPartners}>Try it with an AI partner <MessageCircle size={17}/></button><button className="button secondary full" onClick={exit}>Back to the practice trail <ArrowRight size={17}/></button><button className="text-button" onClick={()=>start(makePractice({kind:lesson.id,skill:lesson.unitId||skill,history,level,mode:'free'}))}><RotateCcw size={15}/>Another variation from the bank</button></div>;
 return <div className="drill-player">
  <div className="drill-player-top"><button className="icon-button" aria-label="Leave lesson" onClick={exit}><X size={22}/></button><div className="game-meter"><i style={{width:(Object.values(records).filter(o=>o.resolved).length/3*100)+'%'}}/></div><span>{current.review?'REVIEW':(Math.min(index,2)+1)+' / 3'}</span>{soundButton}<span className="drill-xp"><Zap size={15}/>15 XP</span></div>
  <DrillGuide partner={partnerId} look={partnerLook} compact mood={result?.correct?'happy':loading?'thinking':'ready'} message={current.review?'A second look helps it stick. Try this one without the example.':'Take a breath. Read the situation, and focus on what this moment needs.'}/>
  <div className="drill-question-head"><span className="eyebrow">{lesson.ai?'QWEN VARIATION · ':''}{lesson.skill.toUpperCase()}{current.review?' · MISTAKE REVIEW':''}</span><h1 ref={title} tabIndex={-1}>{lesson.id==='blank'?'Complete the sentence.':lesson.id==='build'?'Build your response.':lesson.id==='choose'?'What would you say next?':'Make it your own.'}</h1><p>{question!.context}</p></div>
  <div className="drill-question"><h2>{question!.prompt}</h2>
   {(lesson.id==='blank'||lesson.id==='choose')&&<div className="drill-options" role="group" aria-label="Answer options">{question!.options!.map((option,i)=><button key={option} disabled={!!result||loading} aria-pressed={answer===option} className={answer===option?'selected':''} onClick={()=>setAnswer(option)}><span>{String.fromCharCode(65+i)}</span>{option}{answer===option&&<Check size={18}/>}</button>)}</div>}
   {lesson.id==='build'&&<><div className="sentence-slots" aria-label="Your sentence">{chosen.length===0?<span>Choose the words to build your response.</span>:chosen.map((wordIndex,position)=><button disabled={!!result||loading} key={wordIndex} aria-label={'Remove '+question!.words![wordIndex]+' from position '+(position+1)} onClick={()=>setChosen(list=>list.filter((_,p)=>p!==position))}>{question!.words![wordIndex]}</button>)}</div><div className="word-bank" aria-label="Available words">{question!.words!.map((word,i)=><button key={i} disabled={!!result||loading||chosen.includes(i)} onClick={()=>setChosen(list=>[...list,i])}>{word}</button>)}</div><p className="drill-help">Tap a chosen word to move it back. Punctuation and capitalization are flexible.</p></>}
   {lesson.id==='write'&&<><label className="writing-label" htmlFor="drill-writing">Your response</label><textarea id="drill-writing" value={answer} disabled={!!result||loading} maxLength={600} rows={4} placeholder="Use your own words. There is more than one useful answer…" onChange={e=>{setAnswer(e.target.value);setSelfConfirmed(false);}}/><div className="writing-goal"><strong>What to aim for</strong><p>{question!.rubric}</p></div><p className="drill-help">{live&&!selfReview?'Qwen checks your meaning against this goal, with evidence from your words.':'Compare your response with the goal and example. No automatic meaning assessment is available in self-review.'}</p></>}
   {!result&&<div className="drill-help-actions"><button className="text-button" disabled={loading} onClick={()=>{setHint(!hint);setUsedHint(true);}} aria-expanded={hint}><CircleHelp size={15}/>{hint?'Hide hint':'Show a hint'}</button><button className="text-button" disabled={loading} onClick={()=>{setExample(!example);setUsedHint(true);}} aria-expanded={example}>{example?'Hide example':'Show an example'}</button></div>}
   {hint&&!result&&<div className="drill-example"><strong>A little nudge</strong><p>{question!.hint||question!.rubric||'Focus on the concrete situation and the goal in the question.'}</p></div>}
   {example&&!result&&<div className="drill-example"><strong>One possible answer</strong><p>{question!.answer}</p></div>}
  </div>
  {problem&&<div className="error" role="alert"><p>{problem}</p>{lesson.id==='write'&&!result&&<button className="text-button" onClick={()=>setSelfReview(true)}>Use self-review instead</button>}</div>}
  {loading&&<p className="notice" role="status"><LoaderCircle className="spin" size={16}/>{result?'Saving your lesson…':'Checking the meaning of your response…'}</p>}
  {!result&&lesson.id==='write'&&(selfReview||!live)&&<div className="self-review"><h3>Review your own response</h3><p>Read your words back. Do they meet the goal above without changing the facts or responsibilities?</p><label><input type="checkbox" checked={selfConfirmed} onChange={e=>setSelfConfirmed(e.target.checked)}/>I compared my response with the goal and example.</label><button className="button primary" disabled={!selfConfirmed||!checkDrillAnswer('write',question!,submitted).correct||loading} onClick={confirmSelfReview}>Mark as self-reviewed <Check size={16}/></button></div>}
  {result?<div className={'answer-feedback '+(result.correct?'correct':'retry')} role="status"><div className="answer-feedback-heading">{result.correct?<Check size={22}/>:<RotateCcw size={21}/>}<h3>{result.correct?(result.assessment==='self'?'Reflection complete.':'You’ve got it!'):'Let’s learn from this one.'}</h3></div><p>{result.message}</p><p>{question!.explanation}</p>{!result.correct&&<p className="intended-answer"><strong>One useful answer:</strong> {question!.answer}</p>}{result.reviewAgain&&<p className="review-reminder"><RotateCcw size={14}/>This question will return after the others.</p>}<button className="button primary" disabled={loading} onClick={()=>void next()}>{index===queue.length-1&&!result.reviewAgain?'Finish lesson':current.review&&result.reviewAgain?'Try this one again':'Continue'}<ArrowRight size={17}/></button></div>:!(lesson.id==='write'&&(selfReview||!live))&&<div className="drill-check-row"><span>Take your time. Mistakes are part of practice.</span><button className="button primary" disabled={!submitted.trim()||loading} onClick={()=>void check()}>Check answer <Check size={17}/></button></div>}
 </div>;
}
