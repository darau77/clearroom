"""Persistent global request ceilings for the public jury demo; no visitor data stored."""
from contextlib import closing
import sqlite3
import time


class QuotaExceeded(Exception):
    def __init__(self, period, retry_after):
        self.period = period
        self.retry_after = retry_after


def record_request(path, per_minute=60, per_day=1000, now=None):
    current = int(time.time() if now is None else now)
    buckets = [(f'm:{current // 60}', per_minute, 60, 'minute'),
               (f'd:{current // 86400}', per_day, 86400, 'day')]
    with closing(sqlite3.connect(path, timeout=5)) as connection, connection:
        connection.execute('CREATE TABLE IF NOT EXISTS usage (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL)')
        connection.execute('BEGIN IMMEDIATE')
        for bucket, limit, duration, period in buckets:
            row = connection.execute('SELECT hits FROM usage WHERE bucket = ?', (bucket,)).fetchone()
            if row and row[0] >= limit:
                raise QuotaExceeded(period, duration - current % duration)
        for bucket, _, _, _ in buckets:
            connection.execute('INSERT INTO usage VALUES (?, 1) ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1', (bucket,))
        connection.execute('DELETE FROM usage WHERE bucket NOT IN (?, ?)', (buckets[0][0], buckets[1][0]))
