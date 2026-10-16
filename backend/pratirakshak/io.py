"""Deterministic file writers: same input → same bytes on every OS (LF endings, stable key order)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
import yaml

from pratirakshak.settings import CONFIG_DIR


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def write_json(path: Path, obj: Any, indent: int | None = 1) -> None:
    write_text(path, json.dumps(obj, indent=indent, ensure_ascii=False, separators=None if indent else (",", ":")) + "\n")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_parquet(path: Path, df: pd.DataFrame) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False, engine="pyarrow", compression="zstd")


def load_config(name: str) -> dict[str, Any]:
    with (CONFIG_DIR / f"{name}.yaml").open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)
