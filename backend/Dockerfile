FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*


COPY requirements.txt .

# Install PyTorch with CPU wheels (required for sentence-transformers)
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch

# Install other requirements, using the CPU whl index as fallback for transitives
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
