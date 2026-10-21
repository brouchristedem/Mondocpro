FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer python3-uno fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY convert.py .
ENV HOME=/tmp PORT=8080
CMD ["python3", "convert.py"]
