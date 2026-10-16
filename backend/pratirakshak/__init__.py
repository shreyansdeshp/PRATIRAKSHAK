"""Pratirakshak — fleet readiness command console (SIH26249)."""

import sys

__version__ = "0.1.0"

# Windows consoles default to cp1252; our CLIs print ₵, →, §, °. Force UTF-8 where possible.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure") and (getattr(_stream, "encoding", "") or "").lower() != "utf-8":
        try:
            _stream.reconfigure(encoding="utf-8")
        except (ValueError, OSError):
            pass
