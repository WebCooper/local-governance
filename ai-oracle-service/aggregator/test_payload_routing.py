import unittest

from payload_routing import build_oracle_payload


class PayloadRoutingTests(unittest.TestCase):
    def setUp(self):
        self.payload = {
            "metadata": {"text": "A pothole needs repair."},
            "media": [
                {
                    "file_name": "road.png",
                    "base64": "large-image-content",
                }
            ],
            "text_hash": "text-hash",
            "media_hashes": ["media-hash"],
            "report_hash": "report-hash",
            "request_hash": "request-hash",
        }

    def test_safety_receives_media(self):
        routed = build_oracle_payload("safety", self.payload)

        self.assertIs(routed, self.payload)
        self.assertEqual(routed["media"], self.payload["media"])

    def test_spam_receives_text_only_payload(self):
        routed = build_oracle_payload("spam", self.payload)

        self.assertEqual(routed["media"], [])
        self.assertEqual(routed["metadata"], self.payload["metadata"])
        self.assertEqual(routed["media_hashes"], self.payload["media_hashes"])
        self.assertEqual(self.payload["media"][0]["base64"], "large-image-content")

    def test_civic_receives_text_only_payload(self):
        routed = build_oracle_payload("civic", self.payload)

        self.assertEqual(routed["media"], [])
        self.assertEqual(routed["metadata"], self.payload["metadata"])
        self.assertEqual(routed["request_hash"], self.payload["request_hash"])

    def test_unknown_oracle_keeps_media(self):
        routed = build_oracle_payload("future-oracle", self.payload)

        self.assertIs(routed, self.payload)


if __name__ == "__main__":
    unittest.main()
