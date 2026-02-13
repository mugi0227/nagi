"""
Amazon Transcribe speech-to-text provider.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

from app.core.exceptions import InfrastructureError
from app.interfaces.speech_provider import ISpeechToTextProvider


class AmazonTranscribeProvider(ISpeechToTextProvider):
    """Amazon Transcribe implementation."""

    def __init__(
        self,
        region_name: str = "us-east-1",
        bucket_name: str = "",
        key_prefix: str = "transcribe-input",
        default_language: str = "ja-JP",
        poll_interval_seconds: float = 0.35,
        timeout_seconds: float = 180.0,
    ):
        self.region_name = (region_name or "us-east-1").strip() or "us-east-1"
        self.bucket_name = (bucket_name or "").strip()
        self.key_prefix = (key_prefix or "transcribe-input").strip().strip("/")
        self.default_language = (default_language or "ja-JP").strip() or "ja-JP"
        self.poll_interval_seconds = max(0.2, float(poll_interval_seconds))
        self.timeout_seconds = max(10.0, float(timeout_seconds))

        if not self.bucket_name:
            raise InfrastructureError(
                "AWS_TRANSCRIBE_S3_BUCKET is required when SPEECH_PROVIDER=amazon-transcribe"
            )

        self._boto3: Any | None = None
        self._s3_client: Any | None = None
        self._transcribe_client: Any | None = None

    def _load_boto3(self) -> Any:
        if self._boto3 is None:
            try:
                import boto3
            except ImportError as e:
                raise InfrastructureError(
                    "boto3 is not installed. Install with: pip install boto3"
                ) from e
            self._boto3 = boto3
        return self._boto3

    def _get_s3_client(self) -> Any:
        if self._s3_client is None:
            boto3 = self._load_boto3()
            self._s3_client = boto3.client("s3", region_name=self.region_name)
        return self._s3_client

    def _get_transcribe_client(self) -> Any:
        if self._transcribe_client is None:
            boto3 = self._load_boto3()
            self._transcribe_client = boto3.client("transcribe", region_name=self.region_name)
        return self._transcribe_client

    async def transcribe(
        self,
        audio_source: str,
        language: str = "ja-JP",
    ) -> str:
        source = (audio_source or "").strip()
        if not source:
            raise InfrastructureError("Audio source is empty")

        path = Path(source)
        if path.exists():
            return await self.transcribe_bytes(
                audio_bytes=path.read_bytes(),
                content_type=self._extension_to_content_type(path.suffix),
                language=language,
            )

        if source.startswith("http://") or source.startswith("https://"):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(source)
                    response.raise_for_status()
            except Exception as e:
                raise InfrastructureError(f"Failed to load audio source URL: {e}") from e

            content_type = self._normalize_content_type(
                response.headers.get("content-type", "audio/wav")
            )
            return await self.transcribe_bytes(
                audio_bytes=response.content,
                content_type=content_type,
                language=language,
            )

        raise InfrastructureError(f"Audio source not found or unsupported URL: {audio_source}")

    async def transcribe_bytes(
        self,
        audio_bytes: bytes,
        content_type: str = "audio/wav",
        language: str = "ja-JP",
    ) -> str:
        if not audio_bytes:
            raise InfrastructureError("Audio bytes are empty")
        return await asyncio.to_thread(
            self._transcribe_sync,
            audio_bytes,
            content_type,
            language,
        )

    def _transcribe_sync(self, audio_bytes: bytes, content_type: str, language: str) -> str:
        normalized_content_type = self._normalize_content_type(content_type)
        media_format = self._content_type_to_media_format(normalized_content_type)
        language_code = (language or self.default_language).strip() or self.default_language
        object_key = self._build_object_key(media_format)
        job_name = f"secretary-stt-{uuid4().hex}"
        media_uri = f"s3://{self.bucket_name}/{object_key}"
        uploaded = False
        job_started = False

        s3_client = self._get_s3_client()
        transcribe_client = self._get_transcribe_client()

        try:
            s3_client.put_object(
                Bucket=self.bucket_name,
                Key=object_key,
                Body=audio_bytes,
                ContentType=normalized_content_type,
            )
            uploaded = True
        except Exception as e:
            raise InfrastructureError(f"Failed to upload audio to S3: {e}") from e

        try:
            transcribe_client.start_transcription_job(
                TranscriptionJobName=job_name,
                LanguageCode=language_code,
                MediaFormat=media_format,
                Media={"MediaFileUri": media_uri},
            )
            job_started = True
            transcript_uri = self._wait_for_job_completion(transcribe_client, job_name)
            transcript_payload = self._fetch_transcript_payload(transcript_uri)
            text = self._extract_transcript_text(transcript_payload)
            if not text:
                raise InfrastructureError("Amazon Transcribe returned empty transcript")
            return text
        except InfrastructureError:
            raise
        except Exception as e:
            raise InfrastructureError(f"Amazon Transcribe transcription failed: {e}") from e
        finally:
            if job_started:
                self._delete_transcription_job(transcribe_client, job_name)
            if uploaded:
                self._delete_s3_object(s3_client, object_key)

    def _wait_for_job_completion(self, transcribe_client: Any, job_name: str) -> str:
        deadline = time.monotonic() + self.timeout_seconds

        while time.monotonic() < deadline:
            try:
                response = transcribe_client.get_transcription_job(
                    TranscriptionJobName=job_name
                )
            except Exception as e:
                raise InfrastructureError(f"Failed to query Amazon Transcribe job status: {e}") from e

            job = response.get("TranscriptionJob") or {}
            status = str(job.get("TranscriptionJobStatus", "")).upper()

            if status == "COMPLETED":
                transcript_info = job.get("Transcript") or {}
                transcript_uri = (
                    transcript_info.get("TranscriptFileUri")
                    or transcript_info.get("RedactedTranscriptFileUri")
                )
                if not transcript_uri:
                    raise InfrastructureError(
                        "Amazon Transcribe completed without transcript URI"
                    )
                return str(transcript_uri)

            if status == "FAILED":
                reason = str(job.get("FailureReason") or "unknown reason")
                raise InfrastructureError(f"Amazon Transcribe failed: {reason}")

            time.sleep(self.poll_interval_seconds)

        raise InfrastructureError(
            f"Amazon Transcribe timed out after {int(self.timeout_seconds)} seconds"
        )

    def _fetch_transcript_payload(self, transcript_uri: str) -> dict[str, Any]:
        try:
            response = httpx.get(transcript_uri, timeout=30.0)
            response.raise_for_status()
        except Exception as e:
            raise InfrastructureError(f"Failed to download transcript JSON: {e}") from e

        try:
            payload = response.json()
        except Exception as e:
            raise InfrastructureError(f"Transcript JSON parsing failed: {e}") from e

        if not isinstance(payload, dict):
            raise InfrastructureError("Transcript payload is not a JSON object")
        return payload

    def _extract_transcript_text(self, payload: dict[str, Any]) -> str:
        results = payload.get("results")
        if not isinstance(results, dict):
            return ""

        transcripts = results.get("transcripts")
        if not isinstance(transcripts, list):
            return ""

        chunks: list[str] = []
        for entry in transcripts:
            if not isinstance(entry, dict):
                continue
            transcript = entry.get("transcript")
            if isinstance(transcript, str) and transcript.strip():
                chunks.append(transcript.strip())
        return " ".join(chunks).strip()

    def _delete_transcription_job(self, transcribe_client: Any, job_name: str) -> None:
        try:
            transcribe_client.delete_transcription_job(TranscriptionJobName=job_name)
        except Exception:
            return

    def _delete_s3_object(self, s3_client: Any, object_key: str) -> None:
        try:
            s3_client.delete_object(Bucket=self.bucket_name, Key=object_key)
        except Exception:
            return

    def _build_object_key(self, media_format: str) -> str:
        filename = f"{uuid4().hex}.{media_format}"
        if self.key_prefix:
            return f"{self.key_prefix}/{filename}"
        return filename

    def _normalize_content_type(self, content_type: str) -> str:
        normalized = (content_type or "audio/wav").strip().lower()
        if ";" in normalized:
            normalized = normalized.split(";", 1)[0].strip()
        return normalized or "audio/wav"

    def _content_type_to_media_format(self, content_type: str) -> str:
        media_format_map = {
            "audio/wav": "wav",
            "audio/x-wav": "wav",
            "audio/mp3": "mp3",
            "audio/mpeg": "mp3",
            "audio/mp4": "mp4",
            "audio/m4a": "m4a",
            "audio/ogg": "ogg",
            "audio/webm": "webm",
            "audio/flac": "flac",
            "audio/amr": "amr",
        }
        media_format = media_format_map.get(content_type)
        if not media_format:
            raise InfrastructureError(
                f"Unsupported content type for Amazon Transcribe: {content_type}"
            )
        return media_format

    def _extension_to_content_type(self, suffix: str) -> str:
        extension_map = {
            ".wav": "audio/wav",
            ".mp3": "audio/mp3",
            ".m4a": "audio/m4a",
            ".mp4": "audio/mp4",
            ".ogg": "audio/ogg",
            ".webm": "audio/webm",
            ".flac": "audio/flac",
            ".amr": "audio/amr",
        }
        normalized_suffix = (suffix or "").strip().lower()
        return extension_map.get(normalized_suffix, "audio/wav")

    def get_supported_formats(self) -> list[str]:
        return [
            "audio/webm",
            "audio/webm;codecs=opus",
            "audio/wav",
            "audio/x-wav",
            "audio/mp3",
            "audio/mpeg",
            "audio/mp4",
            "audio/m4a",
            "audio/ogg",
            "audio/flac",
            "audio/amr",
        ]
