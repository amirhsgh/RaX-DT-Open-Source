# RaX-DT

A virtual screening / molecular docking platform: upload a protein receptor and
a set of candidate ligands, run a docking job (powered by [GNINA](https://github.com/gnina/gnina)),
and inspect the results in 3D. Includes a chatbot assistant that can run jobs
for you conversationally.

## Features

- **Chatbot** — describe what you want in plain language; it can inspect your
  uploaded files, start a docking run, and report on job status.
- **Multi-file upload** — upload a protein receptor, one or more ligands, and
  an optional reference ligand, individually or in batch.
- **Job running** — a Celery-backed queue runs docking jobs in the background
  and reports live progress.
- **Structure visualization**, PDB/PubChem lookup, protein preparation, and a
  benchmark suite (DUD-E / LIT-PCBA style) for validating docking accuracy.

This is a trimmed, open-source build: it has no login and no per-user
accounts — everything runs as a single local user, which is all a one-machine
evaluation needs.

## Quick start

Requirements: [Docker](https://docs.docker.com/get-docker/) and Docker Compose
(bundled with Docker Desktop). Nothing else needs to be installed — Python,
Node, GNINA, and OpenBabel all run inside the containers.

```bash
git clone https://github.com/amirhsgh/RaX-DT-Open-Source.git
cd RaX-DT-Open-Source
docker compose up --build
```

Then open **http://localhost:3000**. The API and its interactive docs are at
http://localhost:8000/docs.

First build pulls the GNINA base image, so expect it to take a while and use
several GB of disk the first time; subsequent runs are fast.

## Configuration

Nothing below is required — the app works with zero configuration. Copy
`.env.example` to `.env` at the repo root only if you want to change one of
these:

| Variable         | Required? | Effect |
|------------------|-----------|--------|
| `OPENAI_API_KEY` | No        | Powers the chatbot with a real model. Without it, the chatbot still works but replies with a canned mock response instead of calling out to OpenAI — everything else (upload, jobs, visualization) is unaffected. |
| `GNINA_USE_GPU`  | No        | `false` by default so docking runs on CPU on any machine. Set to `true` only if you have an NVIDIA GPU and the [nvidia container runtime](https://github.com/NVIDIA/nvidia-container-toolkit) set up. |

Docking results, uploads, and temp files are written to `./data` on the host
(bind-mounted into the containers), so they survive `docker compose down`.

## Architecture

```
frontend/   React app, served by nginx (port 3000)
app/        FastAPI backend + Celery worker (port 8000)
```

- **backend** — FastAPI, PostgreSQL, Redis, Celery. Runs GNINA and OpenBabel
  directly (both are installed in the backend's Docker image).
- **celery_worker** — same image as the backend, runs the actual docking jobs
  in the background so the API stays responsive.
- **postgres** / **redis** — job/project storage and the Celery queue.
- **frontend** — a static React build served by nginx, proxying nothing;
  it talks to the backend API directly on port 8000.

## Running without Docker

Not officially supported for this build — the backend depends on the `gnina`
and `obabel` command-line tools being on `PATH`, which the Docker image
provides. If you want to run it natively anyway, install those two tools
yourself, then:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload          # backend
celery -A app.celery_app worker        # in a second terminal
cd frontend && npm install && npm start  # in a third terminal
```

You'll also need a local PostgreSQL and Redis, with `DATABASE_URL` /
`REDIS_URL` set accordingly (see `.env.example`).

## License

MIT — see [LICENSE](LICENSE).
