"""Run on Brev once. Creates a local secret without printing it or overwriting one."""
import os
from pathlib import Path
import secrets
p=Path(__file__).with_name('.env')
if p.exists():
    print('Existing .env kept. Start services with docker compose up -d --build.')
else:
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:
        f.write('BREV_API_KEY='+secrets.token_urlsafe(32)+'\n')
    print('Created private .env. Keep this file on the server and out of Git.')
