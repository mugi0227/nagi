# AGENTS.md - Development Guide for Agentic Coding

## Build & Test Commands

```bash
# Install dependencies (dev mode)
pip install -e ".[dev]"

# Run development server
uvicorn main:app --reload

# Run all tests
pytest

# Run specific test file
pytest tests/unit/test_task_repository.py

# Run specific test function
pytest tests/unit/test_task_repository.py::test_create_task

# Run tests by marker
pytest -m e2e          # E2E tests (real API calls)
pytest -m integration  # Integration tests (in-memory DB)
pytest -m "not e2e"   # Skip E2E tests

# Run with coverage
pytest --cov=app

# Lint code
ruff check

# Format code
ruff format

# Type check
mypy

# ADK Web UI (agent testing)
adk web
```

## Code Style Guidelines

### Python Version & Formatting
- **Target Python**: 3.11+
- **Line length**: 100 characters
- **Linting**: Ruff (E, F, I, N, W rules)
- **Type checking**: MyPy strict mode
- **Always run**: `ruff check` and `mypy` before committing changes

### Import Style
```python
# Standard library first
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

# Third-party libraries
from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

# Local imports (app.*)
from app.core.exceptions import NotFoundError
from app.interfaces.task_repository import ITaskRepository
from app.models.task import Task, TaskCreate

# Forward references in complex files
from __future__ import annotations
```

### Type Hints
```python
# Use Python 3.11+ style
def get_task(task_id: UUID) -> Optional[Task]:
    ...

def list_tasks(user_id: str, limit: int = 100) -> list[Task]:
    ...

# Use Optional for nullable types
title: Optional[str] = None
```

### Naming Conventions
- **Classes**: `PascalCase` - `TaskService`, `SqliteTaskRepository`
- **Functions/Methods**: `snake_case` - `create_task`, `find_similar_tasks`
- **Private methods**: `_snake_case` - `_normalize_datetime`, `_orm_to_model`
- **Constants**: `UPPER_SNAKE_CASE` - `SIMILARITY_THRESHOLD`
- **Interfaces**: Prefixed with `I` - `ITaskRepository`, `ILLMProvider`
- **Pydantic models**: Descriptive - `TaskCreate`, `TaskUpdate`, `TaskBase`

### Pydantic Models
```python
from pydantic import BaseModel, Field, model_validator

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    estimated_minutes: Optional[int] = Field(None, ge=1, le=480)
    importance: Priority = Field(Priority.MEDIUM)

    @model_validator(mode='after')
    def validate_fixed_time(self):
        if self.is_fixed_time and not self.start_time:
            raise ValueError("start_time required for fixed-time tasks")
        return self
```

### Error Handling
```python
# Use custom exceptions from app.core.exceptions
from app.core.exceptions import NotFoundError, BusinessLogicError

# In services
async def get_task(task_id: UUID) -> Task:
    task = await self.repo.get(task_id)
    if not task:
        raise NotFoundError(f"Task {task_id} not found")
    return task

# In API routes
from fastapi import HTTPException, status

@router.get("/{task_id}")
async def get_task(task_id: UUID):
    try:
        return await service.get_task(task_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

### Repository Pattern
```python
# Define interface first (in app/interfaces/)
class ITaskRepository(ABC):
    @abstractmethod
    async def get(self, user_id: str, task_id: UUID) -> Optional[Task]:
        ...

# Implement in infrastructure (app/infrastructure/)
class SqliteTaskRepository(ITaskRepository):
    async def get(self, user_id: str, task_id: UUID) -> Optional[Task]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskORM).where(TaskORM.id == str(task_id))
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None
```

### Service Layer
```python
# Business logic in app/services/
class TaskService:
    def __init__(self, task_repo: ITaskRepository):
        self.task_repo = task_repo

    async def create_task(self, user_id: str, data: TaskCreate) -> Task:
        # Validate business rules
        # Call repository
        # Return result
        return await self.task_repo.create(user_id, data)
```

### API Routes
```python
# API endpoints in app/api/
from fastapi import APIRouter, Depends

router = APIRouter()

@router.post("", response_model=Task, status_code=201)
async def create_task(
    task: TaskCreate,
    user: CurrentUser,
    repo: TaskRepo = Depends(get_task_repo),
):
    return await repo.create(user.id, task)
```

### Testing Strategy
```python
# Unit tests - use mocks for dependencies
@pytest.mark.unit
async def test_create_task_success():
    repo = Mock(ITaskRepository)
    service = TaskService(repo)
    result = await service.create_task("user123", task_data)
    assert result.title == "Test Task"

# Integration tests - use in-memory SQLite
@pytest.mark.integration
async def test_repository_create(db_session):
    repo = SqliteTaskRepository(lambda: db_session)
    task = await repo.create("user123", task_data)
    assert task.id is not None

# E2E tests - real API calls
@pytest.mark.e2e
async def test_chat_flow():
    response = await client.post("/chat", json={"message": "create task"})
    assert response.status_code == 200
```

### Code Length Guidelines
- Functions: ~50 lines max (split if longer)
- Classes: ~200 lines max
- Files: ~400 lines max

### LLM Output Validation
```python
# Always validate LLM output with Pydantic
# Retry up to 2 times on validation failure
from pydantic import ValidationError

for attempt in range(3):
    try:
        result = Task.model_validate_json(llm_output)
        break
    except ValidationError as e:
        if attempt == 2:
            raise LLMValidationError(str(e), llm_output, 3)
```

### Dependency Injection
```python
# Use FastAPI dependencies for repositories/providers
from app.api.deps import TaskRepo, CurrentUser

@router.get("")
async def list_tasks(
    user: CurrentUser,
    repo: TaskRepo,
):
    return await repo.list(user.id)
```

### Database Queries
```python
# Use SQLAlchemy 2.0 async syntax
from sqlalchemy import select, and_

async def get_tasks(self, user_id: str) -> list[Task]:
    async with self._session_factory() as session:
        result = await session.execute(
            select(TaskORM).where(
                and_(
                    TaskORM.user_id == user_id,
                    TaskORM.status != "DONE"
                )
            ).order_by(TaskORM.created_at.desc())
        )
        return [self._orm_to_model(orm) for orm in result.scalars().all()]
```

### Key Principles
1. **TDD**: Write tests before implementation
2. **Interface-first**: Define abstract interfaces before implementations
3. **Single Responsibility**: Each function/class has one clear purpose
4. **KISS**: Simple solutions over complex abstractions
5. **YAGNI**: Don't add features until needed
6. **Type safety**: All LLM outputs must be Pydantic-validated
7. **No comments**: Let code be self-documenting (unless explicitly requested)
