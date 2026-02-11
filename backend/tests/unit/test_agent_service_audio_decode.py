import base64

from app.services.agent_service import AgentService


def _service_stub() -> AgentService:
    return object.__new__(AgentService)


def test_decode_data_url_with_codec_parameter() -> None:
    service = _service_stub()
    raw = b"voice-bytes"
    encoded = base64.b64encode(raw).decode("ascii")

    decoded, mime_type = service._decode_data_url(
        f"data:audio/webm;codecs=opus;base64,{encoded}",
        "application/octet-stream",
    )

    assert decoded == raw
    assert mime_type == "audio/webm"


def test_decode_raw_base64_uses_fallback_mime() -> None:
    service = _service_stub()
    raw = b"raw-bytes"
    encoded = base64.b64encode(raw).decode("ascii")

    decoded, mime_type = service._decode_data_url(encoded, "audio/webm")

    assert decoded == raw
    assert mime_type == "audio/webm"


def test_decode_data_url_without_base64_marker_returns_none() -> None:
    service = _service_stub()

    decoded, mime_type = service._decode_data_url(
        "data:audio/webm;codecs=opus,not-base64",
        "application/octet-stream",
    )

    assert decoded is None
    assert mime_type == "audio/webm"
