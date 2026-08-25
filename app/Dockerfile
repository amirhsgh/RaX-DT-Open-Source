# Built on the official GNINA image so the `gnina` docking binary is already
# compiled and on PATH (building GNINA from source is its own multi-hour
# CUDA/Caffe/OpenBabel undertaking - reusing the maintained image is far more
# reliable than reproducing that build here).
FROM gnina/gnina:latest

# The base image's bundled Python version isn't guaranteed, and the pinned
# wheels in requirements.txt (rdkit, pymol-open-source) are built for 3.12 -
# so install our own interpreter via deadsnakes rather than relying on
# whatever `python3` the base image happens to ship.
RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
        python3.12 python3.12-venv python3.12-dev \
        openbabel \
        libmagic1 \
        libxrender1 libxext6 libsm6 libglu1-mesa \
        curl \
    && rm -rf /var/lib/apt/lists/*

RUN python3.12 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
