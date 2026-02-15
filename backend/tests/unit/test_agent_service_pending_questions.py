from app.services.agent_service import AgentService


def test_normalize_tool_response_parses_python_literal_string() -> None:
    raw = (
        "{'status': 'awaiting_response', "
        "'questions': [{'id': 'q1', 'question': '期限は？', 'options': []}]}"
    )

    parsed = AgentService._normalize_tool_response(raw)

    assert parsed is not None
    assert parsed["status"] == "awaiting_response"
    assert isinstance(parsed["questions"], list)


def test_parse_pending_questions_handles_nested_tool_result() -> None:
    raw = {
        "result": {
            "status": "awaiting_response",
            "questions": [
                {
                    "id": "q1",
                    "question": "いつまでに必要ですか？",
                    "options": ["今日中", "今週中"],
                    "allow_multiple": False,
                }
            ],
            "context": "進めるために教えてください。",
        }
    }

    pending = AgentService._parse_pending_questions(raw)

    assert pending is not None
    assert pending.context == "進めるために教えてください。"
    assert len(pending.questions) == 1
    assert pending.questions[0].id == "q1"
    assert pending.questions[0].question == "いつまでに必要ですか？"
