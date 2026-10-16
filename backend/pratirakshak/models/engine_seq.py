"""Main engine model (SPEC §6.4.3): small 1D-CNN + GRU with a quantile (pinball) head, CPU-friendly."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import torch
from torch import nn

from pratirakshak.models.engine_data import Windows

CYCLE_SCALE = 400.0


class CnnGru(nn.Module):
    def __init__(self, n_in: int, n_q: int, conv: int, hidden: int, dropout: float) -> None:
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(n_in, conv, kernel_size=5, padding=2), nn.ReLU(),
            nn.Conv1d(conv, conv, kernel_size=3, padding=1), nn.ReLU(),
        )
        self.gru = nn.GRU(conv, hidden, batch_first=True)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(hidden, 32), nn.ReLU(), nn.Linear(32, n_q))

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # x: (B, W, F)
        h = self.conv(x.transpose(1, 2)).transpose(1, 2)
        _, last = self.gru(h)
        return self.head(last[-1])


def with_cycle_channel(win: Windows) -> np.ndarray:
    """Append the (scaled) cycle index at each time step so the model knows engine age."""
    w = win.x.shape[1]
    steps = win.cycle[:, None] - (w - 1) + np.arange(w)[None, :]
    cyc = (np.clip(steps, 1, None) / CYCLE_SCALE).astype(np.float32)[..., None]
    return np.concatenate([win.x, cyc], axis=2)


def pinball(pred: torch.Tensor, y: torch.Tensor, q: torch.Tensor) -> torch.Tensor:
    e = y[:, None] - pred
    return torch.maximum(q * e, (q - 1) * e).mean()


@dataclass
class SeqEnsemble:
    members: list[dict[str, Any]]  # state dicts
    n_in: int
    quantiles: list[float]
    hp: dict[str, Any]
    r_max: float
    history: list[dict[str, Any]]

    def _model(self) -> CnnGru:
        return CnnGru(self.n_in, len(self.quantiles), self.hp["conv_channels"], self.hp["gru_hidden"], self.hp["dropout"])

    @torch.no_grad()
    def predict_members(self, x: np.ndarray, batch: int = 4096) -> np.ndarray:
        """(M, N, Q) raw quantile predictions in cycles, sorted per row."""
        outs = []
        for sd in self.members:
            m = self._model()
            m.load_state_dict(sd)
            m.eval()
            preds = [m(torch.from_numpy(x[i : i + batch])).numpy() for i in range(0, len(x), batch)]
            outs.append(np.sort(np.concatenate(preds) * self.r_max, axis=1))
        return np.stack(outs)

    def predict(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Ensemble quantiles (mean of members) and member disagreement (std of member medians)."""
        mem = self.predict_members(x)
        mid = self.quantiles.index(0.5)
        return np.sort(mem.mean(0), axis=1), mem[:, :, mid].std(0)


def train_member(xtr: np.ndarray, ytr: np.ndarray, xva: np.ndarray, yva: np.ndarray, quantiles: list[float],
                 hp: dict[str, Any], r_max: float, seed: int, max_epochs: int) -> tuple[dict[str, Any], dict[str, Any]]:
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    model = CnnGru(xtr.shape[2], len(quantiles), hp["conv_channels"], hp["gru_hidden"], hp["dropout"])
    opt = torch.optim.Adam(model.parameters(), lr=hp["lr"])
    q = torch.tensor(quantiles, dtype=torch.float32)
    xt, yt = torch.from_numpy(xtr), torch.from_numpy(ytr / r_max)
    xv, yv = torch.from_numpy(xva), torch.from_numpy(yva / r_max)
    best, best_state, bad, log = np.inf, None, 0, []
    for epoch in range(max_epochs):
        model.train()
        order = rng.permutation(len(xt))
        for i in range(0, len(order), hp["batch_size"]):
            idx = torch.from_numpy(order[i : i + hp["batch_size"]])
            opt.zero_grad()
            loss = pinball(model(xt[idx]), yt[idx], q)
            loss.backward()
            opt.step()
        model.eval()
        with torch.no_grad():
            vl = float(np.mean([pinball(model(xv[i : i + 4096]), yv[i : i + 4096], q).item()
                                for i in range(0, len(xv), 4096)]))
        log.append({"epoch": epoch + 1, "val_pinball": round(vl * r_max, 4)})
        if vl < best - 1e-5:
            best, bad = vl, 0
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= hp["patience"]:
                break
    assert best_state is not None
    return best_state, {"seed": seed, "epochs_run": len(log), "best_val_pinball": round(best * r_max, 4), "log": log}
