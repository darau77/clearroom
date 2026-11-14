export type DrillKind = 'blank' | 'build' | 'choose' | 'write';
export type SkillId = 'observations'|'curiosity'|'empathy'|'boundaries'|'agreements'|'repair';
export type DrillQuestion = { id:string; kind?:DrillKind; skill?:SkillId; level?:number; hint?:string; rubric?:string; prompt:string; context:string; answer:string; explanation:string; options?:string[]; optionFeedback?:Record<string,string>; words?:string[]; acceptedAnswers?:string[]; phrase?:string; minWords?:number };
export type DrillSet = { ai?:boolean; lessonId?:string; unitId?:SkillId; mode?:'course'|'free'|'review'; id:DrillKind; title:string; description:string; skill:string; color:string; questions:DrillQuestion[] };
export type DrillOutcome = { questionId:string; skill:SkillId; attempts:number; hintUsed:boolean; firstTry:boolean; assessment:'rule'|'ai'|'self'; resolved:boolean };
export type DrillSession = { source?:'authored'|'ai'; lessonId?:string; unitId?:SkillId; mode?:'course'|'free'|'review'; outcomes?:DrillOutcome[]; questions?:DrillQuestion[]; id:string; date:string; kind:DrillKind; total:number; firstTry:number; xp:number };
export const DRILL_XP=15;
export const drillSets:DrillSet[]=[
 {id:'blank',title:'Find the missing words',description:'A small change in wording can open a conversation.',skill:'Specific, curious language',color:'green',questions:[
  {id:'blank-1',context:'Alex missed a handoff. Start with what you observed.',prompt:'I noticed the handoff arrived ___.',options:['late again, as usual','on Monday instead of Friday','because you don’t care'],answer:'on Monday instead of Friday',explanation:'A specific observation gives you something to discuss without assuming why it happened.'},
  {id:'blank-2',context:'Your teammate says they are overloaded. Invite their perspective.',prompt:'Can you help me understand ___?',options:['why you always make excuses','what is getting in the way','why everyone else can handle it'],answer:'what is getting in the way',explanation:'An open question invites useful information. An accusation is more likely to close the conversation.'},
  {id:'blank-3',context:'You have agreed to review a draft. Make the next step clear.',prompt:'Let’s review the draft ___ so we can unblock the handoff.',options:['sometime soon','whenever you feel ready','together at 2 pm Thursday'],answer:'together at 2 pm Thursday',explanation:'A specific action and time turn a vague intention into an agreement you can follow up on.'},
 ]},
 {id:'build',title:'Build a better sentence',description:'Put the words in order. Practise a useful opening.',skill:'Clear conversation starters',color:'blue',questions:[
  {id:'build-1',context:'Start with curiosity rather than blame.',prompt:'Build a question about the obstacle.',words:['way?','What','the','in','got'],answer:'What got in the way?',explanation:'This short question makes room for the other person to explain.'},
  {id:'build-2',context:'Move from discussing the problem to making a plan.',prompt:'Build a specific request for agreement.',words:['step?','agree','we','next','Can','a','on'],answer:'Can we agree on a next step?',explanation:'Inviting agreement gives both people a role in moving forward.'},
  {id:'build-3',context:'A former peer is worried about a new process.',prompt:'Build a statement that acknowledges their concern.',words:['concern','the','I','about','hear','your','change.'],answer:'I hear your concern about the change.',explanation:'Acknowledging a concern does not require abandoning your responsibility or agreeing with every point.'},
 ]},
 {id:'choose',title:'Choose your response',description:'Pause at a tricky moment and pick a useful next line.',skill:'Responding under pressure',color:'purple',questions:[
  {id:'choose-1',context:'Jordan says: “We used to decide things together. Now you just tell me what to do.”',prompt:'Which response acknowledges the change and invites a discussion?',options:['I’m the manager now. You need to accept it.','I hear that this feels different. Which decisions would you like more input on?','Fine, you can make all the decisions.'],answer:'I hear that this feels different. Which decisions would you like more input on?',explanation:'You recognise the relationship change and ask a concrete question without giving up responsibility.'},
  {id:'choose-2',context:'Sam says: “Taylor never sends a complete brief.” You have not heard Taylor’s perspective.',prompt:'What is the most useful next question?',options:['Why is Taylor so unreliable?','Should we take Taylor off the project?','What was missing from the most recent brief?'],answer:'What was missing from the most recent brief?',explanation:'A recent example helps distinguish facts from generalisations, while keeping you from taking sides prematurely.'},
  {id:'choose-3',context:'Alex agrees to flag delays earlier, but no one has defined “earlier.”',prompt:'Which reply makes the agreement actionable?',options:['Great, I’m sure it will work out.','Can you flag any risk by Wednesday afternoon, and we’ll decide priorities together?','Just don’t let it happen again.'],answer:'Can you flag any risk by Wednesday afternoon, and we’ll decide priorities together?',explanation:'The reply names a time, an action, and how you will support the follow-through.'},
 ]},
 {id:'write',title:'Put it in your own words',description:'Write a sentence using a helpful conversation pattern.',skill:'From knowing to saying',color:'peach',questions:[
  {id:'write-1',context:'You want to understand why a deadline was missed.',prompt:'Write at least 9 words, starting with “Can you help me understand”.',phrase:'Can you help me understand',minWords:9,answer:'Can you help me understand what delayed the handoff?',explanation:'You used an open-question starter. Now check that the rest of your sentence invites an explanation rather than hiding an accusation.'},
  {id:'write-2',context:'A peer disagrees with your decision. Start by acknowledging what they said.',prompt:'Write at least 7 words, starting with “I hear your concern”.',phrase:'I hear your concern',minWords:7,answer:'I hear your concern about the extra review time.',explanation:'You used an acknowledgement. In a real conversation, refer to the concern they actually expressed.'},
  {id:'write-3',context:'You are ready to agree on a next step.',prompt:'Write at least 8 words, starting with “Can we agree on”.',phrase:'Can we agree on',minWords:8,answer:'Can we agree on a draft review at two tomorrow?',explanation:'You used an agreement starter. Read it back and check whether it includes a clear action, an owner, and a time.'},
 ]},
];
export function normaliseAnswer(value:string){return value.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[.,!?;:]/g,'').trim().replace(/\s+/g,' ');}
export function checkDrillAnswer(kind:DrillKind,q:DrillQuestion,value:string):{correct:boolean;message:string}{
 const answer=normaliseAnswer(value);
 if(kind==='write'){
  if(!q.phrase){
   // Segment words in languages that do not separate them with spaces, too.
   const count=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'word'}).segment(answer)].filter(part=>part.isWordLike&&/\p{L}/u.test(part.segment)).length:(answer.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu)||[]).filter(w=>/\p{L}/u.test(w)).length;
   return {correct:count>=(q.minWords||4),message:count<(q.minWords||4)?'Add enough detail for someone to understand your response.':'Ready for review. Check your meaning against the goal; length alone does not assess your answer.'};
  }
  const phrase=normaliseAnswer(q.phrase||'');
  const starts=answer===phrase||answer.startsWith(phrase+' ');
  const count=answer.split(' ').filter(w=>/[a-z]/i.test(w)).length;
  return {correct:starts&&count>=(q.minWords||1),message:!starts?`Start your sentence with “${q.phrase}”.`:count<(q.minWords||1)?`Add a little context: use at least ${q.minWords} words.`:'Pattern complete. This checks the opening and length, not the quality of your full sentence.'};
 }
 const correct=[q.answer,...(q.acceptedAnswers||[])].some(option=>answer===normaliseAnswer(option));
 return {correct,message:correct?'That response meets this exercise’s goal.':q.optionFeedback?.[value]||'Take another look at the goal. We’ll revisit this question after the others.'};
}
export function validDrillSession(s:unknown):s is DrillSession{
 if(!s||typeof s!=='object')return false;
 const d=s as DrillSession;
 const base=typeof d.id==='string'&&!!d.id&&typeof d.date==='string'&&Number.isFinite(Date.parse(d.date))&&drillSets.some(set=>set.id===d.kind&&set.questions.length===d.total)&&d.xp===DRILL_XP&&Number.isInteger(d.firstTry)&&d.firstTry>=0&&d.firstTry<=d.total;
 if(!base)return false;
 if(d.questions!==undefined&&(!Array.isArray(d.questions)||d.questions.length!==3||d.questions.some(q=>!q||typeof q!=='object'||typeof q.id!=='string'||!q.id)))return false;
 if(d.outcomes!==undefined){if(!Array.isArray(d.outcomes)||d.outcomes.length!==3||new Set(d.outcomes.map(o=>o?.questionId)).size!==3)return false;for(const o of d.outcomes){if(!o||typeof o.questionId!=='string'||!o.questionId||o.questionId.length>160||!['observations','curiosity','empathy','boundaries','agreements','repair'].includes(o.skill)||!Number.isInteger(o.attempts)||o.attempts<1||o.attempts>100||typeof o.hintUsed!=='boolean'||typeof o.firstTry!=='boolean'||!['rule','ai','self'].includes(o.assessment)||o.resolved!==true)return false;if(o.firstTry&&(o.hintUsed||o.attempts!==1||o.assessment==='self'))return false;}if(d.firstTry!==d.outcomes.filter(o=>o.firstTry).length)return false;}
 return true;
}

