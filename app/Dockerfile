# Stage 1: build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /workspace/app/frontend
COPY app/frontend/package*.json ./
RUN npm ci --silent
COPY app/frontend/ ./
RUN npm run build

# Stage 2: Python backend with built frontend
FROM python:3.11-slim
WORKDIR /workspace

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Copy Python package files
COPY pyproject.toml ./
COPY src/ ./src/
COPY app/backend/ ./app/backend/

# Install Python deps
RUN pip install --no-cache-dir -e ".[app]"

# Copy built frontend
COPY --from=frontend-builder /workspace/dist ./dist

ENV FOREKO_STORAGE_DIR=/data
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "foreko.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
