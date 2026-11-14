export type DrillKind = 'blank' | 'build' | 'choose' | 'write';
export type DrillQuestion = { id:string; prompt:string; context:string; answer:string; explanation:string; options?:string[]; words?:string[]; phrase?:string; minWords?:number };
export type DrillSet = { id:DrillKind; title:string; description:string; skill:string; color:string; questions:DrillQuestion[] };
export type DrillSession = { id:string; date:string; kind:DrillKind; total:number; firstTry:number; xp:number };
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
  const phrase=normaliseAnswer(q.phrase||'');
  const starts=answer===phrase||answer.startsWith(phrase+' ');
  const count=answer.split(' ').filter(w=>/[a-z]/i.test(w)).length;
  return {correct:starts&&count>=(q.minWords||1),message:!starts?`Start your sentence with “${q.phrase}”.`:count<(q.minWords||1)?`Add a little context: use at least ${q.minWords} words.`:'Pattern complete. This checks the opening and length, not the quality of your full sentence.'};
 }
 return {correct:answer===normaliseAnswer(q.answer),message:answer===normaliseAnswer(q.answer)?'That’s the intended response.':'Not quite. Read the explanation, then give it another try.'};
}
export function validDrillSession(s:unknown):s is DrillSession{
 if(!s||typeof s!=='object')return false;
 const d=s as DrillSession;
 return typeof d.id==='string'&&typeof d.date==='string'&&Number.isFinite(Date.parse(d.date))&&drillSets.some(set=>set.id===d.kind&&set.questions.length===d.total)&&d.xp===DRILL_XP&&Number.isInteger(d.firstTry)&&d.firstTry>=0&&d.firstTry<=d.total;
}
