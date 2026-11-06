"""Export the OpenAPI contract to YAML, or check the committed file for drift.

Usage: `python -m app.export_openapi ../openapi.yaml` or `python -m app.export_openapi --check ../openapi.yaml`
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml


def generate() -> str:
    from app.main import create_app

    spec = create_app(run_bootstrap=False).openapi()
    spec["servers"] = [{"url": "http://localhost:8000"}]
    return yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=120)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    out = generate()
    path = Path(args.path)
    if args.check:
        current = path.read_text(encoding="utf-8") if path.exists() else ""
        if current != out:
            print(f"OpenAPI drift: {path} differs from the generated contract. Run `make openapi`.")
            sys.exit(1)
        print("OpenAPI contract matches the implementation.")
        return
    path.write_text(out, encoding="utf-8")
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
