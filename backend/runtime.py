"""Validate the downloaded model and check GPU residency before advertising readiness."""
from config import MODEL, OLLAMA_URL, CONTEXT_TOKENS, KEEP_ALIVE

class RuntimeCheckError(Exception):
    pass


def check_model(data):
    details = data.get('details', {})
    if details.get('family') != 'qwen3' or details.get('quantization_level') != 'Q4_K_M':
        raise RuntimeCheckError('wrong_model_format')
    if not str(details.get('parameter_size', '')).startswith('8.'):
        raise RuntimeCheckError('wrong_model_size')


def gpu_status(data):
    model = next((m for m in data.get('models', []) if m.get('name') == MODEL), None)
    if not model:
        raise RuntimeCheckError('model_not_loaded')
    size = model.get('size', 0)
    vram = model.get('size_vram', 0)
    context = model.get('context_length', 0)
    if not isinstance(size, (int, float)) or not isinstance(vram, (int, float)) or size <= 0 or vram < size * .95:
        raise RuntimeCheckError('model_not_on_gpu')
    if not isinstance(context, int) or context != CONTEXT_TOKENS:
        raise RuntimeCheckError('wrong_context_length')
    return {'gpu_memory_bytes': int(vram), 'context_tokens': context}


async def warm_model(client):
    response = await client.post(OLLAMA_URL + '/api/show', json={'model': MODEL})
    response.raise_for_status()
    check_model(response.json())
    response = await client.post(OLLAMA_URL + '/api/chat', json={
        'model': MODEL, 'think': False, 'stream': False, 'keep_alive': KEEP_ALIVE,
        'messages': [{'role': 'user', 'content': 'Reply with the word ready.'}],
        'options': {'num_ctx': CONTEXT_TOKENS, 'num_predict': 12, 'temperature': 0},
    }, timeout=300)
    response.raise_for_status()
    data = response.json()
    if data.get('done') is not True or not data.get('message', {}).get('content', '').strip():
        raise RuntimeCheckError('model_warmup_failed')
    response = await client.get(OLLAMA_URL + '/api/ps', timeout=4)
    response.raise_for_status()
    return gpu_status(response.json())
