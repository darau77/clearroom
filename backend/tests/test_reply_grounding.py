import unittest
from types import SimpleNamespace
from conversation import validate_history_claims

class HistoryClaims(unittest.TestCase):
 def test_sparse_ceo_scene_does_not_imply_previous_warnings_or_remediation(self):
  for reply in [
   "I've already warned you about this.",
   "We've discussed this before, and there's been no improvement.",
   "You haven't shown any improvement.",
  ]:
   with self.subTest(reply=reply),self.assertRaises(ValueError):
    validate_history_claims(reply,[],'Jane is the CEO and is trying to fire me.')
 def test_earlier_ai_claim_cannot_create_evidence(self):
  messages=[SimpleNamespace(role='assistant',content="I've already warned you."),SimpleNamespace(role='user',content='I want to keep my job')]
  with self.assertRaises(ValueError):validate_history_claims("I've already warned you.",messages,'Jane is the CEO and is trying to fire me.')
 def test_supplied_history_and_forward_looking_options_are_allowed(self):
  validate_history_claims("We have discussed this before.",[],'We discussed my performance last week.')
  validate_history_claims("Your performance hasn't met expectations.",[],'Jane says my performance is below expectations.')
  validate_history_claims("If you want to stay, we can discuss a performance plan.",[],'Jane is the CEO and is trying to fire me.')
  validate_history_claims("Yes, your job is at risk. I am considering ending your employment.",[],'Jane is the CEO and is trying to fire me.')
  validate_history_claims("You have been clear about what you need.",[],'We need to agree a plan.')
  # A fictional character can express a current judgment without inventing a prior meeting.
  validate_history_claims("Your performance hasn't met my expectations.",[],'Jane is the CEO and is trying to fire me.')
