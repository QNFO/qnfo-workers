# YT-SERVER-1: render image for qnfo-youtube. Manim + ffmpeg + pango/cairo; serves /render on :8080.
FROM python:3.12-slim-bookworm
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ffmpeg libpango1.0-dev libcairo2-dev pkg-config gcc fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "manim==0.18.1" "numpy<2"
WORKDIR /app
COPY short_scene.py render.py server.py /app/
EXPOSE 8080
CMD ["python", "-u", "/app/server.py"]
