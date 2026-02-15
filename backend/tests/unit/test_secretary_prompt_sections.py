from app.agents.secretary_agent import _format_tools_for_prompt


def test_format_tools_for_prompt_includes_when_to_use_guidance() -> None:
    section = _format_tools_for_prompt(
        enabled_tool_names=["create_task", "load_work_memory"],
        include_catalog=False,
    )
    assert "Enabled Tools (This Turn)" in section
    assert "使うとき ->" in section
    assert "`create_task`" in section
    assert "`load_work_memory`" in section
