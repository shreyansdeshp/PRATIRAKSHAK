# Pratirakshak — pipeline targets (macOS/Linux). Windows: ./tasks.ps1 <target> (same names).
# All targets are idempotent and seeded (SEED=26249).

PY ?= .venv/bin/python
ifeq ($(OS),Windows_NT)
PY := .venv/Scripts/python.exe
endif
FAST ?=

.PHONY: setup fetch data world synth train intelligence plan sim export dev shots record test lint

setup:
	python3.11 -m venv .venv
	$(PY) -m pip install --upgrade pip==24.3.1
	$(PY) -m pip install -r requirements.txt
	$(PY) -m pip install -e . --no-deps
	cd frontend && npm ci && npx playwright install chromium

fetch:
	$(PY) scripts/fetch_cmapss.py

data:
	$(PY) -m pratirakshak.ingest

world:
	$(PY) -m pratirakshak.world

synth:
	$(PY) -m pratirakshak.synth

train:
	$(PY) -m pratirakshak.models $(if $(FAST),--fast,)

intelligence:
	$(PY) -m pratirakshak.intelligence

plan:
	$(PY) -m pratirakshak.decide

sim:
	$(PY) -m pratirakshak.sim

export:
	$(PY) -m pratirakshak.export

dev:
	$(PY) -m uvicorn pratirakshak.api.app:app --port 8000 & cd frontend && npm run dev

shots:
	cd frontend && npm run shots

record:
	cd frontend && npm run record

test:
	$(PY) -m pytest
	cd frontend && npm test

lint:
	$(PY) -m ruff check backend scripts
	cd frontend && npm run typecheck
