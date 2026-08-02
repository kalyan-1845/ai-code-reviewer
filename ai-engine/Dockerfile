FROM python:3.11-slim

WORKDIR /usr/src/app

COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /usr/src/app

USER appuser

EXPOSE 8000

CMD ["python", "app.py"]
