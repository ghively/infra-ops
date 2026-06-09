"""pytest tests for the tool. Tests ship with the code."""

from main import run


def test_run_returns_zero():
    assert run("example") == 0
