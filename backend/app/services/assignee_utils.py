"""
Utility functions for assignee ID handling.

Supports two formats:
- User ID: regular UUID string (e.g., "abc123-...")
- Invitation ID: prefixed with "inv:" (e.g., "inv:xyz789-...")
"""

INVITATION_PREFIX = "inv:"


def is_invitation_assignee(assignee_id: str) -> bool:
    """Check if assignee_id refers to an invitation."""
    return assignee_id.startswith(INVITATION_PREFIX)


def get_invitation_id(assignee_id: str) -> str:
    """
    Extract invitation ID from prefixed assignee_id.

    Args:
        assignee_id: Prefixed assignee ID (e.g., "inv:xyz789-...")

    Returns:
        The invitation ID without prefix
    """
    return assignee_id[len(INVITATION_PREFIX):]


def make_invitation_assignee_id(invitation_id: str) -> str:
    """
    Create an invitation-based assignee ID.

    Args:
        invitation_id: The invitation UUID string

    Returns:
        Prefixed assignee ID (e.g., "inv:xyz789-...")
    """
    return f"{INVITATION_PREFIX}{invitation_id}"
