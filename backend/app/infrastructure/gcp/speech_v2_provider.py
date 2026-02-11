"""
Google Cloud Speech-to-Text v2 provider.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.core.exceptions import InfrastructureError
from app.interfaces.speech_provider import ISpeechToTextProvider


class GoogleSpeechV2Provider(ISpeechToTextProvider):
    """Google Cloud Speech-to-Text v2 implementation."""

    def __init__(
        self,
        project_id: str | None = None,
        location: str = "us",
        model: str = "chirp_3",
        default_language: str = "ja-JP",
    ):
        self.project_id = self._resolve_project_id(project_id)
        self.location = (location or "us").strip()
        self.model = (model or "chirp_3").strip()
        self.default_language = (default_language or "ja-JP").strip()
        self._client = self._create_client(self.location)

    def _resolve_project_id(self, project_id: str | None) -> str:
        normalized = (project_id or "").strip()
        if normalized:
            return normalized

        try:
            import google.auth
        except ImportError as e:
            raise InfrastructureError(
                "google-auth is required to auto-detect GCP project ID. "
                "Install with: pip install google-auth"
            ) from e

        try:
            _, detected_project_id = google.auth.default()
        except Exception as e:
            raise InfrastructureError(
                "Failed to resolve Application Default Credentials. "
                "Set GOOGLE_APPLICATION_CREDENTIALS (local) or attach a service account (GCE)."
            ) from e

        detected = (detected_project_id or "").strip()
        if detected:
            return detected

        raise InfrastructureError(
            "GOOGLE_CLOUD_PROJECT is empty and project ID could not be auto-detected from ADC. "
            "Set GOOGLE_CLOUD_PROJECT explicitly."
        )

    def _create_client(self, location: str):
        try:
            from google.api_core.client_options import ClientOptions
            from google.cloud.speech_v2 import SpeechClient
        except ImportError as e:
            raise InfrastructureError(
                "google-cloud-speech is not installed. Install with: pip install google-cloud-speech"
            ) from e

        normalized = location.strip().lower()
        if normalized in {"", "global"}:
            return SpeechClient()

        endpoint = f"{normalized}-speech.googleapis.com"
        return SpeechClient(client_options=ClientOptions(api_endpoint=endpoint))

    async def transcribe(
        self,
        audio_source: str,
        language: str = "ja-JP",
    ) -> str:
        path = Path(audio_source)
        if not path.exists():
            raise InfrastructureError(f"Audio file not found: {audio_source}")
        audio_bytes = path.read_bytes()
        return await self.transcribe_bytes(audio_bytes=audio_bytes, language=language)

    async def transcribe_bytes(
        self,
        audio_bytes: bytes,
        content_type: str = "audio/wav",
        language: str = "ja-JP",
    ) -> str:
        if not audio_bytes:
            raise InfrastructureError("Audio bytes are empty")

        target_language = (language or self.default_language).strip() or self.default_language

        def _recognize() -> str:
            try:
                from google.cloud.speech_v2.types import cloud_speech
            except ImportError as e:
                raise InfrastructureError(
                    "google-cloud-speech is not installed. Install with: pip install google-cloud-speech"
                ) from e

            config = cloud_speech.RecognitionConfig(
                auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
                language_codes=[target_language],
                model=self.model,
            )
            request = cloud_speech.RecognizeRequest(
                recognizer=(
                    f"projects/{self.project_id}/locations/{self.location}/recognizers/_"
                ),
                config=config,
                content=audio_bytes,
            )

            try:
                response = self._client.recognize(request=request)
            except Exception as e:
                raise InfrastructureError(f"Google STT v2 recognize failed: {e}") from e

            transcripts: list[str] = []
            for result in response.results:
                alternatives = getattr(result, "alternatives", None) or []
                if not alternatives:
                    continue
                top = alternatives[0]
                transcript = (getattr(top, "transcript", "") or "").strip()
                if transcript:
                    transcripts.append(transcript)

            text = " ".join(transcripts).strip()
            if not text:
                raise InfrastructureError("Google STT v2 returned empty transcript")
            return text

        return await asyncio.to_thread(_recognize)

    def get_supported_formats(self) -> list[str]:
        return [
            "audio/webm",
            "audio/webm;codecs=opus",
            "audio/wav",
            "audio/mp3",
            "audio/mpeg",
            "audio/m4a",
            "audio/ogg",
            "audio/flac",
        ]
