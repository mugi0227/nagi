"""
Capture model definitions.

Captures store original user inputs (text/audio/image/file metadata)
for traceability and duplicate detection.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.models.enums import ContentType

settings = get_settings()


class CaptureBase(BaseModel):
    """Base capture fields."""

    content_type: ContentType = Field(..., description="Capture content type (TEXT/AUDIO/IMAGE)")
    content_url: Optional[str] = Field(
        None, max_length=500, description="Stored file URL for AUDIO/IMAGE/file uploads"
    )
    raw_text: Optional[str] = Field(
        None, max_length=settings.MAX_TEXT_LENGTH, description="Raw text payload"
    )
    transcription: Optional[str] = Field(
        None, max_length=settings.MAX_TRANSCRIPTION_LENGTH, description="Audio transcription"
    )
    image_analysis: Optional[str] = Field(
        None, max_length=settings.MAX_IMAGE_ANALYSIS_LENGTH, description="Image analysis text"
    )
    file_name: Optional[str] = Field(
        None, max_length=255, description="Uploaded file name (optional metadata)"
    )
    file_content_type: Optional[str] = Field(
        None, max_length=120, description="Uploaded file MIME type (optional metadata)"
    )


class CaptureCreate(CaptureBase):
    """Schema for creating a new capture."""

    base64_image: Optional[str] = Field(None, description="Base64 image data URL (transient)")
    base64_file: Optional[str] = Field(None, description="Base64 file data URL (transient)")


class Capture(CaptureBase):
    """Complete capture model."""

    id: UUID
    user_id: str = Field(..., description="Owner user ID")
    processed: bool = Field(False, description="Whether processing is complete")
    created_at: datetime

    class Config:
        from_attributes = True

    @property
    def text_content(self) -> str:
        """Get text-like content regardless of capture type."""
        if self.content_type == ContentType.TEXT:
            return self.raw_text or ""
        if self.content_type == ContentType.AUDIO:
            return self.transcription or ""
        if self.content_type == ContentType.IMAGE:
            return self.image_analysis or ""
        return self.raw_text or ""
