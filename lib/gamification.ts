import type { Session } from './practice';
import type { DrillSession } from './drills';
export const DAILY_GOALS = [30,60,90] as const;
export const LESSON_TURNS = 3;
export const lessons = [
 {id:'open',scenario:'deadlines',title:'Open the conversation',skill:'Giving feedback',description:'Name what happened. Make space for their side.',difficulty:'Supportive',goal:'Give clearer feedback',icon:'chat',color:'green'},
 {id:'listen',scenario:'deadlines',title:'Listen beneath the surface',skill:'Curiosity',description:'Ask what is getting in the way before offering a fix.',difficulty:'Balanced',goal:'Listen with curiosity',icon:'ear',color:'green'},
 {id:'boundary',scenario:'promotion',title:'Find your footing',skill:'Setting boundaries',description:'Acknowledge the change from peer to manager.',difficulty:'Supportive',goal:'Set a firm boundary',icon:'flag',color:'blue'},
 {id:'pushback',scenario:'promotion',title:'Stay steady with pushback',skill:'Constructive disagreement',description:'Keep a clear boundary while hearing their concerns.',difficulty:'Challenging',goal:'Set a firm boundary',icon:'shield',color:'blue'},
 {id:'perspective',scenario:'tension',title:'See the other side',skill:'Resolving tension',description:'Separate the facts from assumptions about a teammate.',difficulty:'Balanced',goal:'Listen with curiosity',icon:'heart',color:'purple'},
 {id:'agreement',scenario:'tension',title:'Turn tension into a plan',skill:'Taking action',description:'End with a next step, an owner, and a time.',difficulty:'Challenging',goal:'Agree on next steps',icon:'trophy',color:'purple'},
] as const;
export type Lesson = typeof lessons[number];
export type Badge = {id:string;name:string;description:string;earned:boolean;icon:'star'|'compass'|'repeat'|'flame'|'trophy'};
export function dayNumber(date:Date){return Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000);}
export function gameStats(history:Session[],now=new Date(),dailyGoal=30,drills:DrillSession[]=[]){
 const today=dayNumber(now);const seen=new Set<string>();
 const sessions=history.filter(s=>{if(seen.has(s.id)||!Number.isFinite(Date.parse(s.date))||!Number.isInteger(s.turns)||s.turns<1)return false;seen.add(s.id);return true;}).filter(s=>dayNumber(new Date(s.date))<=today).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 let xp=0,todayXP=0;const completed=new Set<string>();const days=new Set<number>();const counts=new Map<string,number>();let todayFull=0,todayTurns=0;
 for(const s of sessions){const day=dayNumber(new Date(s.date));const full=s.turns>=LESSON_TURNS;let earned=full?30:10;
  if(full){days.add(day);counts.set(s.scenario,(counts.get(s.scenario)||0)+1);if(s.lessonId&&lessons.some(l=>l.id===s.lessonId)&&!completed.has(s.lessonId)){earned+=10;completed.add(s.lessonId);}}
  xp+=earned;if(day===today){todayXP+=earned;todayTurns+=Math.min(s.turns,12);if(full)todayFull++;}
 }
 const drillIds=new Set<string>();let drillCount=0,drillXP=0,todayDrills=0;
 for(const d of drills){if(!d||typeof d.id!=='string'||!d.id||drillIds.has(d.id)||!Number.isFinite(Date.parse(d.date))||!['blank','build','choose','write'].includes(d.kind)||d.total!==3||d.xp!==15||!Number.isInteger(d.firstTry)||d.firstTry<0||d.firstTry>d.total)continue;const day=dayNumber(new Date(d.date));if(day>today)continue;drillIds.add(d.id);drillCount++;drillXP+=15;xp+=15;if(day===today){todayXP+=15;todayDrills++;}}
 const sortedDays=[...days].sort((a,b)=>a-b);let bestStreak=0,run=0,previous=-Infinity;
 for(const d of sortedDays){run=d===previous+1?run+1:1;bestStreak=Math.max(run,bestStreak);previous=d;}
 let streak=0;let cursor=days.has(today)?today:today-1;while(days.has(cursor)){streak++;cursor--;}
 const level=Math.floor(xp/100)+1;const names=['Finding your voice','Building momentum','Showing up','Keeping it going','Making it a habit'];
 const badges:Badge[]=[{id:'first',name:'First step',description:'Finish a practice with 3 turns.',earned:days.size>0,icon:'star'},{id:'again',name:'Try, try again',description:'Finish the same scenario twice with 3 turns each.',earned:[...counts.values()].some(c=>c>=2),icon:'repeat'},{id:'explorer',name:'Conversation explorer',description:'Finish all 3 scenarios with 3 turns each.',earned:counts.size>=3,icon:'compass'},{id:'streak',name:'Three-day spark',description:'Practise 3 days in a row, with 3 turns each day.',earned:bestStreak>=3,icon:'flame'},{id:'path',name:'Pathfinder',description:'Complete all 6 path lessons.',earned:completed.size===lessons.length,icon:'trophy'}];
 return {xp,todayXP,drillXP,drillCount,todayDrills,level,levelXP:xp%100,levelName:names[Math.min(level-1,names.length-1)],completed,streak,bestStreak,badges,days,today,todayFull,todayTurns,dailyGoal,goalMet:todayXP>=dailyGoal,nextLesson:lessons.find(l=>!completed.has(l.id))||lessons[0],week:Array.from({length:7},(_,i)=>{const date=new Date(now);date.setDate(date.getDate()-(6-i));return {label:new Intl.DateTimeFormat('en',{weekday:'narrow'}).format(date),date:date.toLocaleDateString(),done:days.has(dayNumber(date)),today:i===6};})};
}
export type GameStats = ReturnType<typeof gameStats>;
