import base64
import hashlib
import io
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw

import app as safety


def make_media(image: Image.Image, file_name: str = "test.png") -> safety.MediaItem:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    content = buffer.getvalue()
    return safety.MediaItem(
        file_name=file_name,
        mime_type="image/png",
        sha256=hashlib.sha256(content).hexdigest(),
        base64=base64.b64encode(content).decode("utf-8"),
        size_bytes=len(content),
    )


class FaceBlurringTests(unittest.TestCase):
    def setUp(self):
        self.original_classifier = safety.image_classifier
        self.original_blurring = safety.ENABLE_FACE_BLURRING
        safety.image_classifier = None
        safety.ENABLE_FACE_BLURRING = True

    def tearDown(self):
        safety.image_classifier = self.original_classifier
        safety.ENABLE_FACE_BLURRING = self.original_blurring

    def test_road_features_are_not_detected_as_faces(self):
        image = Image.new("RGB", (640, 480), "#6b6b6b")
        draw = ImageDraw.Draw(image)
        draw.line((60, 450, 270, 30), fill="white", width=18)
        draw.line((580, 450, 370, 30), fill="white", width=18)
        draw.ellipse((230, 250, 410, 355), fill="#202020", outline="#a0a0a0", width=8)

        self.assertEqual(safety.detect_faces(image), [])

    def test_image_is_not_reencoded_when_no_face_is_detected(self):
        media = make_media(Image.new("RGB", (320, 240), "gray"), "road.png")
        original_hash = media.sha256
        original_base64 = media.base64

        unchanged = Image.new("RGB", (320, 240), "gray")
        with patch.object(safety, "blur_faces", return_value=(unchanged, [])):
            result = safety.image_safety([media])

        detection = result["details"]["images"][0]["face_detection"]
        self.assertEqual(media.sha256, original_hash)
        self.assertEqual(media.base64, original_base64)
        self.assertFalse(detection["blur_applied"])
        self.assertEqual(detection["faces_detected"], 0)

    def test_detector_failure_rejects_image_when_fail_closed(self):
        media = make_media(Image.new("RGB", (320, 240), "gray"))

        with patch.object(safety, "blur_faces", side_effect=RuntimeError("model error")):
            result = safety.image_safety([media])

        self.assertFalse(result["safe"])
        self.assertEqual(result["explanation_code"], "FACE_DETECTION_FAILED")

    def test_only_changed_images_are_returned_as_blurred_media(self):
        face_media = make_media(Image.new("RGB", (320, 240), "white"), "face.png")
        road_media = make_media(Image.new("RGB", (320, 240), "gray"), "road.png")
        detection = {
            "box": {"x": 80, "y": 40, "width": 100, "height": 120},
            "score": 0.99,
            "landmarks": [],
        }

        def fake_blur(image):
            if image.getpixel((0, 0)) == (255, 255, 255):
                changed = image.copy()
                changed.paste("black", (80, 40, 180, 160))
                return changed, [detection]
            return image, []

        payload = safety.OracleRequest(
            metadata={"text": "A damaged road needs repair."},
            media=[face_media, road_media],
            text_hash="text-hash",
            media_hashes=[face_media.sha256, road_media.sha256],
            report_hash="report-hash",
            request_hash="request-hash",
        )

        with patch.object(safety, "blur_faces", side_effect=fake_blur):
            response = safety.analyze(payload)

        self.assertEqual(response["vote"], "ACCEPT")
        self.assertEqual(len(response["blurred_media"]), 1)
        self.assertEqual(response["blurred_media"][0]["file_name"], "face.png")
        original_face_hash = make_media(
            Image.new("RGB", (320, 240), "white")
        ).sha256
        self.assertNotEqual(
            response["blurred_media"][0]["sha256"], original_face_hash
        )
        road_result = response["details"]["image_result"]["details"]["images"][1]
        self.assertFalse(road_result["face_detection"]["blur_applied"])


if __name__ == "__main__":
    unittest.main()
