FROM python:3.11-slim
ARG DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Install minimal system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
		build-essential \
		gcc \
		libpq-dev \
	&& rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source and switch to non-root user
COPY . .
RUN useradd --create-home --shell /bin/false appuser && chown -R appuser:appuser /app
USER appuser

ENV BACKGROUND_AGENT_API_KEY=changeme
ENV BACKGROUND_AGENT_WORKERS=4
EXPOSE 8005
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s CMD curl -f http://localhost:8005/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8005"]
