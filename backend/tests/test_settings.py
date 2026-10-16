from pratirakshak.settings import SEED, derive_seed, seed_everything


def test_seed_is_competition_seed() -> None:
    assert SEED == 26249


def test_seeding_is_reproducible() -> None:
    a = seed_everything().random(5)
    b = seed_everything().random(5)
    assert (a == b).all()
    assert derive_seed("synth", "PR-G207") == derive_seed("synth", "PR-G207")
    assert derive_seed("synth", "PR-G207") != derive_seed("synth", "PR-G208")
