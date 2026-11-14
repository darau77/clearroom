import unittest,json,asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock,patch
from conversation import explicit_language,validate_reply,validate_evidence,Evidence
from work_queue import WorkQueue,QueueFull
from intelligence import checked_reply,checked_feedback,ground_feedback,match_feedback_language,remove_repeated_advice
from test_api import BODY,GOOD
import main

class Languages(unittest.TestCase):
 def test_explicit_switch_and_selected_language_precedence(self):
  m=lambda role,text:SimpleNamespace(role=role,content=text)
  self.assertEqual(explicit_language([m('user','Please reply in Russian')]),'ru')
  self.assertEqual(explicit_language([m('user','Қазақша жауап берші')]),'kk')
  conversation=[m('user','Please speak Russian'),m('assistant','Хорошо'),m('user','What next?')]
  self.assertEqual(explicit_language(conversation,'auto'),'ru')
  self.assertEqual(explicit_language(conversation,'es'),'es')
 def test_echo_and_wrong_script_are_rejected(self):
  messages=[SimpleNamespace(role='user',content='Please speak Russian')]
  with self.assertRaises(ValueError):validate_reply('Please speak Russian',messages,'ru')
  with self.assertRaises(ValueError):validate_reply('I will handle the hotel tomorrow.',messages,'ru')
  validate_reply('Я проверю цены завтра.',messages,'ru')
 def test_only_verbatim_evidence_from_correct_learner_turn_survives(self):
  messages=[SimpleNamespace(role='user',content='I will compare hotels tonight.'),SimpleNamespace(role='assistant',content='I will check prices tomorrow.')]
  items=[Evidence(turn=1,quote='compare hotels',owner='LEARNER',action='Compare hotels',status='agreed'),Evidence(turn=2,quote='check prices',owner='LEARNER',action='Check prices',status='agreed')]
  self.assertEqual(len(validate_evidence(items,messages,learner_only=True)),1)

class Grounding(unittest.TestCase):
 def test_strength_cannot_quote_partner_or_credit_character(self):
  c=main.Conversation.model_validate(BODY)
  for item in [{'observation':'You admitted overload.','turn':1,'evidence_quote':'You wanted to talk?'},{'observation':'Alex named the handoffs.','turn':2,'evidence_quote':BODY['messages'][1]['content']}]:
   with self.assertRaises(ValueError):ground_feedback({**GOOD,'strengths':[item]},c)
 def test_validated_strength_keeps_learner_quote(self):
  result=ground_feedback(GOOD,main.Conversation.model_validate(BODY))
  self.assertEqual(result['strengths'],['You named the last two handoffs.'])
  self.assertEqual(result['covered_actions'][0]['owner'],'LEARNER')
 def morgan_fixture(self):
  quote='I understand you are worried about booking too late. I will compare hotels by six.'
  partner={'name':'Morgan','role':'Travel friend','relationship':'Friend','personality':'Thoughtful','context':'We are planning a holiday.','objective':'Agree who handles hotels and flights.'}
  c=main.Conversation.model_validate({**BODY,'scenario':'custom','custom_partner':partner,'messages':[{'role':'assistant','content':'I am worried about booking too late.'},{'role':'user','content':quote}]})
  raw={**GOOD,'summary':"You acknowledged Morgan's concern and named your own task.",'strengths':[{'observation':"You acknowledged Morgan's concern about booking too late.",'turn':2,'evidence_quote':quote}],'improvements':[{'acknowledgement':'You already set a deadline for hotels.','evidence_quote':quote,'refinement':'Ask whether that deadline works for your friend.'}],'quote':quote}
  return c,raw
 def test_learner_feedback_can_mention_the_partner_as_its_object(self):
  c,raw=self.morgan_fixture()
  result=ground_feedback(raw,c)
  self.assertEqual(result['summary'],raw['summary'])
  self.assertEqual(result['strengths'],[raw['strengths'][0]['observation']])
  self.assertEqual(result['covered_actions'][0]['owner'],'LEARNER')
  self.assertEqual(result['covered_actions'][0]['quote'],c.messages[1].content)
 def test_partner_subject_is_rejected_in_summary_and_strength(self):
  for field in ['summary','strengths']:
   with self.subTest(field=field):
    c,raw=self.morgan_fixture()
    if field=='summary':raw['summary']='Morgan acknowledged your concern and named a task.'
    else:raw['strengths'][0]['observation']='Morgan acknowledged your concern about booking too late.'
    with self.assertRaises(ValueError):ground_feedback(raw,c)
 def test_later_sentence_cannot_credit_the_partner_instead(self):
  c,raw=self.morgan_fixture()
  raw['summary']='You described your concern. Morgan set a clear deadline.'
  with self.assertRaises(ValueError):ground_feedback(raw,c)

