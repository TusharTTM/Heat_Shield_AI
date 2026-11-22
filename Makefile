# Contributor entry points. Each target mirrors what CI runs in
# .github/workflows/verify-integrations.yml, so a local pass means a CI pass.
.DEFAULT_GOAL := help
PYTHON ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PY := $(VENV)/bin/python

.PHONY: help setup test test-backend test-frontend lint build clean

help: ## Show the available targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## Create the venv and install backend + ML dev dependencies
	$(PYTHON) -m venv $(VENV)
	$(PIP) install -r backend/requirements-dev.txt -r ml/requirements-dev.txt
	cd frontend && npm ci

test: test-backend test-frontend ## Run every unit test suite

test-backend: ## Run backend, ML, and firmware contract tests
	$(PY) -m pytest backend/tests ml/tests firmware/tests -q

test-frontend: ## Run frontend unit tests
	cd frontend && npm test

lint: ## Lint Python (ruff) and TypeScript/React (eslint)
	$(PY) -m ruff check backend ml firmware
	cd frontend && npx tsc -b && npm run lint

build: ## Build the static frontend
	cd frontend && npm run build

clean: ## Remove local build and cache artifacts
	rm -rf frontend/dist frontend/coverage .pytest_cache .ruff_cache
	find . -name '__pycache__' -prune -exec rm -rf {} +
