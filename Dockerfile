FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY novabank ./novabank
COPY templates ./templates
COPY static ./static
COPY seed_ledger.py .

ENV PORT=5002
CMD uvicorn novabank.main:app --host 0.0.0.0 --port ${PORT}
