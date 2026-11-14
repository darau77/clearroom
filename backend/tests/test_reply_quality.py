"""Conversation regressions: a partner must respond, not recycle its last turn."""

import unittest
from types import SimpleNamespace

from conversation import validate_reply


def message(role, content):
    return SimpleNamespace(role=role, content=content)


class PartnerReplyQuality(unittest.TestCase):
    def test_correction_of_a_name_is_a_meaningful_change(self):
        validate_reply('I will send the report to Jordan by Friday afternoon.',[
            message('assistant','I will send the report to Alex by Friday afternoon.'),
            message('user','The recipient is Jordan, not Alex.')],'en')

    def test_short_substantive_line_is_not_a_confirmation(self):
        previous='I need to fire you.'
        with self.assertRaises(ValueError):
            validate_reply(previous,[message('assistant',previous),message('user','I want to keep my job')],'en')

    def test_jane_cannot_repeat_her_opening_after_a_concrete_concern(self):
        opening = (
            "I need to focus on what's best for the team, not just individual roles. "
            "Let's talk about how we can align our goals."
        )
        messages = [
            message('assistant', opening),
            message('user', 'I want to keep my job'),
        ]
        for reply in [opening, opening.upper(), opening.replace('.', '!')]:
            with self.subTest(reply=reply), self.assertRaises(ValueError):
                validate_reply(reply, messages, 'en')

    def test_cosmetic_rephrasing_does_not_answer_why_jane_sounds_evasive(self):
        messages = [
            message('assistant',
                    "I need to focus on what's best for the team, not just individual roles. "
                    "Let's talk about how we can align our goals."),
            message('user', 'Why are you talking like that?'),
        ]
        reply = (
            "I'm focused on what's best for the team, not just individual roles. "
            "Let's discuss how we can align our goals."
        )
        with self.assertRaises(ValueError):
            validate_reply(reply, messages, 'en')

    def test_partner_does_not_ask_an_answered_question_again(self):
        question = 'What time can you finish the hotel comparison?'
        messages = [
            message('assistant', question),
            message('user', 'By six this evening.'),
        ]
        for reply in [question, f'Okay. {question}']:
            with self.subTest(reply=reply), self.assertRaises(ValueError):
                validate_reply(reply, messages, 'en')

    def test_looping_to_an_earlier_partner_turn_is_also_rejected(self):
        opening = 'We need to discuss the missed deadline before deciding what happens next.'
        messages = [
            message('assistant', opening),
            message('user', 'I sent the report yesterday. Did you see it?'),
            message('assistant', 'I saw your email, but I have not opened the report yet.'),
            message('user', 'Can you read it before deciding whether I missed the deadline?'),
        ]
        with self.assertRaises(ValueError):
            validate_reply(opening, messages, 'en')

    def test_short_confirmation_can_restate_the_agreed_time(self):
        messages = [
            message('assistant', 'We can review it Friday at five.'),
            message('user', "So we're meeting Friday at five?"),
        ]
        validate_reply('Yes, Friday at five.', messages, 'en')

    def test_explicit_request_to_repeat_allows_the_previous_response(self):
        previous = "I'll compare the flight prices tonight, and you'll call the hotel tomorrow."
        for request in [
            'Please repeat exactly what you just said.',
            "I couldn't hear you. Can you say that again?",
        ]:
            with self.subTest(request=request):
                validate_reply(previous, [
                    message('assistant', previous),
                    message('user', request),
                ], 'en')

    def test_complaint_about_repetition_is_not_permission_to_repeat(self):
        previous = (
            "I need to focus on what's best for the team, not just individual roles. "
            "Let's talk about how we can align our goals."
        )
        for complaint in [
            'Do not repeat that corporate line.',
            'Why do you repeat that?',
        ]:
            with self.subTest(complaint=complaint), self.assertRaises(ValueError):
                validate_reply(previous, [
                    message('assistant', previous),
                    message('user', complaint),
                ], 'en')

    def test_requested_translation_preserves_the_previous_response_meaning(self):
        messages = [
            message('assistant', "I'll compare the flight prices tonight, and you'll call the hotel tomorrow."),
            message('user', 'Please translate your last answer into Russian.'),
        ]
        validate_reply(
            'Я сравню цены на авиабилеты сегодня вечером, а ты позвонишь в отель завтра.',
            messages, 'ru',
        )

    def test_ownership_clarification_can_reuse_task_and_deadline(self):
        messages = [
            message('assistant', "I'll check flight prices by five, and you'll compare hotels by six."),
            message('user', 'Confirm only what YOU will do and when.'),
        ]
        validate_reply("I'll check flight prices by five.", messages, 'en')

    def test_new_contingency_can_share_words_with_the_existing_plan(self):
        messages = [
            message('assistant', 'I can check flight prices by five.'),
            message('user', 'What if the fares go up before then?'),
        ]
        validate_reply(
            "I'll still check flight prices by five, and I'll message you sooner if they rise.",
            messages, 'en',
        )

    def test_correcting_a_deadline_can_reuse_the_rest_of_the_plan(self):
        cases = [
            (
                'I will send the revised report to the client on Friday.',
                'The client is away Friday. Please send it Monday instead.',
                'I will send the revised report to the client on Monday.',
            ),
            (
                'I will send the revised report to the client on November 16.',
                'The due date is November 17, not November 16.',
                'I will send the revised report to the client on November 17.',
            ),
            (
                'I will check flight prices by Friday, and you will compare hotels by Thursday.',
                'No, the dates are the other way round.',
                'I will check flight prices by Thursday, and you will compare hotels by Friday.',
            ),
        ]
        for previous, correction, reply in cases:
            with self.subTest(correction=correction):
                validate_reply(reply, [
                    message('assistant', previous),
                    message('user', correction),
                ], 'en')

    def test_correcting_task_owners_can_reuse_both_tasks_and_deadlines(self):
        messages = [
            message('assistant',
                    'You will send the report Friday, and I will review it Monday.'),
            message('user',
                    'That is backwards. You send the report, and I review it. The dates are right.'),
        ]
        validate_reply(
            'I will send the report Friday, and you will review it Monday.',
            messages, 'en',
        )


if __name__ == '__main__':
    unittest.main()
