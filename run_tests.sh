#!/bin/bash
docker run --rm -v $(pwd):/app -w /app/ai-engine python:3.11-slim bash -c "pip install -r requirements.txt && python -m pytest tests/"
