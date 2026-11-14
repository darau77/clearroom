import json
from pathlib import Path
import random
import sqlite3
import tempfile
import unittest
from question_bank import SKILLS, seed_bank, references


class StoredQuestionBank(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.path = Path(self.folder.name) / 'bank.sqlite3'
        self.seed = Path(self.folder.name) / 'seed.json'
        self.data = {
            'version': 1,
            'units': [{'id': skill, 'title': skill.title(), 'description': 'A useful communication skill.', 'tip': 'Practise one action.', 'color': 'green'} for skill in SKILLS],
            'questions': [self.question(i, level) for i, level in enumerate([1, 1, 2, 2, 3], 1)],
        }
        self.write_seed()

    def question(self, number, level):
        return {'id': f'observations-blank-{number}', 'skill': 'observations', 'kind': 'blank', 'level': level, 'context': f'A shared plan changed in example {number}.', 'prompt': 'I noticed ___.', 'answer': f'the plan changed on day {number}', 'rubric': 'Name an observable event.', 'hint': 'Use an observation.', 'explanation': 'The response describes an event rather than a motive.'}

    def write_seed(self):
        self.seed.write_text(json.dumps(self.data))

    def fetch(self, **kwargs):
        return references('blank', 'observations', path=self.path, seed_path=self.seed, rng=random.Random(4), **kwargs)

    def test_seed_is_idempotent_and_contains_only_authored_payloads(self):
        first = seed_bank(self.path, self.seed)
        second = seed_bank(self.path, self.seed)
        self.assertEqual(first['version'], 1)
        self.assertEqual(first['count'], second['count'])
        with sqlite3.connect(self.path) as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM authored_questions').fetchone()[0], 5)
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            self.assertEqual(tables, {'bank_meta', 'authored_questions'})
            self.assertEqual(json.loads(connection.execute('SELECT payload FROM authored_questions ORDER BY id LIMIT 1').fetchone()[0]), self.data['questions'][0])

    def test_new_seed_replaces_stale_authored_rows_atomically(self):
        seed_bank(self.path, self.seed)
        removed = self.data['questions'][0]['id']
        self.data['version'] = 2
        self.data['questions'] = [self.question(8, 3)]
        self.write_seed()
        result = seed_bank(self.path, self.seed)
        self.assertEqual(result['version'], 2)
        with sqlite3.connect(self.path) as connection:
            ids = [row[0] for row in connection.execute('SELECT id FROM authored_questions')]
            self.assertEqual(ids, ['observations-blank-8'])
            self.assertNotIn(removed, ids)

    def test_content_change_in_same_version_also_refreshes_bank(self):
        seed_bank(self.path, self.seed)
        self.data['questions'][0]['answer'] = 'a corrected observable fact'
        self.write_seed()
        seed_bank(self.path, self.seed)
        with sqlite3.connect(self.path) as connection:
            stored = json.loads(connection.execute('SELECT payload FROM authored_questions WHERE id=?', (self.data['questions'][0]['id'],)).fetchone()[0])
            self.assertEqual(stored['answer'], 'a corrected observable fact')

    def test_matching_skill_mode_level_and_unseen_examples_are_preferred(self):
        examples = self.fetch(level=2, limit=2)['questions']
        self.assertEqual([q['level'] for q in examples], [2, 2])
        excluded = [q['id'] for q in examples]
        fresh = self.fetch(level=2, exclude_ids=excluded, limit=3)['questions']
        self.assertTrue(all(q['id'] not in excluded for q in fresh))
        self.assertTrue(all(q['kind'] == 'blank' and q['skill'] == 'observations' for q in fresh))

    def test_seen_examples_remain_available_as_references_not_returned_drills(self):
        result = self.fetch(exclude_ids=[q['id'] for q in self.data['questions']])
        self.assertEqual(len(result['questions']), 3)
        self.assertEqual(result['unit']['id'], 'observations')

    def test_duplicate_seed_id_cannot_replace_an_existing_good_bank(self):
        seed_bank(self.path, self.seed)
        self.data['questions'].append(self.data['questions'][0])
        self.write_seed()
        with self.assertRaises(ValueError):
            seed_bank(self.path, self.seed)
        with sqlite3.connect(self.path) as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM authored_questions').fetchone()[0], 5)

    def test_filter_parameters_are_validated_and_never_interpolated_sql(self):
        for values in [('blank', "observations' OR 1=1 --", 1), ('unknown', 'observations', 1), ('blank', 'observations', 4)]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                references(*values, path=self.path, seed_path=self.seed)


if __name__ == '__main__':
    unittest.main()
