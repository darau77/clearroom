set -eu
cd /home/ubuntu/clearroom/backend
docker compose exec -T ollama ollama show --license qwen3:14b-q4_K_M > /home/ubuntu/clearroom/qwen3-14b-license.txt
printf 'Captured the deployed Qwen model license without inference.\n'
