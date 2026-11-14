"""One-GPU serving preset; no client may select a model or change its context."""
import os

MODEL = os.getenv('QWEN_MODEL', 'qwen3:8b-q4_K_M')
OLLAMA_URL = os.getenv('OLLAMA_URL', 'http://ollama:11434').rstrip('/')
CONTEXT_TOKENS = 8192
CHAT_TOKENS = 180
FEEDBACK_TOKENS = 700
QUEUE_TIMEOUT = 3
KEEP_ALIVE = -1
WARMUP_ON_START = os.getenv('CLEARROOM_WARMUP', '1') == '1'
WHISPER_MODEL = os.getenv('WHISPER_MODEL', 'small.en')
WHISPER_DEVICE = 'cpu'
WHISPER_THREADS = 4
