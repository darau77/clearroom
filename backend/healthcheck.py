"""Container check. The bearer credential never appears in process arguments or logs."""
import json
import os
import sys
from urllib.request import Request, urlopen

try:
    request = Request('http://127.0.0.1:8000/health', headers={'Authorization': 'Bearer ' + os.environ['BREV_API_KEY']})
    with urlopen(request, timeout=6) as response:
        healthy = json.load(response).get('ready') is True
except Exception:
    healthy = False
sys.exit(0 if healthy else 1)
