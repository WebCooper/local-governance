import unittest

from decision_policy import is_civic_rejection


def civic_vote(code: str, vote: str = "REJECT"):
    return {
        "oracle_id": "ORACLE_3_CIVIC_RELEVANCE",
        "vote": vote,
        "explanation_code": code,
    }


class CivicDecisionPolicyTests(unittest.TestCase):
    def test_current_semantic_rejection_code_triggers_veto(self):
        self.assertTrue(
            is_civic_rejection(civic_vote("LOW_SEMANTIC_CIVIC_RELEVANCE"))
        )

    def test_current_keyword_rejection_code_triggers_veto(self):
        self.assertTrue(
            is_civic_rejection(
                civic_vote("LOW_CIVIC_RELEVANCE_KEYWORD_FALLBACK")
            )
        )

    def test_legacy_rejection_codes_remain_compatible(self):
        self.assertTrue(is_civic_rejection(civic_vote("LOW_CIVIC_RELEVANCE")))
        self.assertTrue(is_civic_rejection(civic_vote("NON_CIVIC_CONTENT")))

    def test_accept_vote_does_not_trigger_veto(self):
        self.assertFalse(
            is_civic_rejection(
                civic_vote("LOW_SEMANTIC_CIVIC_RELEVANCE", vote="ACCEPT")
            )
        )

    def test_other_oracle_does_not_trigger_civic_veto(self):
        vote = civic_vote("LOW_SEMANTIC_CIVIC_RELEVANCE")
        vote["oracle_id"] = "ORACLE_2_SPAM_ABUSE"

        self.assertFalse(is_civic_rejection(vote))


if __name__ == "__main__":
    unittest.main()
