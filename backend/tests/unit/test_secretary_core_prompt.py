from app.agents.prompts.secretary_core_prompt import SECRETARY_CORE_PROMPT


def test_core_prompt_omits_task_specific_project_flow() -> None:
    assert "For task creation requests" not in SECRETARY_CORE_PROMPT
    assert "Confirm the chosen project with the user" not in SECRETARY_CORE_PROMPT


def test_core_prompt_requires_yes_no_confirmation_tool_usage() -> None:
    assert "ask_user_questions" in SECRETARY_CORE_PROMPT
    assert '["はい", "いいえ"]' in SECRETARY_CORE_PROMPT
