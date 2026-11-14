"""A coaching rewrite must demonstrate its claimed refinement in context."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import main
from intelligence import ground_feedback, remove_repeated_advice


QUOTE = 'I will compare hotels tonight. Can you check flight prices tomorrow?'
FINAL_TURN = 'Then we will review both options Friday at five.'
NEW_CLAUSE = 'If prices rise, can we agree on a spending limit before booking?'
NEXT_STEP = 'Agree on what to do if prices rise before booking.'
REWRITE = QUOTE + ' ' + NEW_CLAUSE
PRACTICE_NOTE = 'No additional change was verified. You already established clear task ownership and a review time.'


def conversation():
    return main.Conversation.model_validate({
        'scenario': 'deadlines',
        'language': 'en',
        'messages': [
            {'role': 'assistant', 'content': 'We still need to compare hotels and flights.'},
            {'role': 'user', 'content': QUOTE},
            {'role': 'assistant', 'content': 'Yes, I will check flight prices tomorrow.'},
            {'role': 'user', 'content': FINAL_TURN},
        ],
    })


def feedback(**changes):
    return main.Feedback.model_validate({
        'summary': 'You assigned both tasks and named a review time.',
        'strengths': ['You made the task ownership clear.'],
        'improvements': ['You named the owners. ' + NEXT_STEP],
        'quote': QUOTE,
        'rewrite': QUOTE,
        'next_step': NEXT_STEP,
        **changes,
    })


def audit(**changes):
    response = {
        'is_new': True,
        'existing_evidence': '',
        'reason': 'The learner has not proposed a fallback for rising prices.',
        'preserved_words': QUOTE,
        'new_words_to_say': NEW_CLAUSE,
        'practice_note': PRACTICE_NOTE,
        **changes,
    }
    return [
        {key: response[key] for key in ['is_new', 'existing_evidence', 'reason']},
        {key: response[key] for key in ['preserved_words', 'new_words_to_say', 'practice_note']},
    ]


class FeedbackWithoutInventedGap(unittest.TestCase):
    def test_schema_allows_zero_or_one_improvement(self):
        improvements = main.feedback_schema(conversation())['properties']['improvements']
        self.assertEqual(improvements.get('minItems', 0), 0)
        self.assertEqual(improvements['maxItems'], 1)

    def test_grounding_empty_improvements_retains_the_provided_next_step(self):
        raw = {
            'summary': 'You made the plan clear.',
            'strengths': [{
                'observation': 'You named a review time.',
                'turn': 4,
                'evidence_quote': FINAL_TURN,
            }],
            'improvements': [],
            'quote': QUOTE,
            'rewrite': QUOTE,
            'next_step': PRACTICE_NOTE,
        }
        result = ground_feedback(raw, conversation())
        self.assertEqual(result['improvements'], [])
        self.assertEqual(result['next_step'], PRACTICE_NOTE)
        self.assertEqual(result['covered_actions'][0]['quote'], FINAL_TURN)


class FeedbackRewriteAudit(unittest.IsolatedAsyncioTestCase):
    async def run_audit(self, response, value=None):
        generator = AsyncMock(side_effect=response)
        with patch('intelligence.structured', generator):
            result = await remove_repeated_advice(
                SimpleNamespace(), value if value is not None else feedback(), conversation(),
            )
        return result, generator

    async def test_reassurance_rewrite_demonstrates_the_suggested_check_in_question(self):
        quote = (
            "okay let's do it let's quick check checking the priorities and don't be worried "
            'about filling as a burden you are the top software engineers in this company '
            'and you are the valuable asset'
        )
        refinement = 'When would work for a quick check-in, and would you prefer a call or chat?'
        polished = 'Let us check the priorities. You are not a burden; your work is valuable to this team.'
        context = main.Conversation.model_validate({
            'scenario': 'deadlines',
            'language': 'en',
            'messages': [
                {'role': 'assistant', 'content': 'I am worried that asking for help makes me a burden.'},
                {'role': 'user', 'content': quote},
            ],
        })
        value = feedback(
            quote=quote,
            rewrite=polished,
            improvements=['You reassured your partner. Ask about the time and format of the check-in.'],
            next_step='Ask about the time and format of the check-in.',
        )
        corrected = polished + ' ' + refinement
        generator = AsyncMock(side_effect=audit(
            reason='The learner proposed a priority check but has not asked about its time or format.',
            preserved_words=polished,
            new_words_to_say=refinement,
        ))
        with patch('intelligence.structured', generator):
            result = await remove_repeated_advice(SimpleNamespace(), value, context)
        self.assertEqual(result.rewrite, corrected)
        self.assertIn(refinement, result.rewrite)
        self.assertEqual(result.quote, quote)
        self.assertEqual(result.next_step, 'Ask about the time and format of the check-in.')

    async def test_new_refinement_replaces_the_cosmetic_candidate_rewrite(self):
        result, generator = await self.run_audit(audit(
            preserved_words='  ' + QUOTE + '\n',
            new_words_to_say='\n' + NEW_CLAUSE + '  ',
        ))
        self.assertEqual(result.rewrite, REWRITE)
        self.assertIn(NEW_CLAUSE, result.rewrite)
        self.assertEqual(result.next_step, NEXT_STEP)
        self.assertEqual(result.quote, QUOTE)
        self.assertEqual(result.improvements, ['You named the owners. ' + NEXT_STEP])
        self.assertEqual(generator.await_count, 2)

    async def test_voice_transcript_without_terminal_punctuation_gets_a_sentence_boundary(self):
        preserved = 'I will compare hotels tonight and you will check flight prices tomorrow'
        result, _ = await self.run_audit(audit(preserved_words=preserved))
        self.assertEqual(result.rewrite, preserved + '. ' + NEW_CLAUSE)
        self.assertEqual(result.quote, QUOTE)

    async def test_new_refinement_requires_actual_new_words_to_say(self):
        cases = [
            audit(new_words_to_say=''),
            audit(new_words_to_say='  \n '),
            audit(new_words_to_say='!!!'),
        ]
        for response in cases:
            with self.subTest(response=response), self.assertRaises(ValueError):
                await self.run_audit(response)

    async def test_punctuation_and_capitalization_do_not_make_an_old_action_new(self):
        old_clause = 'I WILL COMPARE HOTELS TONIGHT!'
        result, generator = await self.run_audit(audit(
            preserved_words='Can you check flight prices tomorrow?',
            new_words_to_say=old_clause,
            reason='The learner should state their own task.',
        ) + [{
            'preserved_words': QUOTE,
            'new_words_to_say': '',
            'practice_note': PRACTICE_NOTE,
        }])
        self.assertEqual(result.improvements, [])
        self.assertEqual(result.rewrite, QUOTE)
        self.assertEqual(result.next_step, PRACTICE_NOTE)
        self.assertEqual(result.quote, QUOTE)
        self.assertEqual(generator.await_count, 3)

    async def test_action_already_in_final_learner_turn_cannot_be_a_new_refinement(self):
        old_clause = 'Then we will review both options Friday at five!'
        result, generator = await self.run_audit(audit(
            preserved_words=QUOTE,
            new_words_to_say=old_clause,
            reason='The learner should add a review time.',
        ) + [{
            'preserved_words': QUOTE,
            'new_words_to_say': '',
            'practice_note': PRACTICE_NOTE,
        }])
        self.assertEqual(result.improvements, [])
        self.assertEqual(result.rewrite, QUOTE)
        self.assertEqual(result.next_step, PRACTICE_NOTE)
        self.assertEqual(generator.await_count, 3)
        fallback_call = generator.await_args_list[2]
        fallback_input = json.loads(fallback_call.args[1][1]['content'])
        self.assertIsNone(fallback_input['verified_refinement'])
        self.assertEqual(fallback_call.args[2]['properties']['new_words_to_say']['enum'], [''])

    async def test_repeated_advice_uses_fluent_rewrite_and_honest_practice_note(self):
        fluent = 'I will compare hotels tonight, and you will check flights tomorrow. Let us review both Friday at five.'
        for repeated in [
            {'is_new': False, 'existing_evidence': FINAL_TURN},
            {'is_new': True, 'existing_evidence': FINAL_TURN},
        ]:
            with self.subTest(repeated=repeated):
                result, _ = await self.run_audit(audit(
                    **repeated,
                    reason='The final learner turn already supplies a review time.',
                    preserved_words=fluent,
                    new_words_to_say='',
                ), feedback(next_step='Agree on a specific review time.'))
                self.assertEqual(result.improvements, [])
                self.assertEqual(result.rewrite, fluent)
                self.assertEqual(result.next_step, PRACTICE_NOTE)
                self.assertEqual(result.quote, QUOTE)

    async def test_no_gap_path_does_not_manufacture_an_improvement(self):
        fluent = 'I will compare hotels tonight. Could you check flights tomorrow? We can review both Friday at five.'
        result, _ = await self.run_audit(audit(
            is_new=False,
            existing_evidence=FINAL_TURN,
            reason='The learner already established the plan.',
            preserved_words='  ' + fluent + '\n',
            new_words_to_say='',
        ), feedback(improvements=[], next_step=PRACTICE_NOTE))
        self.assertEqual(result.improvements, [])
        self.assertEqual(result.rewrite, fluent)
        self.assertEqual(result.next_step, PRACTICE_NOTE)

    async def test_no_gap_feedback_rejects_an_added_refinement(self):
        with self.assertRaises(ValueError):
            await self.run_audit(audit(
                is_new=False,
                existing_evidence=FINAL_TURN,
                reason='No additional change is needed.',
                new_words_to_say=NEW_CLAUSE,
            ), feedback(improvements=[], next_step=PRACTICE_NOTE))

    async def test_empty_improvements_override_classifier_claim_that_an_action_is_new(self):
        result, generator = await self.run_audit(audit(
            is_new=True,
            new_words_to_say='',
        ), feedback(improvements=[], next_step=PRACTICE_NOTE))
        self.assertEqual(result.improvements, [])
        self.assertEqual(result.rewrite, QUOTE)
        self.assertEqual(result.next_step, PRACTICE_NOTE)
        editor_call = generator.await_args_list[1]
        editor_input = json.loads(editor_call.args[1][1]['content'])
        self.assertIsNone(editor_input['verified_refinement'])
        self.assertEqual(editor_call.args[2]['properties']['new_words_to_say']['enum'], [''])

    async def test_classifier_sees_final_turn_and_editor_gets_context_plus_verified_refinement(self):
        candidate = 'I will compare hotels. Can you check flights?'
        value = feedback(rewrite=candidate)
        _, generator = await self.run_audit(audit(), value)
        classifier = json.loads(generator.await_args_list[0].args[1][1]['content'])
        classifier_input = json.dumps(classifier)
        self.assertIn(QUOTE, classifier_input)
        self.assertIn(FINAL_TURN, classifier_input)
        self.assertIn(NEXT_STEP, classifier_input)
        editor = json.loads(generator.await_args_list[1].args[1][1]['content'])
        serialized = json.dumps(editor)
        for expected in [
            QUOTE,
            FINAL_TURN,
            'Yes, I will check flight prices tomorrow.',
            NEXT_STEP,
        ]:
            with self.subTest(expected=expected):
                self.assertIn(expected, serialized)
        self.assertIn('LEARNER', serialized)
        self.assertIn('PARTNER', serialized)
        self.assertEqual(editor['verified_refinement'], NEXT_STEP)
        self.assertNotIn(candidate, serialized)
        self.assertNotIn('candidate_rewrite', editor)
        self.assertNotIn('improvements', editor)

    async def test_no_gap_editor_is_not_primed_with_the_rejected_advice_or_candidate(self):
        candidate = 'You will compare hotels, and I will check flights at 3 pm.'
        result, generator = await self.run_audit(audit(
            is_new=False,
            existing_evidence=FINAL_TURN,
            new_words_to_say='',
        ), feedback(rewrite=candidate))
        editor_call = generator.await_args_list[1]
        editor = json.loads(editor_call.args[1][1]['content'])
        serialized = json.dumps(editor)
        self.assertIsNone(editor['verified_refinement'])
        self.assertNotIn(NEXT_STEP, serialized)
        self.assertNotIn(candidate, serialized)
        self.assertNotIn('candidate_rewrite', editor)
        self.assertNotIn('improvements', editor)
        self.assertEqual(editor_call.args[2]['properties']['new_words_to_say']['enum'], [''])
        self.assertEqual(result.rewrite, QUOTE)
        self.assertEqual(result.improvements, [])


if __name__ == '__main__':
    unittest.main()
