import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const bank=JSON.parse(readFileSync(new URL('../backend/data/drill-bank.json',import.meta.url),'utf8'));
const skills=['observations','curiosity','empathy','boundaries','agreements','repair'];
const kinds=['blank','build','choose','write'];
const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[.,!?;:]/g,'').trim().replace(/\s+/g,' ');

test('question bank has six ordered units and five questions for each skill and format',()=>{
 assert.equal(bank.version,1);
 assert.deepEqual(bank.units.map(unit=>unit.id),skills);
 assert.equal(bank.questions.length,120);
 for(const unit of bank.units){
  for(const field of ['title','description','tip'])assert.ok(unit[field]?.trim().length>=8,`${unit.id}: ${field}`);
  assert.ok(['green','blue','purple','peach'].includes(unit.color));
  for(const kind of kinds){
   const questions=bank.questions.filter(question=>question.skill===unit.id&&question.kind===kind);
   assert.equal(questions.length,5,`${unit.id}/${kind}`);
   assert.deepEqual(questions.map(question=>question.level),[1,1,2,2,3]);
  }
 }
});

test('bank IDs and exercise situations are unique and all learner-facing fields are bounded',()=>{
 assert.equal(new Set(bank.questions.map(question=>question.id)).size,120);
 const unique=new Set();
 const bounds={context:[20,600],prompt:[10,500],answer:[4,400],explanation:[25,600],hint:[15,400],rubric:[25,400]};
 for(const q of bank.questions){
  assert.match(q.id,new RegExp(`^${q.skill}-${q.kind}-0[1-5]$`));
  assert.ok(skills.includes(q.skill));assert.ok(kinds.includes(q.kind));
  for(const [field,[min,max]]of Object.entries(bounds)){
   assert.equal(typeof q[field],'string',`${q.id}: ${field}`);
   assert.ok(q[field].trim().length>=min&&q[field].length<=max,`${q.id}: ${field} length ${q[field].length}`);
  }
  const signature=normalize(q.context+' '+q.prompt);
  assert.ok(!unique.has(signature),`${q.id}: duplicate context and prompt`);
  unique.add(signature);
  assert.notEqual(normalize(q.hint),normalize(q.answer),`${q.id}: hint reveals the full answer`);
 }
});

test('choice questions have one listed best answer and feedback for every distractor',()=>{
 const positions=[0,0,0];
 for(const q of bank.questions.filter(question=>['blank','choose'].includes(question.kind))){
  assert.equal(q.options.length,3,q.id);
  assert.equal(new Set(q.options.map(normalize)).size,3,`${q.id}: equivalent options`);
  assert.equal(q.options.filter(option=>option===q.answer).length,1,`${q.id}: answer missing or repeated`);
  assert.deepEqual(Object.keys(q.optionFeedback).sort(),[...q.options].sort(),`${q.id}: feedback options mismatch`);
  for(const option of q.options){
   assert.ok(option.length>5&&option.length<=200,`${q.id}: option bounds`);
   assert.ok(q.optionFeedback[option].length>=25,`${q.id}: missing useful option feedback`);
   assert.notEqual(normalize(q.optionFeedback[option]),normalize(option),`${q.id}: feedback merely copies option`);
  }
  positions[q.options.indexOf(q.answer)]++;
 }
 assert.deepEqual(positions,[20,20,20],'The intended response should not always occupy the same position.');
});

test('every blank has one answer slot and choices are completions rather than duplicated full prompts',()=>{
 for(const q of bank.questions.filter(question=>question.kind==='blank')){
  assert.equal((q.prompt.match(/___/g)||[]).length,1,q.id);
  assert.ok(!q.answer.includes('___'),q.id);
  assert.ok(q.options.every(option=>!option.includes('___')),q.id);
  assert.ok(q.prompt.replace('___',q.answer).length>q.answer.length,q.id);
 }
 for(const q of bank.questions.filter(question=>question.kind!=='blank'))assert.ok(!q.prompt.includes('___'),q.id);
});

test('every build sentence can be reconstructed from its shuffled exact word bank',()=>{
 for(const q of bank.questions.filter(question=>question.kind==='build')){
  assert.ok(q.words.length>=5&&q.words.length<=20,q.id);
  assert.deepEqual([...q.words].sort(),q.answer.split(/\s+/).sort(),q.id);
  assert.notEqual(q.words.join(' '),q.answer,`${q.id}: already solved word bank`);
  for(const alternative of q.acceptedAnswers||[]){
   assert.notEqual(normalize(alternative),normalize(q.answer),`${q.id}: redundant alternative`);
   assert.deepEqual(normalize(alternative).split(' ').sort(),q.words.map(normalize).sort(),`${q.id}: alternative uses unavailable words`);
  }
 }
});

test('writing tasks assess a contextual goal without prescribing a fixed starter phrase',()=>{
 for(const q of bank.questions.filter(question=>question.kind==='write')){
  assert.ok(Number.isInteger(q.minWords)&&q.minWords>=4&&q.minWords<=8,q.id);
  assert.ok(q.answer.split(/\s+/).length>=q.minWords,q.id);
  assert.equal(q.phrase,undefined,q.id);
  assert.equal(q.options,undefined,q.id);
  assert.equal(q.words,undefined,q.id);
  assert.doesNotMatch(q.prompt,/starting with|start with [“"']/i,q.id);
  assert.ok(q.rubric.length>=60,`${q.id}: rubric must explain the actual communication goal`);
 }
});

test('course contexts include work, friends, family, clients and shared homes',()=>{
 const contexts=bank.questions.map(q=>q.context).join('\n');
 for(const pattern of [/colleague|teammate/i,/friend/i,/family|sibling|sister|brother|parent|cousin|aunt/i,/client/i,/roommate/i]){
  assert.match(contexts,pattern);
 }
 // These regression examples protect the important ownership and consent facts.
 const ownership=bank.questions.find(q=>q.id==='agreements-write-01');
 assert.match(ownership.answer,/I will compare hotels by six/);
 assert.match(ownership.answer,/you will check flight prices by five/);
 const correction=bank.questions.find(q=>q.id==='repair-write-02');
 assert.match(correction.rubric,/buying tickets has not been agreed/);
});
