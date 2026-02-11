import base64

from app.api.chat import (
    _decode_audio_data_url,
    _is_empty_transcription_error,
    _normalize_speech_language,
)


def test_decode_audio_data_url_with_codecs_parameter() -> None:
    raw = b"voice-data"
    encoded = base64.b64encode(raw).decode("ascii")

    decoded, mime_type = _decode_audio_data_url(
        f"data:audio/webm;codecs=opus;base64,{encoded}",
        "audio/webm",
    )

    assert decoded == raw
    assert mime_type == "audio/webm"


def test_decode_audio_data_url_with_plain_base64() -> None:
    raw = b"voice-data-plain"
    encoded = base64.b64encode(raw).decode("ascii")

    decoded, mime_type = _decode_audio_data_url(encoded, "audio/webm")

    assert decoded == raw
    assert mime_type == "audio/webm"


def test_decode_audio_data_url_without_base64_marker() -> None:
    decoded, mime_type = _decode_audio_data_url(
        "data:audio/webm;codecs=opus,abc",
        "audio/webm",
    )

    assert decoded is None
    assert mime_type == "audio/webm"


def test_normalize_speech_language_for_short_ja() -> None:
    assert _normalize_speech_language("ja") == "ja-JP"


def test_normalize_speech_language_preserves_bcp47() -> None:
    assert _normalize_speech_language("en-US") == "en-US"


def test_is_empty_transcription_error_detects_empty_transcript() -> None:
    error = RuntimeError("Google STT v2 returned empty transcript")
    assert _is_empty_transcription_error(error) is True


def test_is_empty_transcription_error_false_for_other_errors() -> None:
    error = RuntimeError("Permission denied")
    assert _is_empty_transcription_error(error) is False
