# Dialysis Companion API (FastAPI, server/)
# The static site (*.html, *.js) is deployed separately to GitHub Pages.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/var/data/dialysis-admin.sqlite

WORKDIR /app

COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ ./

# Encrypted SQLite database lives here.
# Mount a persistent volume at /var/data or data is lost on every redeploy.
RUN mkdir -p /var/data && chmod 700 /var/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/api/health', timeout=3)"

CMD ["python", "run.py"]
