import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
import httpx
from budget import fits_context
from config import MODEL, CONTEXT_TOKENS
from runtime import check_model, gpu_status, warm_model, RuntimeCheckError
from setup import ensure_secret, read_secret
from verify import Gateway


class Runtime(unittest.IsolatedAsyncioTestCase):
    async def test_warmup_requires_real_completion_and_gpu_residency(self):
        paths = []
        def handler(request):
            paths.append(request.url.path)
            payload = json.loads(request.content) if request.content else {}
            if request.url.path == '/api/show':
                self.assertEqual(payload['model'], MODEL)
                return httpx.Response(200, json={'details': {'family': 'qwen3', 'quantization_level': 'Q4_K_M', 'parameter_size': '8.2B'}})
            if request.url.path == '/api/chat':
                self.assertFalse(payload['think'])
                self.assertEqual(payload['keep_alive'], -1)
                self.assertEqual(payload['options']['num_ctx'], CONTEXT_TOKENS)
                return httpx.Response(200, json={'done': True, 'message': {'content': 'ready'}})
            return httpx.Response(200, json={'models': [{'name': MODEL, 'size': 6000, 'size_vram': 6000, 'context_length': CONTEXT_TOKENS}]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            self.assertEqual((await warm_model(client))['context_tokens'], CONTEXT_TOKENS)
        self.assertEqual(paths, ['/api/show', '/api/chat', '/api/ps'])

    def test_wrong_quantization_is_not_ready(self):
        for details in [{}, {'family': 'qwen3', 'quantization_level': 'F16', 'parameter_size': '8.2B'}, {'family': 'qwen3', 'quantization_level': 'Q4_K_M', 'parameter_size': '32.8B'}]:
            with self.assertRaises(RuntimeCheckError):
                check_model({'details': details})

    def test_partial_offload_is_not_ready(self):
        with self.assertRaisesRegex(RuntimeCheckError, 'model_not_on_gpu'):
            gpu_status({'models': [{'name': MODEL, 'size': 6000, 'size_vram': 3000, 'context_length': 8192}]})


class Deployment(unittest.TestCase):
    def test_secret_is_private_and_survives_redeployment(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '.env'
            self.assertTrue(ensure_secret(path))
            key = read_secret(path)
            self.assertGreaterEqual(len(key), 24)
            self.assertFalse(ensure_secret(path))
            self.assertEqual(read_secret(path), key)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_bad_secret_is_rejected_without_echoing_it(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '.env'
            path.write_text('BREV_API_KEY=bad-value\n')
            with self.assertRaises(RuntimeError) as error:
                read_secret(path)
            self.assertNotIn('bad-value', str(error.exception))

    def test_credential_cannot_be_sent_over_public_http(self):
        for url in ('http://example.com', 'https://name:password@example.com', 'https://example.com/?key=a'):
            with self.assertRaises(ValueError):
                Gateway(url, 'test-key')
        Gateway('http://127.0.0.1:8000', 'test-key')
        Gateway('https://example.com', 'test-key')


class ContextBudget(unittest.TestCase):
    def test_counts_schema_and_reserves_output(self):
        observed = []
        def encode(text, **kwargs):
            observed.append(text)
            return SimpleNamespace(ids=[0] * len(text))
        tokenizer = SimpleNamespace(encode=encode)
        messages = [{'role': 'user', 'content': 'Привет 👋'}]
        self.assertTrue(fits_context(tokenizer, messages, 180))
        self.assertFalse(fits_context(tokenizer, messages, 180, schema={'description': 'a' * 8000}))
        self.assertFalse(fits_context(tokenizer, messages, 180, reserve=8000))
        self.assertIn('Привет', observed[0])
        self.assertIn('description', observed[1])


if __name__ == '__main__':
    unittest.main()