export const trophyTiers = [{name:'Bronze',target:1},{name:'Silver',target:3},{name:'Gold',target:5}] as const;
export function drillProgress(history:DrillSession[],now=new Date()) {
 const counts:Record<DrillKind,number>={blank:0,build:0,choose:0,write:0};
 const seen=new Set<string>();
 for(const s of history){if(!validDrillSession(s)||!s.id||seen.has(s.id)||Date.parse(s.date)>now.getTime())continue;seen.add(s.id);counts[s.kind]++;}
 const trophies=drillSets.map(s=>{const count=counts[s.id];const tier=trophyTiers.filter(t=>count>=t.target).length;const next=trophyTiers[tier];return {id:s.id,title:s.title,count,tier,next,earned:tier>0};});
 const rounds=trophyTiers.map(t=>({...t,completed:drillSets.filter(s=>counts[s.id]>=t.target).length}));
 const currentRoundIndex=rounds.findIndex(r=>r.completed<drillSets.length);
 const roundIndex=currentRoundIndex<0?rounds.length-1:currentRoundIndex;
 const round=rounds[roundIndex];
 const nextSet=drillSets.find(s=>counts[s.id]<round.target)||drillSets[0];
 return {counts,trophies,rounds,roundIndex,round,nextSet,finished:currentRoundIndex<0,medals:trophies.reduce((sum,t)=>sum+t.tier,0),pathTrophies:rounds.filter(r=>r.completed===drillSets.length).length};
}
export type DrillProgress = ReturnType<typeof drillProgress>;
