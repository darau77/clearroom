"""Count with Qwen's own tokenizer and reserve space for formatting and output."""
import json
from config import CONTEXT_TOKENS

TOKENIZER_REPO = 'Qwen/Qwen3-8B'
TOKENIZER_REVISION = '47719a242beab8f9aecc40ce3928b034dd5dd559'


def load_tokenizer():
    from huggingface_hub import hf_hub_download
    from tokenizers import Tokenizer
    path = hf_hub_download(TOKENIZER_REPO, 'tokenizer.json', revision=TOKENIZER_REVISION)
    return Tokenizer.from_file(path)


def fits_context(tokenizer, messages, output_tokens, schema=None, reserve=0):
    # Counting JSON also budgets escaped transcript data used by the coach.
    serialized = json.dumps(messages, ensure_ascii=False)
    if schema:
        serialized += json.dumps(schema, ensure_ascii=False)
    count = len(tokenizer.encode(serialized, add_special_tokens=False).ids)
    # Cover Ollama's message delimiters, generation prefix and non-thinking suffix.
    return count + 256 + 16 * len(messages) + output_tokens + reserve <= CONTEXT_TOKENS
