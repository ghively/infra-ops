# Python tool

Canonical Python automation/data-gathering tool;
`scripts/validate-structure.js --type python-tool` enforces it.

## Files

- `main.py` — `argparse` CLI, `logging`, `main()` entry guard
- `requirements.txt` — pinned dependencies
- `tests/` — `pytest` tests

## Usage

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python main.py --name example
pytest
```
