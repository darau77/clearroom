import bankData from '../backend/data/drill-bank.json' with { type: 'json' };
import { drillSets, normaliseAnswer, validDrillSession, type DrillKind, type DrillQuestion, type DrillSession, type DrillSet, type SkillId } from './drills.ts';

export type CourseUnit={id:SkillId;title:string;description:string;tip:string;color:string};
export type CourseLesson={id:string;unitId:SkillId;kind:DrillKind;title:string;level:number;index:number};
type Bank={version:number;units:CourseUnit[];questions:DrillQuestion[]};
const bank=bankData as unknown as Bank;
export const courseUnits=bank.units;
export const questionBank=bank.questions;
export const BANK_VERSION=bank.version;
const order:DrillKind[]=['blank','choose','build','write'];
const lessonNames:Record<DrillKind,string>={blank:'Notice the pattern',choose:'Choose with care',build:'Build your response',write:'Make it your own'};
export const courseLessons:CourseLesson[]=courseUnits.flatMap((unit,u)=>order.map((kind,k)=>({id:`${unit.id}-${kind}`,unitId:unit.id,kind,title:lessonNames[kind],level:kind==='write'?3:kind==='build'?2:1,index:u*4+k})));
const DAY=24*60*60*1000;

export function usableHistory(history:DrillSession[],now=new Date()){
 const seen=new Set<string>();
 return history.filter(s=>{if(!validDrillSession(s)||seen.has(s.id)||Date.parse(s.date)>now.getTime())return false;seen.add(s.id);return true;}).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
export function courseProgress(history:DrillSession[],now=new Date()){
 const completed=new Set(usableHistory(history,now).filter(s=>s.mode==='course'&&courseLessons.some(l=>l.id===s.lessonId&&l.kind===s.kind&&l.unitId===s.unitId)).map(s=>s.lessonId!));
 const next=courseLessons.find(l=>!completed.has(l.id));
 return {completed,next,finished:!next,units:courseUnits.map(unit=>({...unit,completed:courseLessons.filter(l=>l.unitId===unit.id&&completed.has(l.id)).length})),unlocked:(lesson:CourseLesson)=>lesson.index===0||completed.has(lesson.id)||completed.has(courseLessons[lesson.index-1].id)};
}
export type CourseProgress=ReturnType<typeof courseProgress>;
export type QuestionMemory={seen:number;lastAt:number;streak:number;dueAt:number;needsReview:boolean};
export function questionMemory(history:DrillSession[],now=new Date()){
 const memory=new Map<string,QuestionMemory>();
 for(const session of usableHistory(history,now))for(const outcome of session.outcomes||[]){
  const old=memory.get(outcome.questionId);const confident=outcome.firstTry&&!outcome.hintUsed&&outcome.assessment!=='self';
  const streak=confident?(old?.streak||0)+1:0;const at=Date.parse(session.date);
  // A transparent review schedule, not a claim of measured communication ability.
  const wait=confident?[1,3,7,14][Math.min(streak-1,3)]*DAY:4*60*60*1000;
  memory.set(outcome.questionId,{seen:(old?.seen||0)+1,lastAt:at,streak,dueAt:at+wait,needsReview:!confident});
 }
 return memory;
}
export function validPracticeQuestion(q:DrillQuestion,kind:DrillKind){
 if(!q||typeof q.id!=='string'||!q.id||q.id.length>160||typeof q.context!=='string'||!q.context.trim()||q.context.length>1200||typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>800||typeof q.answer!=='string'||!q.answer.trim()||q.answer.length>800||typeof q.explanation!=='string'||!q.explanation.trim())return false;
 if(kind==='blank'||kind==='choose')return Array.isArray(q.options)&&q.options.length===3&&q.options.every(o=>typeof o==='string'&&!!o.trim()&&o.length<800)&&new Set(q.options.map(normaliseAnswer)).size===3&&q.options.includes(q.answer)&&(kind!=='blank'||q.prompt.split('___').length===2);
 if(kind==='build')return Array.isArray(q.words)&&q.words.length>1&&q.words.length<=30&&q.words.every(w=>typeof w==='string'&&!!w.trim())&&JSON.stringify([...q.words].sort())===JSON.stringify(q.answer.trim().split(/\s+/).sort());
 return typeof q.rubric==='string'&&q.rubric.trim().length>=10;
}
function reviewPool(history:DrillSession[],now:Date){
 const pool=new Map(questionBank.map(q=>[q.id,q]));
 for(const session of usableHistory(history,now))for(const q of (session.questions||[]).slice(0,3))if(validPracticeQuestion(q,session.kind)&&q.skill&&courseUnits.some(u=>u.id===q.skill))pool.set(q.id,{...q,kind:session.kind});
 return [...pool.values()];
}
export function reviewSummary(history:DrillSession[],now=new Date()){
 const memory=questionMemory(history,now);const pool=reviewPool(history,now);
 const seen=pool.filter(q=>memory.has(q.id));
 const due=seen.filter(q=>memory.get(q.id)!.dueAt<=now.getTime());
 const tricky=seen.filter(q=>memory.get(q.id)!.needsReview);
 const target=[...due,...tricky,...seen][0];
 return {due:due.length,tricky:tricky.length,seen:seen.length,kind:target?.kind||'choose',skill:target?.skill||'observations'};
}
export function shuffled<T>(values:T[],random= Math.random){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function prepareQuestion(q:DrillQuestion,random:()=>number){
 const copy={...q,options:q.options?shuffled(q.options,random):undefined,words:q.words?shuffled(q.words,random):undefined};
 if(copy.words?.join(' ')===copy.answer&&copy.words.length>1)copy.words=[...copy.words.slice(1),copy.words[0]];
 return copy;
}
export function makePractice({kind,skill,history,lessonId,mode='free',level=1,now=new Date(),random=Math.random}:{kind:DrillKind;skill:SkillId;history:DrillSession[];lessonId?:string;mode?:'course'|'review'|'free';level?:number;now?:Date;random?:()=>number}):DrillSet{
 const memory=questionMemory(history,now);const unit=courseUnits.find(u=>u.id===skill)||courseUnits[0];
 const pool=mode==='review'?reviewPool(history,now).filter(q=>q.kind===kind):questionBank.filter(q=>q.kind===kind&&q.skill===skill);
 const ranked=shuffled(pool,random).sort((a,b)=>{
  const score=(q:DrillQuestion)=>{const m=memory.get(q.id);if(mode==='review')return !m?100000:m.dueAt<=now.getTime()?-1000+(m.dueAt-now.getTime())/DAY:m.needsReview?-100:10+m.streak;
   return (m?20+m.seen*3:0)+Math.abs((q.level||1)-level)*2;};
  return score(a)-score(b);
 });
 const selected=ranked.slice(0,3);
 // Once there is a due question, interleave one earlier skill with new material.
 if(mode==='course'&&selected.length===3){const review=questionBank.find(q=>q.kind===kind&&q.skill!==skill&&memory.has(q.id)&&memory.get(q.id)!.dueAt<=now.getTime());if(review)selected[2]=review;}
 if(selected.length!==3)throw new Error('This lesson needs three checked questions. Please choose another lesson.');
 const metadata=drillSets.find(set=>set.id===kind)!;
 return {...metadata,ai:false,lessonId,unitId:unit.id,mode,title:mode==='review'?'Your review session':mode==='course'?`${unit.title} · ${lessonNames[kind]}`:metadata.title,description:unit.description,skill:unit.title,color:unit.color,questions:selected.map(q=>prepareQuestion(q,random))};
}
export function prepareGenerated(set:DrillSet,kind:DrillKind,skill:SkillId,lessonId?:string):DrillSet{
 if(set.id!==kind||!Array.isArray(set.questions)||set.questions.length!==3||new Set(set.questions.map(q=>q.id)).size!==3||set.questions.some(q=>!validPracticeQuestion(q,kind)))throw new Error('The generated lesson did not pass its format checks. Please retry or use the question bank.');
 return {...set,ai:true,unitId:skill,lessonId,mode:lessonId?'course':'free',questions:set.questions.map(q=>prepareQuestion({...q,kind,skill},Math.random))};
}
