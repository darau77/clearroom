"""Versioned, authored reference exercises. No visitor content is stored here."""
from contextlib import closing
from hashlib import sha256
import json
import os
from pathlib import Path
import random
import sqlite3

SKILLS = ('observations', 'curiosity', 'empathy', 'boundaries', 'agreements', 'repair')
KINDS = ('blank', 'build', 'choose', 'write')
SEED_PATH = Path(__file__).with_name('data') / 'drill-bank.json'


def database_path():
    return Path(os.environ.get('CLEARROOM_QUESTION_BANK_DB', str(SEED_PATH.with_suffix('.sqlite3'))))


def seed_bank(path=None, seed_path=None):
    """Replace only authored rows atomically when the checked-in seed changes."""
    path = Path(path) if path is not None else database_path()
    source = Path(seed_path) if seed_path is not None else SEED_PATH
    raw = source.read_bytes()
    digest = sha256(raw).hexdigest()
    data = json.loads(raw)
    if not isinstance(data.get('version'), int) or data['version'] < 1:
        raise ValueError('Invalid question-bank version')
    questions = data.get('questions', [])
    units = data.get('units', [])
    if not questions or {u.get('id') for u in units} != set(SKILLS):
        raise ValueError('Question bank must define all six communication skills')
    seen = set()
    rows = []
    for question in questions:
        identifier = question.get('id')
        if not isinstance(identifier, str) or not identifier or identifier in seen:
            raise ValueError('Question-bank IDs must be unique')
        if question.get('skill') not in SKILLS or question.get('kind') not in KINDS or question.get('level') not in (1, 2, 3):
            raise ValueError('Invalid question-bank classification')
        if not all(isinstance(question.get(key), str) and question[key].strip() for key in ('context', 'prompt', 'answer', 'rubric')):
            raise ValueError('Question-bank content is incomplete')
        seen.add(identifier)
        rows.append((identifier, question['skill'], question['kind'], question['level'], json.dumps(question, ensure_ascii=False)))
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path, timeout=5)) as connection, connection:
        connection.execute('CREATE TABLE IF NOT EXISTS bank_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        connection.execute('CREATE TABLE IF NOT EXISTS authored_questions (id TEXT PRIMARY KEY, skill TEXT NOT NULL, kind TEXT NOT NULL, level INTEGER NOT NULL, payload TEXT NOT NULL)')
        connection.execute('CREATE INDEX IF NOT EXISTS authored_lookup ON authored_questions(skill, kind, level)')
        connection.execute('BEGIN IMMEDIATE')
        previous = connection.execute("SELECT value FROM bank_meta WHERE key='digest'").fetchone()
        if not previous or previous[0] != digest:
            connection.execute('DELETE FROM authored_questions')
            connection.executemany('INSERT INTO authored_questions VALUES (?, ?, ?, ?, ?)', rows)
            connection.executemany('INSERT INTO bank_meta VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [
                ('digest', digest), ('version', str(data['version'])), ('units', json.dumps(units, ensure_ascii=False)),
            ])
    return {'path': path, 'version': data['version'], 'count': len(rows), 'units': units}


def references(kind, skill, level=1, exclude_ids=(), limit=3, path=None, seed_path=None, rng=None):
    """Prefer unseen examples at the requested level, without exposing an API DB."""
    if kind not in KINDS or skill not in SKILLS or level not in (1, 2, 3):
        raise ValueError('Unknown exercise classification')
    if not 1 <= limit <= 5:
        raise ValueError('Reference count is outside its bound')
    metadata = seed_bank(path, seed_path)
    with closing(sqlite3.connect(metadata['path'], timeout=5)) as connection:
        rows = connection.execute('SELECT payload FROM authored_questions WHERE kind=? AND skill=?', (kind, skill)).fetchall()
    examples = [json.loads(row[0]) for row in rows]
    if not examples:
        raise ValueError('No authored examples exist for this exercise')
    randomizer = rng if rng is not None else random.SystemRandom()
    randomizer.shuffle(examples)
    excluded = set(exclude_ids)
    examples.sort(key=lambda q: (q['id'] in excluded, abs(q['level'] - level)))
    # These are references, not served questions. When every reference was seen,
    # it can still teach Qwen the task structure for a genuinely new variation.
    unit = next(u for u in metadata['units'] if u['id'] == skill)
    return {'version': metadata['version'], 'unit': unit, 'questions': examples[:limit]}
