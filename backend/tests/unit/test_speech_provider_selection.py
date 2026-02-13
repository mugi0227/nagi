from types import SimpleNamespace
from unittest.mock import patch

from app.api import deps


def _base_settings() -> SimpleNamespace:
    return SimpleNamespace(
        SPEECH_PROVIDER="whisper",
        GOOGLE_CLOUD_PROJECT="",
        STT_V2_LOCATION="us",
        STT_V2_MODEL="chirp_3",
        STT_V2_LANGUAGE="ja-JP",
        WHISPER_MODEL_SIZE="base",
        AWS_REGION="us-east-1",
        AWS_TRANSCRIBE_S3_BUCKET="transcribe-bucket",
        AWS_TRANSCRIBE_S3_PREFIX="transcribe-input",
        AWS_TRANSCRIBE_LANGUAGE="ja-JP",
        AWS_TRANSCRIBE_POLL_SECONDS=0.35,
        AWS_TRANSCRIBE_TIMEOUT_SECONDS=180,
    )


def test_get_speech_provider_selects_whisper() -> None:
    settings = _base_settings()
    settings.SPEECH_PROVIDER = "whisper"
    provider = object()

    deps.get_speech_provider.cache_clear()
    with patch("app.api.deps.get_settings", return_value=settings):
        with patch("app.infrastructure.local.whisper_provider.WhisperProvider") as provider_cls:
            provider_cls.return_value = provider
            resolved = deps.get_speech_provider()

    assert resolved is provider
    provider_cls.assert_called_once_with("base")


def test_get_speech_provider_selects_google_stt_v2() -> None:
    settings = _base_settings()
    settings.SPEECH_PROVIDER = "google-stt-v2"
    settings.GOOGLE_CLOUD_PROJECT = "demo-project"
    provider = object()

    deps.get_speech_provider.cache_clear()
    with patch("app.api.deps.get_settings", return_value=settings):
        with patch(
            "app.infrastructure.gcp.speech_v2_provider.GoogleSpeechV2Provider"
        ) as provider_cls:
            provider_cls.return_value = provider
            resolved = deps.get_speech_provider()

    assert resolved is provider
    provider_cls.assert_called_once_with(
        project_id="demo-project",
        location="us",
        model="chirp_3",
        default_language="ja-JP",
    )


def test_get_speech_provider_selects_amazon_transcribe() -> None:
    settings = _base_settings()
    settings.SPEECH_PROVIDER = "amazon-transcribe"
    provider = object()

    deps.get_speech_provider.cache_clear()
    with patch("app.api.deps.get_settings", return_value=settings):
        with patch(
            "app.infrastructure.aws.transcribe_provider.AmazonTranscribeProvider"
        ) as provider_cls:
            provider_cls.return_value = provider
            resolved = deps.get_speech_provider()

    assert resolved is provider
    provider_cls.assert_called_once_with(
        region_name="us-east-1",
        bucket_name="transcribe-bucket",
        key_prefix="transcribe-input",
        default_language="ja-JP",
        poll_interval_seconds=0.35,
        timeout_seconds=180,
    )

