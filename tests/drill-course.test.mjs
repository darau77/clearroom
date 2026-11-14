import test from 'node:test';
import assert from 'node:assert/strict';
import {
 courseUnits,courseLessons,questionBank,courseProgress,usableHistory,questionMemory,
 reviewSummary,makePractice,prepareGenerated,shuffled,validPracticeQuestion,
} from '../lib/drill-course.ts';
import {drillSets,validDrillSession} from '../lib/drills.ts';

const NOW=new Date('2026-11-15T12:00:00Z');
const DAY=24*60*60*1000;
const HOUR=60*60*1000;
const clone=value=>structuredClone(value);
const bank=(kind='choose',skill='observations')=>questionBank.filter(q=>q.kind===kind&&q.skill===skill).slice(0,3);
let sequence=0;
function attempt(changes={}){
 const kind=changes.kind||'choose';const unitId=changes.unitId||'observations';
 const questions=changes.questions||bank(kind,unitId);
 const outcomes=questions.map(q=>({questionId:q.id,skill:q.skill,attempts:1,hintUsed:false,firstTry:true,assessment:'rule',resolved:true}));
 return {id:`course-test-${++sequence}`,date:'2026-11-14T10:00:00Z',kind,total:3,firstTry:3,xp:15,source:'authored',mode:'free',unitId,questions:clone(questions),outcomes,...changes};
}
function lessonAttempt(lesson,changes={}){
 return attempt({kind:lesson.kind,unitId:lesson.unitId,mode:'course',lessonId:lesson.id,...changes});
}
function weakAttempt(changes={}){
 const session=attempt(changes);
 return {...session,firstTry:0,outcomes:session.outcomes.map(outcome=>({...outcome,firstTry:false,attempts:2})),...changes};
}
function generated(kind='choose'){
 return {...drillSets.find(set=>set.id===kind),questions:clone(bank(kind))};
}

test('course contains 24 distinct lessons, progressing from recognition to independent writing',()=>{
 assert.equal(courseUnits.length,6);assert.equal(courseLessons.length,24);
 assert.equal(new Set(courseLessons.map(lesson=>lesson.id)).size,24);
 courseUnits.forEach((unit,index)=>{
  const lessons=courseLessons.filter(lesson=>lesson.unitId===unit.id);
  assert.deepEqual(lessons.map(lesson=>lesson.kind),['blank','choose','build','write']);
  assert.deepEqual(lessons.map(lesson=>lesson.index),[index*4,index*4+1,index*4+2,index*4+3]);
 });
 const progress=courseProgress([],NOW);
 assert.equal(progress.next.id,courseLessons[0].id);
 assert.equal(progress.finished,false);
 assert.deepEqual(courseLessons.filter(progress.unlocked).map(lesson=>lesson.id),[courseLessons[0].id]);
});

test('replaying one course lesson never substitutes for completing the next lesson',()=>{
 const first=courseLessons[0];
 const history=Array.from({length:10},()=>lessonAttempt(first));
 const progress=courseProgress(history,NOW);
 assert.equal(progress.completed.size,1);
 assert.equal(progress.next.id,courseLessons[1].id);
 assert.equal(progress.units[0].completed,1);
 assert.equal(progress.unlocked(courseLessons[1]),true);
 assert.equal(progress.unlocked(courseLessons[2]),false);
});

test('legacy rewards and free practice do not imply new course lesson completion',()=>{
 const legacy=drillSets.flatMap(set=>Array.from({length:5},()=>({id:`legacy-${++sequence}`,date:'2026-11-14T10:00:00Z',kind:set.id,total:3,firstTry:2,xp:15})));
 const free=lessonAttempt(courseLessons[0],{mode:'free'});
 const mismatched=lessonAttempt(courseLessons[0],{unitId:'repair'});
 const invalidLesson=lessonAttempt(courseLessons[0],{lessonId:'not-a-course-lesson'});
 const progress=courseProgress([...legacy,free,mismatched,invalidLesson],NOW);
 assert.equal(progress.completed.size,0);
 assert.equal(progress.next.id,courseLessons[0].id);
});

