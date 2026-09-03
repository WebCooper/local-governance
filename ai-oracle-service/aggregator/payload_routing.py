from typing import Any, Dict


TEXT_ONLY_ORACLES = {"spam", "civic"}


def build_oracle_payload(
    oracle_name: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """Return the payload required by an oracle without mutating the source."""
    if oracle_name not in TEXT_ONLY_ORACLES:
        return payload

    return {
        **payload,
        "media": [],
    }
