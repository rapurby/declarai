FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install all deps, then force headless opencv to avoid libGL dependency
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir --force-reinstall opencv-python-headless

COPY . .

EXPOSE 8080

CMD alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
