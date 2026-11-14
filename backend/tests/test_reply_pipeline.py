"""Regression coverage for the complete bounded partner-reply pipeline."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import main
from intelligence import checked_reply


REPEATED = (
    "I need to focus on what's best for the team, not just individual roles. "
    "Let's talk about how we can align our goals."
)
DIRECT = "You're right, I was vague. What specifically made you think your job is at risk?"
REPAIRED = "I should have explained myself clearly. What happened that made you worry about losing your job?"
PARTNER = {
    "name": "Jane",
    "role": "Project manager",
    "relationship": "Manager",
    "personality": "Direct, reserved, and willing to listen",
    "context": "I am worried about losing my job and want to discuss it with my manager.",
    "objective": "Explain my concern and understand the situation.",
    "opening": "We need to talk about how things are going.",
}


def conversation(messages=None, **overrides):
    return main.Conversation.model_validate({
        "scenario": "custom",
        "custom_partner": PARTNER,
        "messages": messages if messages is not None else [
            {"role": "assistant", "content": REPEATED},
            {"role": "user", "content": "I want to keep my job"},
            {"role": "assistant", "content": REPEATED},
            {"role": "user", "content": "why you talking like that"},
        ],
        **overrides,
    })


def draft(reply=DIRECT, language="en", responsibilities=None):
    return {
        "partner_position": "Jane is the learner's manager; no decision about employment has been established.",
        "latest_user_need": "The learner needs a direct response that addresses their latest concern.",
        "language": language,
        "responsibilities": responsibilities or [],
        "reply": reply,
    }


def review(reply=DIRECT, language="en", **overrides):
    return {
        "problem": "none",
        "reason": "The draft addresses the latest turn and preserves the speakers and known facts.",
        "language": language,
        "reply": reply,
        "ownership_checked": True,
        "language_checked": True,
        **overrides,
    }


class ReplyPipeline(unittest.IsolatedAsyncioTestCase):
    async def test_draft_uses_exact_native_turns_and_separate_sampling(self):
        c = conversation()
        generator = AsyncMock(side_effect=[draft(), review()])
        with patch("intelligence.structured", generator):
            result = await checked_reply(SimpleNamespace(), c)

        self.assertEqual(result, {"reply": DIRECT, "language": "en"})
        self.assertEqual(generator.await_count, 2)
        draft_call, audit_call = generator.await_args_list
        native = [message for message in draft_call.args[1] if message["role"] != "system"]
        expected = [{"role": message.role, "content": message.content} for message in c.messages]
        self.assertEqual(native, expected)
        self.assertEqual(draft_call.args[1][-1], expected[-1])
        self.assertEqual(draft_call.kwargs.get("temperature"), .7)
        self.assertEqual(audit_call.kwargs.get("temperature"), .7)
        self.assertEqual(draft_call.kwargs.get("repeat_penalty"), 1.08)
        self.assertNotIn("repeat_penalty", audit_call.kwargs)

    async def test_repeated_draft_is_replaced_before_review(self):
        generator = AsyncMock(side_effect=[draft(REPEATED), draft(), review()])
        with patch("intelligence.structured", generator):
            result = await checked_reply(SimpleNamespace(), conversation())

        self.assertEqual(result["reply"], DIRECT)
        self.assertEqual(generator.await_count, 3)
        schemas = [call.args[2]["properties"] for call in generator.await_args_list]
        self.assertIn("responsibilities", schemas[0])
        self.assertIn("responsibilities", schemas[1])
        self.assertIn("ownership_checked", schemas[2])

    async def test_reviewer_cannot_reintroduce_a_repeated_reply(self):
        generator = AsyncMock(side_effect=[
            draft(), review(REPEATED, problem="deflection", reason="The draft needs a more direct response."),
            draft(REPAIRED), review(REPAIRED),
        ])
        with patch("intelligence.structured", generator):
            result = await checked_reply(SimpleNamespace(), conversation())

        self.assertEqual(result["reply"], REPAIRED)
        self.assertEqual(generator.await_count, 4)

    async def test_no_problem_review_cannot_rewrite_a_valid_draft(self):
        generator = AsyncMock(side_effect=[draft(), review(REPAIRED)])
        with patch("intelligence.structured", generator):
            result = await checked_reply(SimpleNamespace(), conversation())

        self.assertEqual(result["reply"], DIRECT)
        self.assertEqual(generator.await_count, 2)

    async def test_flagged_but_unchanged_review_triggers_targeted_retry(self):
        evasive = "Let's consider the bigger picture together."
        reason = "The draft avoids explaining the character's evasive wording."
        generator = AsyncMock(side_effect=[
            draft(evasive), review(evasive, problem="deflection", reason=reason),
            draft(REPAIRED), review(REPAIRED),
        ])
        with patch("intelligence.structured", generator):
            result = await checked_reply(SimpleNamespace(), conversation())

        self.assertEqual(result["reply"], REPAIRED)
        self.assertEqual(generator.await_count, 4)
        second_draft_messages = generator.await_args_list[2].args[1]
        self.assertIn(reason, second_draft_messages[0]["content"])

    async def test_two_repeated_drafts_fail_without_a_canned_fallback(self):
        generator = AsyncMock(side_effect=[draft(REPEATED), draft(REPEATED)])
        with patch("intelligence.structured", generator):
            with self.assertRaises(ValueError):
                await checked_reply(SimpleNamespace(), conversation())

        self.assertEqual(generator.await_count, 2)
        for call in generator.await_args_list:
            self.assertIn("responsibilities", call.args[2]["properties"])

    async def test_opening_does_not_add_fictional_learner_dialogue(self):
        opening = "Let's talk about your position. What is worrying you?"
        generator = AsyncMock(side_effect=[draft(opening), review(opening)])
        with patch("intelligence.structured", generator):
            result = await checked_reply(SimpleNamespace(), conversation(messages=[]), opening=True)

        self.assertEqual(result["reply"], opening)
        self.assertEqual(generator.await_count, 2)
        draft_messages = generator.await_args_list[0].args[1]
        self.assertTrue(draft_messages)
        administrative_request = {
            "role": "user",
            "content": "Begin the fictional scene as PARTNER. This is a generation instruction, not dialogue from the learner.",
        }
        self.assertEqual(
            [message for message in draft_messages if message["role"] != "system"],
            [administrative_request],
        )
        self.assertEqual(draft_messages[-1], administrative_request)

    async def test_unchecked_ownership_or_language_fails_closed(self):
        for flag in ("ownership_checked", "language_checked"):
            with self.subTest(flag=flag):
                generator = AsyncMock(side_effect=[
                    draft(), review(**{flag: False}),
                    draft(REPAIRED), review(REPAIRED, **{flag: False}),
                ])
                with patch("intelligence.structured", generator):
                    with self.assertRaises(ValueError):
                        await checked_reply(SimpleNamespace(), conversation())
                self.assertEqual(generator.await_count, 4)

    async def test_review_cannot_override_the_selected_language(self):
        reply = "Я выразилась непонятно. Что заставило вас беспокоиться о своей работе?"
        generator = AsyncMock(side_effect=[
            draft(reply, "ru"), review(DIRECT, "en", problem="language"),
            draft(reply, "ru"), review(REPAIRED, "en", problem="language"),
        ])
        with patch("intelligence.structured", generator):
            with self.assertRaises(ValueError):
                await checked_reply(SimpleNamespace(), conversation(language="ru"))

        self.assertEqual(generator.await_count, 4)

    async def test_selected_language_survives_a_successful_review(self):
        reply = "Я выразилась непонятно. Что заставило вас беспокоиться о своей работе?"
        generator = AsyncMock(side_effect=[draft(reply, "ru"), review(reply, "ru")])
        with patch("intelligence.structured", generator):
            result = await checked_reply(SimpleNamespace(), conversation(language="ru"))

        self.assertEqual(result, {"reply": reply, "language": "ru"})
        self.assertEqual(generator.await_count, 2)

    async def test_review_receives_verbatim_task_evidence_with_its_speaker(self):
        c = conversation(messages=[
            {"role": "assistant", "content": "I can check flights."},
            {"role": "user", "content": "I will compare hotels tonight. You said you would check flights."},
        ])
        evidence = {
            "turn": 2, "quote": "I will compare hotels tonight.", "owner": "LEARNER",
            "action": "Compare hotels tonight", "status": "agreed",
        }
        reply = "Yes, I'll check flights. You're comparing hotels tonight."
        generator = AsyncMock(side_effect=[draft(reply, responsibilities=[evidence]), review(reply)])
        with patch("intelligence.structured", generator):
            result = await checked_reply(SimpleNamespace(), c)

        self.assertEqual(result["reply"], reply)
        audit_messages = generator.await_args_list[1].args[1]
        audit_text = "\n".join(message["content"] for message in audit_messages)
        self.assertIn(json.dumps(evidence, ensure_ascii=False), audit_text)
        self.assertIn('"speaker": "PARTNER"', audit_text)
        self.assertIn('"speaker": "LEARNER"', audit_text)


if __name__ == "__main__":
    unittest.main()
