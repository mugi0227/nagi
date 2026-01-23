"""
Issue-related tools for the Issue Agent.

These tools allow the AI to search and create issues.
"""

from google.adk.tools import FunctionTool

from app.interfaces.issue_repository import IIssueRepository
from app.models.issue import IssueCreate
from app.models.enums import IssueCategory


def search_issues_tool(
    issue_repo: IIssueRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for searching similar issues."""

    async def search_issues(query: str, limit: int = 5) -> dict:
        """
        Search for existing issues similar to the query.

        Use this to check if a similar issue already exists before creating a new one.

        Args:
            query: Search keywords
            limit: Maximum number of results (default: 5)

        Returns:
            List of matching issues
        """
        issues = await issue_repo.search(query, current_user_id=user_id, limit=limit)
        return {
            "issues": [
                {
                    "id": str(issue.id),
                    "title": issue.title,
                    "content": issue.content[:200] + "..." if len(issue.content) > 200 else issue.content,
                    "category": issue.category.value,
                    "status": issue.status.value,
                    "like_count": issue.like_count,
                }
                for issue in issues
            ],
            "count": len(issues),
        }

    return FunctionTool(search_issues)


def create_issue_tool(
    issue_repo: IIssueRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for creating issues."""

    async def create_issue(
        title: str,
        content: str,
        category: str,
    ) -> dict:
        """
        Create a new issue (feature request, bug report, etc.).

        Use this after confirming with the user that they want to submit the issue.

        Args:
            title: Brief, clear title for the issue (max 200 chars)
            content: Detailed description including background, what they want, and expected benefits
            category: One of: FEATURE_REQUEST, BUG_REPORT, IMPROVEMENT, QUESTION

        Returns:
            Created issue details
        """
        # Validate category
        try:
            cat = IssueCategory(category)
        except ValueError:
            return {
                "error": f"Invalid category: {category}. Must be one of: FEATURE_REQUEST, BUG_REPORT, IMPROVEMENT, QUESTION"
            }

        issue_data = IssueCreate(
            title=title,
            content=content,
            category=cat,
        )
        issue = await issue_repo.create(user_id, issue_data)

        return {
            "success": True,
            "issue": {
                "id": str(issue.id),
                "title": issue.title,
                "content": issue.content,
                "category": issue.category.value,
                "status": issue.status.value,
            },
            "message": f"Issue '{title}' を投稿しました！",
        }

    return FunctionTool(create_issue)
