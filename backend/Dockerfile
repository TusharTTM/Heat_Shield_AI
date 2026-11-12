FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt \
    && useradd --create-home --uid 10001 heatshield \
    && mkdir -p /app/data /app/ml/saved_models \
    && chown -R heatshield:heatshield /app/data /app/ml/saved_models

COPY backend /app/backend
COPY shared /app/shared
COPY ml/saved_models/README.md /app/ml/saved_models/README.md

ENV DATABASE_URL=sqlite:////app/data/heatshield.db
USER heatshield
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=3)" || exit 1
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
