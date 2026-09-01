from typing import Any, Dict


CIVIC_REJECTION_CODES = frozenset(
    {
        "LOW_SEMANTIC_CIVIC_RELEVANCE",
        "LOW_CIVIC_RELEVANCE_KEYWORD_FALLBACK",
        # Retain compatibility with older Civic Oracle versions.
        "LOW_CIVIC_RELEVANCE",
        "NON_CIVIC_CONTENT",
    }
)


def is_civic_rejection(vote: Dict[str, Any]) -> bool:
    return (
        vote.get("oracle_id") == "ORACLE_3_CIVIC_RELEVANCE"
        and vote.get("vote") == "REJECT"
        and vote.get("explanation_code") in CIVIC_REJECTION_CODES
    )