test('all distinct course lessons complete all six units without requiring repeated XP thresholds',()=>{
 const progress=courseProgress(courseLessons.map(lesson=>lessonAttempt(lesson)),NOW);
 assert.equal(progress.completed.size,24);
 assert.equal(progress.finished,true);assert.equal(progress.next,undefined);
 assert.ok(progress.units.every(unit=>unit.completed===4));
});

test('history ignores invalid, duplicate and future records and processes valid attempts chronologically',()=>{
 const early=attempt({id:'early',date:'2026-11-13T10:00:00Z'});
 const late=attempt({id:'late',date:'2026-11-14T10:00:00Z'});
 const future={...early,id:'future',date:'2026-12-01T10:00:00Z'};
 const invalid={...early,id:'bad-xp',xp:900};
 const input=[late,early,late,future,invalid,null];
 const before=clone(input);
 assert.deepEqual(usableHistory(input,NOW).map(session=>session.id),['early','late']);
 assert.deepEqual(input,before,'Sorting should not reorder caller-owned history.');
 assert.equal(questionMemory(input,NOW).get(early.outcomes[0].questionId).seen,2);
});

test('confident recall schedules reviews after 1, 3, 7 and then 14 days',()=>{
 const history=[];const expected=[1,3,7,14,14];
 for(let index=0;index<expected.length;index++){
  const at=Date.parse('2026-11-01T10:00:00Z')+index*DAY;
  const session=attempt({date:new Date(at).toISOString()});history.push(session);
  const memory=questionMemory(history,NOW).get(session.outcomes[0].questionId);
  assert.equal(memory.seen,index+1);assert.equal(memory.streak,index+1);
  assert.equal(memory.dueAt,at+expected[index]*DAY);
  assert.equal(memory.needsReview,false);
 }
});

test('misses, hints and self-assessment schedule a four-hour review instead of confident recall',()=>{
 for(const situation of [
  {attempts:2,hintUsed:false,assessment:'rule'},
  {attempts:1,hintUsed:true,assessment:'rule'},
  {attempts:1,hintUsed:false,assessment:'self'},
 ]){
  const first=attempt({date:'2026-11-12T10:00:00Z'});
  const second=attempt({date:'2026-11-13T10:00:00Z'});
  const last=attempt({date:'2026-11-14T10:00:00Z',firstTry:0});
  last.outcomes=last.outcomes.map(outcome=>({...outcome,...situation,firstTry:false}));
  assert.equal(validDrillSession(last),true);
  const memory=questionMemory([first,second,last],NOW).get(last.outcomes[0].questionId);
  assert.equal(memory.streak,0,JSON.stringify(situation));
  assert.equal(memory.dueAt,Date.parse(last.date)+4*HOUR);
  assert.equal(memory.needsReview,true);
  const recovered=attempt({date:'2026-11-15T10:00:00Z'});
  const next=questionMemory([first,second,last,recovered],NOW).get(last.outcomes[0].questionId);
  assert.equal(next.streak,1);assert.equal(next.dueAt,Date.parse(recovered.date)+DAY);
 }
});

test('review summary changes at the exact due boundary and does not count duplicate attempts twice',()=>{
 const session=attempt({date:'2026-11-14T10:00:00Z'});
 const due=Date.parse(session.date)+DAY;
 assert.equal(reviewSummary([session,session],new Date(due-1)).due,0);
 const summary=reviewSummary([session,session],new Date(due));
 assert.equal(summary.due,3);assert.equal(summary.seen,3);assert.equal(summary.tricky,0);
 assert.equal(summary.kind,'choose');assert.equal(summary.skill,'observations');
});

