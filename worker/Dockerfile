FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt requirements-linux.lock ./
RUN pip install --no-cache-dir -r requirements.txt -c requirements-linux.lock
RUN useradd --create-home worker
COPY --chown=worker:worker agent.py sentiment.py ./
USER worker
CMD ["python", "agent.py", "start"]
