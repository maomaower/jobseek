# Stage 1: Build the backend
FROM python:3.12-slim
WORKDIR /app

# Install system dependencies (if any)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . ./app

# Copy built frontend from Stage 1 into the backend's expected static directory

# Expose the default port (Render will override this via PORT env var)
EXPOSE 8000

# Command to run the server, use the PORT environment variable if available
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
