FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

# Nur ein Worker: laufende TAN-Dialoge liegen im Speicher dieses Prozesses.
# Der Dienst wird NICHT nach außen veröffentlicht, nur das Backend ruft ihn
# über das interne Docker-Netz auf.
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