test('a bank session contains three distinct questions and rotates unseen material on replay',()=>{
 const first=makePractice({kind:'choose',skill:'curiosity',history:[],level:1,now:NOW,random:()=>0});
 assert.equal(first.questions.length,3);assert.equal(new Set(first.questions.map(q=>q.id)).size,3);
 assert.ok(first.questions.every(q=>q.skill==='curiosity'&&q.kind==='choose'));
 const seen=attempt({kind:'choose',unitId:'curiosity',questions:first.questions});
 const next=makePractice({kind:'choose',skill:'curiosity',history:[seen],level:1,now:NOW,random:()=>0});
 assert.equal(next.questions.filter(q=>!first.questions.some(old=>old.id===q.id)).length,2);
 assert.equal(new Set(next.questions.map(q=>q.id)).size,3);
});

test('requested lesson level changes the material selected before any history is available',()=>{
 const easy=makePractice({kind:'build',skill:'boundaries',history:[],level:1,now:NOW,random:()=>0});
 const hard=makePractice({kind:'build',skill:'boundaries',history:[],level:3,now:NOW,random:()=>0});
 assert.deepEqual(easy.questions.map(q=>q.level).sort(),[1,1,2]);
 assert.deepEqual(hard.questions.map(q=>q.level).sort(),[2,2,3]);
});

test('course practice interleaves one due earlier skill, while fresh history stays on the current skill',()=>{
 const earlier=attempt({kind:'choose',unitId:'observations',date:'2026-11-13T10:00:00Z'});
 const options={kind:'choose',skill:'curiosity',mode:'course',lessonId:'curiosity-choose',now:NOW,random:()=>0};
 const lesson=makePractice({...options,history:[earlier]});
 assert.equal(lesson.questions.filter(q=>q.skill==='curiosity').length,2);
 assert.equal(lesson.questions.filter(q=>q.skill==='observations').length,1);
 assert.equal(lesson.unitId,'curiosity');assert.equal(lesson.lessonId,'curiosity-choose');
 const recent={...earlier,date:'2026-11-15T11:00:00Z'};
 const fresh=makePractice({...options,history:[recent]});
 assert.ok(fresh.questions.every(q=>q.skill==='curiosity'));
});

test('shuffling and preparing questions do not mutate the shared source arrays or question bank',()=>{
 const source=['one','two','three'];const result=shuffled(source,()=>0);
 assert.deepEqual(source,['one','two','three']);assert.notEqual(result,source);
 const snapshot=JSON.stringify(questionBank);
 for(const kind of ['choose','build']){
  const set=makePractice({kind,skill:'observations',history:[],now:NOW,random:()=>0});
  if(kind==='choose')set.questions[0].options.push('Local edit');
  else{assert.ok(set.questions.every(q=>q.words.join(' ')!==q.answer));set.questions[0].words.push('Local edit');}
 }
 assert.equal(JSON.stringify(questionBank),snapshot);
});

test('review includes a valid locally saved AI question when its answer is due',()=>{
 const ai={...clone(bank()[0]),id:'ai-local-unique',skill:'repair',context:'A friend asks you to clarify a misunderstood message.',prompt:'Which response acknowledges the misunderstanding?'};
 const qs=[ai,...bank().slice(1)];
 const session=weakAttempt({source:'ai',questions:qs});
 const set=makePractice({kind:'choose',skill:'repair',mode:'review',history:[session],now:NOW,random:()=>0});
 assert.ok(set.questions.some(q=>q.id===ai.id));
 assert.equal(reviewSummary([session],NOW).seen,3);
});