class Audits(unittest.IsolatedAsyncioTestCase):
 async def test_reply_uses_reviewed_text_and_preserves_speaker_evidence(self):
  c=main.Conversation.model_validate(BODY)
  first={'partner_position':'Alex is the employee explaining the missed design handoffs.','latest_user_need':'The manager asks what caused the missed handoffs.','language':'en','responsibilities':[],'reply':'Draft response'}
  reviewed={'problem':'invented_facts','reason':'Replace the unsupported draft with a grounded partner response.','language':'en','reply':'I will send my draft on Thursday.','ownership_checked':True,'language_checked':True}
  generator=AsyncMock(side_effect=[first,reviewed])
  with patch('intelligence.structured',generator):result=await checked_reply(SimpleNamespace(),c)
  self.assertEqual(result['reply'],reviewed['reply'])
  self.assertEqual(generator.await_count,2)
  audit_input=generator.await_args_list[1].args[1][1]['content']
  self.assertIn('LEARNER',audit_input)
  self.assertIn(BODY['messages'][-1]['content'],audit_input)
 async def test_coach_reviews_the_final_turn_before_returning_advice(self):
  c=main.Conversation.model_validate({**BODY,'messages':BODY['messages']+[{'role':'assistant','content':'We need a plan.'},{'role':'user','content':'I will review the draft Thursday at 2 pm.'}]})
  corrected={**GOOD,'improvements':[{'acknowledgement':'You already named a review time.','evidence_quote':'I will review the draft Thursday at 2 pm.','refinement':'Ask whether that review time works for your partner.'}]}
  generator=AsyncMock(side_effect=[{**GOOD,'next_step':'Name a time.'},corrected,{'is_new':True,'existing_evidence':'','reason':'Asking agreement is new.'},{'preserved_words':'I will review the draft Thursday at 2 pm.','new_words_to_say':'Does that time work for you?','practice_note':''}])
  with patch('intelligence.structured',generator):result=await checked_feedback(SimpleNamespace(),c,main.Feedback,main.feedback_schema(c))
  self.assertEqual(result.next_step,corrected['improvements'][0]['refinement'])
  self.assertIn('Thursday at 2 pm',generator.await_args_list[1].args[1][1]['content'])
 async def test_repeated_advice_is_suppressed_instead_of_shown_as_an_omission(self):
  c=main.Conversation.model_validate(BODY)
  result=main.Feedback.model_validate(ground_feedback(GOOD,c))
  note='No additional change was verified. You already asked about what got in the way.'
  with patch('intelligence.structured',AsyncMock(side_effect=[{'is_new':False,'existing_evidence':BODY['messages'][1]['content'],'reason':'Already asked.'},{'preserved_words':result.quote,'new_words_to_say':'','practice_note':note}])):
   result=await remove_repeated_advice(SimpleNamespace(),result,c)
  self.assertEqual(result.improvements,[])
  self.assertEqual(result.next_step,note)
 async def test_translation_preserves_original_quote_and_evidence(self):
  raw=ground_feedback(GOOD,main.Conversation.model_validate(BODY))
  original=main.Feedback.model_validate({**raw,'rewrite':'Давай обсудим план вместе.'})
  translation={key:getattr(original,key) for key in ['summary','strengths','improvements','rewrite','next_step']}
  translation['rewrite']='Let us discuss the plan together.'
  with patch('intelligence.structured',AsyncMock(return_value=translation)):
   result=await match_feedback_language(SimpleNamespace(),original,'en',main.Feedback)
  self.assertEqual(result.quote,original.quote)
  self.assertEqual(result.covered_actions[0].quote,original.covered_actions[0].quote)
  self.assertEqual(result.rewrite,translation['rewrite'])
 async def test_language_is_checked_after_the_final_rewrite_changes(self):
  c=main.Conversation.model_validate({**BODY,'language':'en'})
  novelty={'is_new':True,'existing_evidence':'','reason':'No review time yet.'}
  final={'preserved_words':'Давай обсудим следующий этап работы.','new_words_to_say':'Когда тебе удобно обсудить следующий этап работы?','practice_note':''}
  translated={key:value for key,value in ground_feedback(GOOD,c).items() if key in ['summary','strengths','improvements','rewrite','next_step']}
  translated['rewrite']='What time would work to review the next handoff?'
  generator=AsyncMock(side_effect=[GOOD,GOOD,novelty,final,translated])
  with patch('intelligence.structured',generator):result=await checked_feedback(SimpleNamespace(),c,main.Feedback,main.feedback_schema(c))
  self.assertEqual(result.rewrite,translated['rewrite'])
  self.assertEqual(result.quote,GOOD['quote'])
  self.assertEqual(generator.await_count,5)
 async def test_queue_is_bounded_fifo_and_cancellation_safe(self):
  queue=WorkQueue(capacity=3,timeout=1);release=asyncio.Event();order=[]
  async def work(n):
   async with queue.slot():
    order.append(n)
    if n==0:await release.wait()
  a=asyncio.create_task(work(0));await asyncio.sleep(0)
  b=asyncio.create_task(work(1));c=asyncio.create_task(work(2));await asyncio.sleep(.01)
  with self.assertRaises(QueueFull):
   async with queue.slot():pass
  b.cancel()
  with self.assertRaises(asyncio.CancelledError):await b
  release.set();await asyncio.gather(a,c)
  self.assertEqual(order,[0,2]);self.assertEqual(queue.depth,0);self.assertFalse(queue.lock.locked())
