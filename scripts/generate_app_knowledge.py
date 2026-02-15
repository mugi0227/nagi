#!/usr/bin/env python3
"""
APP_KNOWLEDGE.md 自動生成スクリプト

このスクリプトは、コードベースから以下の情報を自動収集してAPP_KNOWLEDGE.mdを生成します：
1. 機能一覧 - フロントエンドのルート定義から
2. ディレクトリ構造 - ファイルシステムから
3. API一覧 - FastAPIルーターから
4. AIツール一覧 - tools/__init__.pyから

Usage:
    python scripts/generate_app_knowledge.py
"""

import ast
import os
import re
from pathlib import Path
from datetime import datetime


# プロジェクトルートを取得
PROJECT_ROOT = Path(__file__).parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
OUTPUT_FILE = PROJECT_ROOT / "docs" / "APP_KNOWLEDGE.md"


def extract_frontend_routes() -> list[dict]:
    """フロントエンドのルート定義を抽出"""
    routes = []
    app_tsx = FRONTEND_DIR / "src" / "App.tsx"

    if not app_tsx.exists():
        return routes

    content = app_tsx.read_text(encoding="utf-8")

    # Route定義を抽出 (path="xxx" element={<Xxx />})
    route_pattern = r'<Route\s+path="([^"]+)"\s+element=\{<(\w+)'
    matches = re.findall(route_pattern, content)

    for path, component in matches:
        routes.append({
            "path": path,
            "component": component,
        })

    return routes


def extract_sidebar_items() -> list[dict]:
    """サイドバーのナビゲーション項目を抽出"""
    items = []
    sidebar_tsx = FRONTEND_DIR / "src" / "components" / "layout" / "Sidebar.tsx"

    if not sidebar_tsx.exists():
        return items

    content = sidebar_tsx.read_text(encoding="utf-8")

    # navItems配列を抽出
    nav_pattern = r"\{\s*path:\s*['\"]([^'\"]+)['\"],\s*label:\s*['\"]([^'\"]+)['\"]"
    matches = re.findall(nav_pattern, content)

    for path, label in matches:
        items.append({
            "path": path,
            "label": label,
        })

    return items


def generate_directory_tree() -> str:
    """ディレクトリ構造を生成"""
    tree = []

    # Backend構造
    tree.append("backend/")
    backend_dirs = [
        "app/api/           # FastAPI Routers",
        "app/core/          # Config, Logger, Exceptions",
        "app/models/        # Pydantic Schemas",
        "app/services/      # Business Logic",
        "app/agents/        # ADK Agents",
        "app/tools/         # Agent Tools",
        "app/interfaces/    # Abstract Interfaces",
        "app/infrastructure/",
        "    local/         # SQLite implementations",
        "    gcp/           # GCP implementations",
    ]
    for d in backend_dirs:
        tree.append(f"├── {d}")

    tree.append("")
    tree.append("frontend/")
    frontend_dirs = [
        "src/api/           # API clients",
        "src/components/    # React components",
        "src/hooks/         # Custom hooks",
        "src/pages/         # Page components",
        "src/utils/         # Utility functions",
    ]
    for d in frontend_dirs:
        tree.append(f"├── {d}")

    return "\n".join(tree)


def extract_api_endpoints() -> list[dict]:
    """FastAPIのエンドポイントを抽出"""
    endpoints = []
    api_dir = BACKEND_DIR / "app" / "api"

    if not api_dir.exists():
        return endpoints

    for py_file in sorted(api_dir.glob("*.py")):
        if py_file.name.startswith("_"):
            continue
        if py_file.name == "deps.py":
            continue

        content = py_file.read_text(encoding="utf-8")
        module_name = py_file.stem

        # @router.get/post/patch/delete/put を抽出
        endpoint_pattern = r'@router\.(get|post|patch|delete|put)\(["\']([^"\']+)["\'][^)]*\)\s*\nasync def (\w+)\([^)]*\)(?:\s*->\s*[^:]+)?:\s*\n\s*"""([^"]*(?:""[^"]*)*?)"""'
        matches = re.findall(endpoint_pattern, content, re.MULTILINE)

        for method, path, func_name, docstring in matches:
            endpoints.append({
                "module": module_name,
                "method": method.upper(),
                "path": path,
                "function": func_name,
                "description": docstring.strip().split("\n")[0] if docstring else "",
            })

    return endpoints


def extract_ai_tools() -> list[dict]:
    """AIツール一覧を抽出"""
    tools = []
    tools_init = BACKEND_DIR / "app" / "tools" / "__init__.py"

    if not tools_init.exists():
        return tools

    content = tools_init.read_text(encoding="utf-8")

    # __all__ からツール名を抽出
    all_pattern = r'__all__\s*=\s*\[(.*?)\]'
    match = re.search(all_pattern, content, re.DOTALL)

    if match:
        all_content = match.group(1)
        tool_names = re.findall(r'"(\w+)"', all_content)

        for name in tool_names:
            # ツール名から説明を推測
            readable_name = name.replace("_tool", "").replace("_", " ").title()
            tools.append({
                "name": name,
                "readable_name": readable_name,
            })

    return tools


def extract_tool_details() -> dict[str, str]:
    """各ツールファイルからdocstringを抽出"""
    tool_docs = {}
    tools_dir = BACKEND_DIR / "app" / "tools"

    if not tools_dir.exists():
        return tool_docs

    for py_file in tools_dir.glob("*.py"):
        if py_file.name.startswith("_"):
            continue

        content = py_file.read_text(encoding="utf-8")

        # FunctionTool定義を探す
        # パターン: def xxx_tool(...) または xxx_tool = FunctionTool(
        func_pattern = r'def (\w+_tool)\([^)]*\)(?:\s*->\s*[^:]+)?:\s*\n\s*"""([^"]*(?:""[^"]*)*?)"""'
        matches = re.findall(func_pattern, content, re.MULTILINE)

        for func_name, docstring in matches:
            first_line = docstring.strip().split("\n")[0] if docstring else ""
            tool_docs[func_name] = first_line

    return tool_docs