test('review never admits a malformed saved AI question or crashes on a malformed question collection',()=>{
 const invalid={...clone(bank()[0]),id:'ai-invalid-options',options:['Different','Other','Neither']};
 const session=weakAttempt({source:'ai',questions:[invalid,...bank().slice(1)]});
 const set=makePractice({kind:'choose',skill:'observations',mode:'review',history:[session],now:NOW,random:()=>0});
 assert.ok(set.questions.every(q=>q.id!==invalid.id));
 for(const questions of [{},42,'not a question collection']){
  const damaged={...attempt(),questions};
  assert.doesNotThrow(()=>reviewSummary([damaged],NOW));
  assert.doesNotThrow(()=>makePractice({kind:'choose',skill:'observations',mode:'review',history:[damaged],now:NOW,random:()=>0}));
 }
});

test('generated lessons are normalized to their requested skill and retain private source ownership',()=>{
 const original=generated();const snapshot=clone(original);
 const prepared=prepareGenerated(original,'choose','repair','repair-choose');
 assert.equal(prepared.ai,true);assert.equal(prepared.mode,'course');assert.equal(prepared.unitId,'repair');
 assert.ok(prepared.questions.every(q=>q.kind==='choose'&&q.skill==='repair'));
 prepared.questions[0].options.push('Private edit');
 assert.deepEqual(original,snapshot);
});

test('malformed generated lesson shapes are rejected before play',()=>{
 const scenarios=[
  {...generated(),id:'write'},
  {...generated(),questions:bank().slice(0,2)},
  {...generated(),questions:[clone(bank()[0]),clone(bank()[0]),clone(bank()[1])]},
  {...generated(),questions:{}},
  {...generated(),questions:[null,...bank().slice(1)]},
  {...generated(),questions:[{...clone(bank()[0]),answer:'Not one of these options'},...bank().slice(1)]},
  {...generated(),questions:[{...clone(bank()[0]),options:['Same',' SAME ','Different']},...bank().slice(1)]},
 ];
 for(const candidate of scenarios)assert.throws(()=>prepareGenerated(candidate,'choose','observations'));
 const blank=generated('blank');blank.questions[0].prompt='I noticed ___ and ___.';
 assert.throws(()=>prepareGenerated(blank,'blank','observations'));
 const build=generated('build');build.questions[0].words.pop();
 assert.throws(()=>prepareGenerated(build,'build','observations'));
 const write=generated('write');write.questions[0].rubric='Too short';
 assert.throws(()=>prepareGenerated(write,'write','observations'));
});

test('empty distractors and empty word tiles are not valid playable exercises',()=>{
 const choose=generated();choose.questions[0].options=[choose.questions[0].answer,'   ','Some other response'];
 assert.equal(validPracticeQuestion(choose.questions[0],'choose'),false);
 assert.throws(()=>prepareGenerated(choose,'choose','observations'));
 const build=generated('build');
 build.questions[0].answer=' '+build.questions[0].answer;
 build.questions[0].words.unshift('');
 assert.equal(validPracticeQuestion(build.questions[0],'build'),false);
 assert.throws(()=>prepareGenerated(build,'build','observations'));
});

test('per-question outcomes must be resolved, unique and consistent with earned first-try counts',()=>{
 const good=attempt();assert.equal(validDrillSession(good),true);
 const modify=(change)=>({...good,outcomes:good.outcomes.map((outcome,index)=>index===0?{...outcome,...change}:outcome)});
 for(const invalid of [
  {...good,outcomes:good.outcomes.slice(0,2)},
  {...good,outcomes:[good.outcomes[0],good.outcomes[0],good.outcomes[2]]},
  {...good,firstTry:2},modify({resolved:false}),modify({attempts:0}),modify({attempts:101}),
  modify({firstTry:true,hintUsed:true}),modify({firstTry:true,attempts:2}),
  modify({firstTry:true,assessment:'self'}),modify({skill:'unknown'}),modify({assessment:'guessed'}),
 ])assert.equal(validDrillSession(invalid),false);
 const self=attempt({firstTry:0});self.outcomes=self.outcomes.map(o=>({...o,firstTry:false,assessment:'self'}));
 assert.equal(validDrillSession(self),true);
});
