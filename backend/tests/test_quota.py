from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import unittest
from quota import record_request, QuotaExceeded


class Quota(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = str(Path(self.directory.name) / 'usage.sqlite3')

    def tearDown(self):
        self.directory.cleanup()

    def test_limits_persist_and_reset_at_window_boundary(self):
        record_request(self.path, per_minute=1, per_day=2, now=120)
        with self.assertRaises(QuotaExceeded) as error:
            record_request(self.path, per_minute=1, per_day=2, now=130)
        self.assertEqual(error.exception.retry_after, 50)
        record_request(self.path, per_minute=1, per_day=2, now=180)
        with self.assertRaises(QuotaExceeded) as error:
            record_request(self.path, per_minute=1, per_day=2, now=240)
        self.assertEqual(error.exception.period, 'day')
        record_request(self.path, per_minute=1, per_day=2, now=86400)

    def test_concurrent_requests_cannot_overrun_limit(self):
        def attempt(_):
            try:
                record_request(self.path, per_minute=3, now=120)
                return True
            except QuotaExceeded:
                return False
        with ThreadPoolExecutor(max_workers=6) as executor:
            self.assertEqual(sum(executor.map(attempt, range(10))), 3)


if __name__ == '__main__':
    unittest.main()
