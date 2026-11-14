import test from 'node:test';
import assert from 'node:assert/strict';
import {drillSets,checkDrillAnswer,validDrillSession,normaliseAnswer} from '../lib/drills.ts';
test('all authored exercises accept their intended answer',()=>{for(const set of drillSets)for(const q of set.questions)assert.equal(checkDrillAnswer(set.id,q,q.answer).correct,true,`${q.id}: ${q.answer}`);});
test('choice and blank distractors reject and explain',()=>{for(const set of drillSets.filter(s=>['blank','choose'].includes(s.id)))for(const q of set.questions){assert.equal(q.options.filter(o=>checkDrillAnswer(set.id,q,o).correct).length,1);assert.ok(q.explanation.length>25);}});
test('word banks can construct every sentence without missing or extra words',()=>{for(const q of drillSets.find(s=>s.id==='build').questions){assert.deepEqual(q.words.map(normaliseAnswer).sort(),q.answer.split(' ').map(normaliseAnswer).sort());assert.equal(checkDrillAnswer('build',q,q.words.join(' ')).correct,false);}});
test('punctuation, casing, and spacing do not reject the intended answer',()=>{const q=drillSets[1].questions[0];assert.equal(checkDrillAnswer('build',q,'  WHAT   got in the way!!! ').correct,true);});
test('writing checks phrase boundary and length without claiming semantic evaluation',()=>{const q=drillSets.find(s=>s.id==='write').questions[0];assert.equal(checkDrillAnswer('write',q,'Can you help me understand').correct,false);assert.equal(checkDrillAnswer('write',q,'Can you help me understanding the reason the deadline moved').correct,false);const result=checkDrillAnswer('write',q,'Can you help me understand what made this week difficult?');assert.equal(result.correct,true);assert.match(result.message,/not the quality/);});
test('stored drill rewards must describe a complete valid attempt',()=>{const d={id:'one',date:new Date().toISOString(),kind:'blank',total:3,firstTry:0,xp:15};assert.equal(validDrillSession(d),true);for(const value of [null,{}, {...d,total:2},{...d,firstTry:-1},{...d,firstTry:4},{...d,xp:100},{...d,date:'bad'}])assert.equal(validDrillSession(value),false);});

const {drillProgress}=await import('../lib/drills.ts');
const trophyNow=new Date('2026-11-14T12:00:00Z');
let trophyId=0;
const attempt=(kind)=>({id:`trophy-${++trophyId}`,date:'2026-11-14T10:00:00Z',kind,total:3,firstTry:0,xp:15});
test('trail unlocks next lesson and trophies at exactly 1, 3 and 5 completed drills',()=>{let h=[];assert.equal(drillProgress(h,trophyNow).medals,0);for(let i=1;i<=5;i++){h.push(attempt('blank'));const p=drillProgress(h,trophyNow);assert.equal(p.trophies[0].tier,i>=5?3:i>=3?2:1);assert.equal(p.nextSet.id,'build');}assert.equal(drillProgress(h,trophyNow).finished,false);});
test('all four modes complete each trail tier without adding invented rewards',()=>{let h=[];for(let n=1;n<=5;n++){h.push(...['blank','build','choose','write'].map(attempt));const p=drillProgress(h,trophyNow);assert.equal(p.pathTrophies,n>=5?3:n>=3?2:1);assert.equal(p.roundIndex,n>=3?2:1);assert.equal(p.finished,n===5);}assert.equal(drillProgress(h,trophyNow).medals,12);});
test('duplicates, invalid sessions and future completions do not unlock trophies',()=>{const a=attempt('blank');const p=drillProgress([a,a,{...attempt('blank'),xp:100},{...attempt('blank'),date:'2030-01-01'},null],trophyNow);assert.equal(p.counts.blank,1);assert.equal(p.medals,1);});
