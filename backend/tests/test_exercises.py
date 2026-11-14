import unittest
from exercises import Exercise,validate_exercise
class AdaptiveValidation(unittest.TestCase):
 def sample(self,kind='write'):
  return Exercise(title='Practice',description='Three fictional moments.',questions=[{'id':str(i),'prompt':'Write a reply for moment '+str(i),'context':'Your friend needs clear plans.','answer':'I will compare hotels by six.','explanation':'The reply gives a clear owner and deadline.','rubric':'Name the owner and a useful next step.'} for i in range(3)])
 def test_repeated_content_is_rejected_even_with_unique_ids(self):
  v=self.sample();v.questions[1].prompt=v.questions[0].prompt;v.questions[1].context=v.questions[0].context
  with self.assertRaises(ValueError):validate_exercise(v,'write')
 def test_build_bank_must_match_answer_exactly(self):
  v=self.sample()
  for i,q in enumerate(v.questions):q.answer+=' '+str(i);q.words=q.answer.split()[::-1]
  validate_exercise(v,'build');v.questions[1].words.pop()
  with self.assertRaises(ValueError):validate_exercise(v,'build')
 def test_options_must_contain_one_intended_answer(self):
  v=self.sample()
  for q in v.questions:q.options=[q.answer,'Whatever.','This is all your fault.']
  validate_exercise(v,'choose');v.questions[0].options[1]=v.questions[0].answer
  with self.assertRaises(ValueError):validate_exercise(v,'choose')
