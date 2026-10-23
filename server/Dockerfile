FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer python3-uno fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin app
WORKDIR /app
COPY convert.py docx_check.py ./
# jamais en root : un fichier piégé n'aurait accès qu'à ce compte sans droits
USER app
ENV HOME=/home/app PORT=8080
# ALLOW_ORIGIN = adresse(s) du site (séparées par des virgules) ; TRUST_PROXY=1 si l'hébergeur place un proxy devant
CMD ["python3", "convert.py"]
