# Stage 1: Build frontend with Node
FROM node:20-alpine as frontend-build

WORKDIR /frontend

COPY frontend/package*.json ./

RUN npm ci

COPY frontend/ ./

RUN npm run build

# Stage 2: Python backend with frontend static files
FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application
COPY backend/app ./app
COPY backend/tests ./tests

# Copy frontend build output
COPY --from=frontend-build /frontend/dist ./static

# Create entrypoint script
RUN echo '#!/bin/sh\nset -e\nuvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE ${PORT:-10000}

CMD ["/bin/sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