def generate_app_knowledge() -> str:
    """APP_KNOWLEDGE.md の内容を生成"""
    sections = []

    # ヘッダー
    sections.append("# nagi - アプリケーション知識ベース")
    sections.append("")
    sections.append(f"*自動生成: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*")
    sections.append("")
    sections.append("このドキュメントはコードベースから自動生成されています。")
    sections.append("Issue投稿時のAIコンテキストとして使用されます。")
    sections.append("")

    # 1. アプリ概要
    sections.append("## 1. アプリケーション概要")
    sections.append("")
    sections.append("**nagi** は、自律型秘書AIアプリケーションです。")
    sections.append("")
    sections.append("主な特徴:")
    sections.append("- 自然な入力: 思いついたことを気軽に投げ込める")
    sections.append("- タスク管理: AIがタスクを整理・分解")
    sections.append("- プロジェクト管理: フェーズ・マイルストーンでの進捗管理")
    sections.append("- スケジュール: 自動スケジューリング")
    sections.append("- 会議サポート: アジェンダ管理・議事録")
    sections.append("")

    # 2. 機能一覧
    sections.append("## 2. 機能一覧")
    sections.append("")

    sidebar_items = extract_sidebar_items()
    if sidebar_items:
        sections.append("### サイドバーナビゲーション")
        sections.append("")
        sections.append("| パス | 機能名 |")
        sections.append("|------|--------|")
        for item in sidebar_items:
            sections.append(f"| `{item['path']}` | {item['label']} |")
        sections.append("")

    routes = extract_frontend_routes()
    if routes:
        sections.append("### 全ルート")
        sections.append("")
        sections.append("| パス | コンポーネント |")
        sections.append("|------|----------------|")
        for route in routes:
            sections.append(f"| `{route['path']}` | {route['component']} |")
        sections.append("")

    # 3. ディレクトリ構造
    sections.append("## 3. ディレクトリ構造")
    sections.append("")
    sections.append("```")
    sections.append(generate_directory_tree())
    sections.append("```")
    sections.append("")

    # 4. API一覧
    sections.append("## 4. API エンドポイント")
    sections.append("")

    endpoints = extract_api_endpoints()
    if endpoints:
        # モジュールごとにグループ化
        by_module = {}
        for ep in endpoints:
            module = ep["module"]
            if module not in by_module:
                by_module[module] = []
            by_module[module].append(ep)

        for module, eps in sorted(by_module.items()):
            sections.append(f"### {module}")
            sections.append("")
            sections.append("| Method | Path | 説明 |")
            sections.append("|--------|------|------|")
            for ep in eps:
                sections.append(f"| {ep['method']} | `{ep['path']}` | {ep['description']} |")
            sections.append("")

    # 5. AIツール一覧
    sections.append("## 5. AI ツール一覧")
    sections.append("")
    sections.append("AIエージェントが使用できるツール:")
    sections.append("")

    tools = extract_ai_tools()
    tool_docs = extract_tool_details()

    if tools:
        # カテゴリごとにグループ化
        categories = {
            "task": "タスク管理",
            "project": "プロジェクト管理",
            "memory": "メモリ・スキル",
            "phase": "フェーズ・マイルストーン",
            "meeting": "会議・アジェンダ",
            "scheduler": "スケジューラー",
        }

        categorized = {cat: [] for cat in categories}
        other = []

        for tool in tools:
            name = tool["name"]
            found = False
            for cat_key in categories:
                if cat_key in name:
                    categorized[cat_key].append(tool)
                    found = True
                    break
            if not found:
                other.append(tool)

        for cat_key, cat_name in categories.items():
            if categorized[cat_key]:
                sections.append(f"### {cat_name}")
                sections.append("")
                for tool in categorized[cat_key]:
                    doc = tool_docs.get(tool["name"], "")
                    sections.append(f"- `{tool['name']}`: {doc or tool['readable_name']}")
                sections.append("")

        if other:
            sections.append("### その他")
            sections.append("")
            for tool in other:
                doc = tool_docs.get(tool["name"], "")
                sections.append(f"- `{tool['name']}`: {doc or tool['readable_name']}")
            sections.append("")

    # 6. 技術スタック
    sections.append("## 6. 技術スタック")
    sections.append("")
    sections.append("### バックエンド")
    sections.append("- Python 3.11+")
    sections.append("- FastAPI")
    sections.append("- SQLAlchemy (SQLite)")
    sections.append("- Google ADK (Agent Development Kit)")
    sections.append("- Gemini API / Vertex AI")
    sections.append("")
    sections.append("### フロントエンド")
    sections.append("- React 18")
    sections.append("- TypeScript")
    sections.append("- Vite")
    sections.append("- TailwindCSS")
    sections.append("")

    return "\n".join(sections)


def main():
    """メイン処理"""
    # 出力ディレクトリを作成
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    # APP_KNOWLEDGE.md を生成
    content = generate_app_knowledge()

    # ファイルに書き込み
    OUTPUT_FILE.write_text(content, encoding="utf-8")

    print(f"Generated: {OUTPUT_FILE}")
    print(f"Size: {len(content)} bytes")


if __name__ == "__main__":
    main()
