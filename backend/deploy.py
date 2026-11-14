"""Deploy Clearroom on an existing Linux NVIDIA host; never creates a paid VM."""
import argparse
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import time
from urllib.error import HTTPError
from setup import ensure_secret, read_secret
from verify import Gateway, verify
from config import MODEL

ROOT = Path(__file__).resolve().parent


def run(args, capture=False, timeout=120):
    return subprocess.run(args, cwd=ROOT, check=True, text=True, capture_output=capture, timeout=timeout)


def compose(*args, capture=False, timeout=120):
    return run(['docker', 'compose', *args], capture=capture, timeout=timeout)


def preflight():
    if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'AMD64'):
        raise RuntimeError('Run deployment on the Linux x86_64 GPU server, not this computer.')
    for tool in ('nvidia-smi', 'docker'):
        if not shutil.which(tool):
            raise RuntimeError(f'{tool} is missing. Install the host driver/Docker before deployment.')
    gpu = run(['nvidia-smi', '--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], capture=True).stdout.strip()
    first_gpu = gpu.splitlines()[0].split(',')
    if len(gpu.splitlines()) != 1 or float(first_gpu[1]) < 15000:
        raise RuntimeError('This preset requires one NVIDIA GPU with at least 15,000 MiB VRAM.')
    if int(first_gpu[2].strip().split('.')[0]) < 550:
        raise RuntimeError('Ollama requires NVIDIA driver 550 or newer on the selected T4.')
    ram_gib = int(re.search(r'^MemTotal:\s+(\d+)', Path('/proc/meminfo').read_text(), re.M)[1]) / 1024**2
    if ram_gib < 14:
        raise RuntimeError('Use the selected 16 GiB system-RAM instance for this speech + Qwen preset.')
    if (os.cpu_count() or 0) < 4:
        raise RuntimeError('This CPU transcription preset expects at least four vCPUs.')
    compose('version', capture=True)
    docker_info = json.loads(run(['docker', 'info', '--format', '{{json .}}'], capture=True).stdout)
    root = Path(docker_info['DockerRootDir'])
    # Check Docker's volume, where images and model weights will actually live.
    while not root.exists() and root != root.parent:
        root = root.parent
    if shutil.disk_usage(root).free < 20 * 1024**3:
        raise RuntimeError('At least 20 GiB free space on the Docker volume is needed before downloading models.')
    print(f'Host ready: {first_gpu[0].strip()}, {ram_gib:.1f} GiB RAM, {os.cpu_count()} CPUs', flush=True)


def wait_for_ollama():
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            compose('exec', '-T', 'ollama', 'ollama', 'list', capture=True, timeout=10)
            return
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            time.sleep(3)
    raise RuntimeError('Ollama did not start within three minutes. Check docker compose logs ollama.')


def wait_for_gateway(gateway):
    deadline = time.monotonic() + 1200
    last_phase = None
    while time.monotonic() < deadline:
        try:
            status = gateway.health()
            phase = status.get('phase', 'starting')
            if status.get('ready') is True:
                return
        except Exception:
            phase = 'starting_api'
        if phase != last_phase:
            print('Startup:', phase, flush=True)
            last_phase = phase
        time.sleep(5)
    raise RuntimeError('Warm-up exceeded 20 minutes. Check docker compose logs api; preserve .env and retry.')


def start_tunnel(key):
    compose('--profile', 'tunnel', 'up', '-d', 'tunnel', timeout=300)
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        logs = compose('logs', '--no-color', '--tail', '80', 'tunnel', capture=True).stdout
        urls = re.findall(r'https://[a-z0-9-]+\.trycloudflare\.com', logs)
        if urls:
            gateway = Gateway(urls[-1], key)
            try:
                if gateway.health().get('ready') is True:
                    verify(gateway)
                    print('Temporary HTTPS endpoint:', urls[-1], flush=True)
                    print('Hostname changes if the tunnel restarts. Keep the API key private in .env.', flush=True)
                    return
            except OSError:
                pass
        time.sleep(3)
    raise RuntimeError('Tunnel did not become reachable. Local backend remains running; inspect tunnel logs.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preflight', action='store_true', help='Only inspect the host; do not start or download services.')
    parser.add_argument('--tunnel', action='store_true', help='Also start and test a temporary authenticated HTTPS endpoint.')
    args = parser.parse_args()
    preflight()
    if args.preflight:
        return
    ensure_secret()
    key = read_secret()
    compose('config', '--quiet', capture=True)
    print('Starting Ollama and downloading the 9.3 GB Qwen model if needed…', flush=True)
    compose('up', '-d', 'ollama', timeout=600)
    wait_for_ollama()
    compose('exec', '-T', 'ollama', 'nvidia-smi', capture=True)
    compose('exec', '-T', 'ollama', 'ollama', 'pull', MODEL, timeout=1800)
    print('Building the gateway; first startup also downloads the tokenizer and speech model…', flush=True)
    compose('up', '-d', '--build', 'api', timeout=1800)
    gateway = Gateway('http://127.0.0.1:8000', key)
    wait_for_gateway(gateway)
    verify(gateway)
    compose('exec', '-T', 'ollama', 'ollama', 'ps')
    print('Local backend ready. Website connection still requires its HTTPS URL and server-only key.', flush=True)
    if args.tunnel:
        start_tunnel(key)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError) as exc:
        print('Deployment stopped:', str(exc), flush=True)
        raise SystemExit(1)
    except HTTPError as exc:
        print('Deployment stopped: gateway returned HTTP', exc.code, 'after the last reported check.', flush=True)
        raise SystemExit(1)
    except (OSError, subprocess.SubprocessError) as exc:
        print('Deployment stopped:', type(exc).__name__, '— check the preceding step and retry.', flush=True)
        raise SystemExit(1)
