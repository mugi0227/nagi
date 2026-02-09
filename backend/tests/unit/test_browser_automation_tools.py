"""
Unit tests for browser automation delegation tools.
"""

import pytest

from app.tools.browser_automation_tools import (
    RegisterBrowserSkillInput,
    RunBrowserTaskInput,
    RunHybridRpaInput,
    register_browser_skill,
    run_browser_task,
    run_hybrid_rpa,
)


@pytest.mark.asyncio
async def test_run_browser_task_payload():
    payload = await run_browser_task(
        RunBrowserTaskInput(
            goal="Open invoice page",
            start_url="https://example.com/invoices",
            notes="Use latest month",
        )
    )

    assert payload["status"] == "browser_task_requested"
    assert payload["requires_extension_execution"] is True
    assert payload["goal"] == "Open invoice page"
    assert payload["start_url"] == "https://example.com/invoices"
    assert payload["notes"] == "Use latest month"


@pytest.mark.asyncio
async def test_register_browser_skill_payload():
    payload = await register_browser_skill(
        RegisterBrowserSkillInput(
            title="Invoice workflow",
            when_to_use="When processing monthly invoice submissions",
            tags=["browser", "invoice"],
            target_goal="Process invoice",
            force=True,
        )
    )

    assert payload["status"] == "browser_skill_registration_requested"
    assert payload["requires_extension_execution"] is True
    assert payload["kind"] == "register_browser_skill"
    assert payload["payload"]["title"] == "Invoice workflow"
    assert payload["payload"]["force"] is True


@pytest.mark.asyncio
async def test_run_hybrid_rpa_payload():
    payload = await run_hybrid_rpa(
        RunHybridRpaInput(
            goal="Process invoice in portal",
            scenario_name="Invoice Processing",
            start_url="https://example.com/login",
            steps=[
                {"type": "navigate", "url": "https://example.com/invoices"},
                {"type": "click", "selector": "button#new"},
                {"type": "type", "selector": "input[name='invoiceNo']", "text": "INV-001"},
            ],
            ai_fallback=True,
            ai_fallback_max_steps=4,
            step_retry_limit=1,
            stop_on_failure=True,
            notes="Requires approval before submit button",
        )
    )

    assert payload["status"] == "hybrid_rpa_requested"
    assert payload["requires_extension_execution"] is True
    assert payload["kind"] == "run_hybrid_rpa"
    assert payload["goal"] == "Process invoice in portal"
    assert payload["payload"]["scenario_name"] == "Invoice Processing"
    assert len(payload["payload"]["steps"]) == 3
    assert payload["payload"]["ai_fallback"] is True
    assert payload["payload"]["ai_fallback_max_steps"] == 4
