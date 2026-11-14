"""Run on Brev once. Creates a local secret without printing it or overwriting one."""
import os
from pathlib import Path
import secrets
ENV_PATH = Path(__file__).with_name('.env')

def ensure_secret(path=ENV_PATH):
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        if path.is_symlink():
            raise RuntimeError('The backend .env must be a regular file.')
        path.chmod(0o600)
        return False
    with os.fdopen(fd, 'w') as f:
        f.write('BREV_API_KEY=' + secrets.token_urlsafe(32) + '\n')
    return True

def read_secret(path=ENV_PATH):
    for line in path.read_text().splitlines():
        if line.startswith('BREV_API_KEY='):
            secret = line.split('=', 1)[1].strip()
            if len(secret) >= 24 and all(c.isalnum() or c in '-_' for c in secret):
                return secret
    raise RuntimeError('The backend .env needs a BREV_API_KEY of at least 24 URL-safe characters.')

if __name__ == '__main__':
    created = ensure_secret()
    read_secret()
    print('Created private .env.' if created else 'Existing private .env kept.')
