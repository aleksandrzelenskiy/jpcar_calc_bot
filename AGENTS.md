# Repository Guidelines

This guide keeps contributions consistent for jpcarcalcbot. Update it when tooling or structure changes so newcomers can get productive quickly.

## Project Structure & Module Organization
- Place runtime code in `src/`, keeping entry points small and delegating work to modules; co-locate subpackages by feature (e.g., `src/calculator/`, `src/bot/`).
- Mirror the layout in `tests/` with matching module names for quick navigation (e.g., `tests/calculator/test_pricing.py`).
- Use `scripts/` for one-off maintenance tasks and `docs/` for ADRs, API notes, or onboarding snippets. Add `.env.example` whenever new configuration is introduced.

## Build, Test, and Development Commands
- Create and activate a virtualenv: `python -m venv .venv && source .venv/bin/activate` (Windows: `.\.venv\Scripts\activate`).
- Install dependencies: `pip install -r requirements.txt` (add a `requirements-dev.txt` for lint/test extras).
- Run the app locally once an entrypoint exists: `python -m src` or `python src/main.py`.
- Run checks: `pytest` for tests; `ruff .` and `black .` for lint/format; consider `make lint`, `make test`, and `make format` aliases in a `Makefile` for repeatability.

## Coding Style & Naming Conventions
- Target Python 3.11+; use 4-space indentation, type hints, and docstrings on public functions. Keep functions small and pure when possible.
- Apply `black` for formatting, `ruff` for lint/static rules, and `isort` (or `ruff --fix` import rules) for imports. Run linters before committing.
- Use `snake_case` for functions/variables, `PascalCase` for classes, and `UPPER_SNAKE_CASE` for constants and environment variable keys.

## Testing Guidelines
- Use `pytest`; name files `test_*.py` and align test modules with the code under test. Prefer fixtures over ad hoc setup, and mark slow or integration tests explicitly.
- Aim for ≥90% coverage on new code; cover edge cases for user input, external API failures, and calculation correctness. Avoid real network calls—mock external services.

## Commit & Pull Request Guidelines
- Commit messages follow `type: short summary` (types: feat, fix, refactor, docs, chore, test). Keep each commit focused on one change.
- For PRs, include a concise summary, linked issues, validation notes (`pytest`, `ruff`, `black`), and screenshots or logs for behavior changes. Keep PRs small, document known gaps, and request reviews early if design feedback is needed.

## Security & Configuration
- Do not commit secrets; load them via environment variables and document required keys in `.env.example`. Rotate any leaked token immediately.
- Avoid writing files outside the repo during tests; prefer temporary directories. Validate user input at boundaries and log only non-sensitive context.
