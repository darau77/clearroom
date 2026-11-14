FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/models/huggingface
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py policy.py config.py runtime.py budget.py healthcheck.py quota.py conversation.py intelligence.py work_queue.py exercises.py ./
RUN useradd -m -u 10001 app && mkdir -p /models/huggingface /data && chown -R app:app /models /data
USER app
EXPOSE 8000
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000","--no-access-log","--limit-concurrency","16"]
