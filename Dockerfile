# Dialysis Companion API + website (FastAPI, server/)
# The static site is served by the API at / so the app and the API share one origin.
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

# The website, served at / by the API process.
COPY *.html ./static/
COPY *.css *.js ./static/

# Point the browser app at this origin. Without this the site falls back to its
# browser-only vault and nothing syncs across devices.
RUN sed -i 's|<meta name="admin-api" content="">|<meta name="admin-api" content="https://dialysisform.com">|' \
      /app/static/records.html /app/static/admin.html \
 && grep -q 'content="https://dialysisform.com"' /app/static/records.html

# Encrypted SQLite database lives here.
# Mount a persistent volume at /var/data or data is lost on every redeploy.
# The API never runs as root: if you use a host bind mount instead of a Docker
# volume, chown it to 10001:10001 first.
RUN mkdir -p /var/data \
 && chown -R 10001:10001 /app /var/data \
 && chmod 700 /var/data

USER 10001:10001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/api/health', timeout=3)"

CMD ["python", "run.py"]
