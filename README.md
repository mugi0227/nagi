# Secretary Partner AI (Brain Dump Partner)

**ADHD向け自律型秘書AI** - ユーザーの「脳内多動」を受け止め、タスク管理を自律的にサポートする次世代パーソナルアシスタント

## 概要

Secretary Partner AIは、指示待ちではなく、自らの判断でユーザーを管理・支援する「自律型エージェント」です。入力コストゼロの「外付け前頭葉」として、音声・テキスト・画像による自然な対話でタスクを自動整理し、最適な行動を提案します。

### コアコンセプト

- **Brain Dump Partner**: 思いついたことをそのまま吐き出せる、心理的ハードルゼロの入力体験
- **Autonomous Secretary**: ユーザーの代わりにタスクを分解・整理・優先順位付けを自律的に実行
- **Hybrid Operation**: チャットによる自然言語操作と、GUIによる直接操作の両立

## 主な機能

### タスク管理
- **2軸優先度管理**: 重要度（Importance）× 緊急度（Urgency）のマトリクス
- **エネルギーレベル**: 各タスクの実行難易度を考慮した提案
- **Top3推薦**: AIが今日やるべきタスクTop3を自動選定
- **自動タスク分解**: 大きなタスクを心理的ハードルの低いマイクロステップに分割
- **実行ガイド付き**: 各サブタスクに具体的な進め方のアドバイスを提供

### インテリジェントな対話
- **マルチモーダル入力**: テキスト・音声・画像に対応
- **重複検出**: 類似タスクを自動検出し、統合を提案
- **コンテキスト記憶**: プロジェクトごとの背景情報や手順を記憶
- **自律的介入**: 進捗確認や励ましを適切なタイミングで実施

### プロジェクト管理
- **案件単位の整理**: タスクをプロジェクトにグルーピング
- **文脈の保持**: プロジェクトごとの重要情報を記憶・活用
- **ドキュメント管理**: 関連資料をプロジェクトに紐付け

### 視覚的なUI
- **ダッシュボード**: 今日のTop3、週次進捗、エージェント状態を一望
- **カンバンボード**: ドラッグ&ドロップでタスク状態を変更
- **達成状況の可視化**: 完了タスク数や週次トレンドをグラフ表示
- **ダーク/ライトモード**: 目に優しいテーマ切り替え

## 技術スタック

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Agent Framework**: Google Cloud Agent Development Kit (ADK)
- **LLM**: Gemini 2.5 Flash / Claude 3.5 Sonnet (LiteLLM経由)
- **Database**: SQLite (Local) / Firestore (GCP)
- **Architecture**: Clean Architecture + Repository Pattern

### Frontend
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v7
- **State Management**: TanStack Query (React Query)
- **Styling**: CSS Variables + Framer Motion
- **UI Components**: React Icons, React Markdown

### Infrastructure
- **Local Development**: SQLite + Gemini API
- **Production (GCP)**: Firestore + Vertex AI
- **Scheduler**: APScheduler (自律的タスク実行)

## プロジェクト構造

```
Secretary_Partner_AI/
├── backend/                    # FastAPI Backend
│   ├── app/
│   │   ├── api/               # API Endpoints (Routers)
│   │   ├── agents/            # ADK Agent Definitions
│   │   │   ├── secretary_agent.py  # Main Agent
│   │   │   └── planner_agent.py    # Task Breakdown Agent
│   │   ├── services/          # Business Logic
│   │   ├── tools/             # Agent Tools (Function Calling)
│   │   ├── models/            # Pydantic Schemas
│   │   ├── interfaces/        # Abstract Base Classes
│   │   ├── infrastructure/    # Concrete Implementations
│   │   │   ├── gcp/          # Firestore, Vertex AI
│   │   │   └── local/        # SQLite, LiteLLM
│   │   └── core/             # Config, Logger, Exceptions
│   ├── tests/                 # Unit & E2E Tests
│   ├── main.py               # FastAPI Entry Point
│   └── pyproject.toml        # Dependencies
│
├── frontend/                  # React Frontend
│   ├── src/
│   │   ├── api/              # API Client & Types
│   │   ├── components/       # React Components
│   │   │   ├── chat/        # Chat Widget
│   │   │   ├── dashboard/   # Dashboard Cards
│   │   │   ├── tasks/       # Task Components
│   │   │   └── layout/      # Layout Components
│   │   ├── pages/           # Page Components
│   │   ├── hooks/           # Custom Hooks
│   │   ├── context/         # React Context
│   │   └── styles/          # Global CSS
│   ├── package.json
│   └── vite.config.ts
│
├── CLAUDE.md                 # Development Guide (for developers)
└── README.md                 # This file
```

## セットアップ手順

### 必要な環境
- Python 3.11以上
- Node.js 18以上
- Git

### 1. リポジトリのクローン

```bash
git clone https://github.com/yourusername/Secretary_Partner_AI.git
cd Secretary_Partner_AI
```

### 2. Backend のセットアップ

```bash
cd backend

# 仮想環境の作成
python -m venv .venv

# 仮想環境の有効化
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

# 依存パッケージのインストール
pip install -e ".[dev]"

# 環境変数の設定
cp .env.example .env
```

`.env` ファイルを編集して、以下の必須項目を設定：

```env
# 環境設定
ENVIRONMENT=local

# LLMプロバイダー（推奨: gemini-api）
LLM_PROVIDER=gemini-api

# Gemini API Key（https://aistudio.google.com/apikey から取得）
GOOGLE_API_KEY=your_api_key_here

# モデル名
GEMINI_MODEL=gemini-2.5-flash
```

**LLMプロバイダーの選択肢:**
- `gemini-api`: Gemini APIを直接利用（推奨・最も簡単）
- `litellm`: AWS Bedrock (Claude) やOpenAIを利用
- `vertex-ai`: GCP Vertex AIを利用（本番環境向け）

### 3. Frontend のセットアップ

```bash
cd ../frontend

# 依存パッケージのインストール
npm install

# 環境変数の設定（必要に応じて）
# デフォルトではlocalhost:8080のバックエンドに接続
```

### 4. アプリケーションの起動

**Backend（ターミナル1）:**
```bash
cd backend
.venv\Scripts\activate  # 仮想環境を有効化
uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

Backend は http://localhost:8080 で起動します。

**Frontend（ターミナル2）:**
```bash
cd frontend
npm run dev
```

Frontend は http://localhost:5173 で起動します。

ブラウザで http://localhost:5173 を開いてアプリケーションを使用できます。

## 環境変数の詳細

### Backend (.env)

| 変数名 | 説明 | デフォルト値 |
|--------|------|--------------|
| `ENVIRONMENT` | 実行環境 (`local` / `gcp`) | `local` |
| `LLM_PROVIDER` | LLMプロバイダー (`gemini-api` / `litellm` / `vertex-ai`) | `gemini-api` |
| `GOOGLE_API_KEY` | Gemini API Key | - |
| `GEMINI_MODEL` | 使用するGeminiモデル | `gemini-2.5-flash` |
| `LITELLM_MODEL` | LiteLLMモデル識別子 | `bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0` |
| `DATABASE_URL` | SQLiteデータベースのパス | `sqlite+aiosqlite:///./secretary.db` |
| `HOST` | サーバーホスト | `0.0.0.0` |
| `PORT` | サーバーポート | `8080` |
| `ALLOWED_ORIGINS` | CORS許可オリジン | `["http://localhost:3000","http://localhost:5173"]` |
| `QUIET_HOURS_START` | 通知停止開始時刻 | `02:00` |
| `QUIET_HOURS_END` | 通知停止終了時刻 | `06:00` |

**GCP環境（本番）で追加で必要:**
| 変数名 | 説明 |
|--------|------|
| `GOOGLE_CLOUD_PROJECT` | GCPプロジェクトID |
| `GOOGLE_APPLICATION_CREDENTIALS` | サービスアカウントJSONのパス |
| `FIREBASE_PROJECT_ID` | Firebase プロジェクトID |

**AWS Bedrock利用時:**
| 変数名 | 説明 |
|--------|------|
| `AWS_ACCESS_KEY_ID` | AWSアクセスキー |
| `AWS_SECRET_ACCESS_KEY` | AWSシークレットキー |
| `AWS_REGION` | AWSリージョン |

## 開発手順

### Backend開発

```bash
# 開発サーバー起動
uvicorn main:app --reload

# テスト実行
pytest                    # 全テスト
pytest -m e2e            # E2Eテスト（実APIコール）
pytest --cov=app         # カバレッジ付き

# コード品質チェック
ruff check app/          # Linter
mypy app/                # 型チェック

# ADK Web UI（エージェントのデバッグ用）
adk web
```

### Frontend開発

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# Lint
npm run lint

# プレビュー（ビルド後）
npm run preview
```

### データベース初期化

初回起動時、バックエンドが自動的にSQLiteデータベースを作成します。データをリセットしたい場合：

```bash
cd backend
rm secretary.db
# サーバーを再起動すると新しいDBが作成されます
```

## テスト戦略

1. **Unit Tests**: ビジネスロジックをモックで検証
2. **Integration Tests**: SQLite in-memoryでリポジトリ層を検証
3. **E2E Tests**: 実際のLLM APIを呼び出してエージェントフローを検証

**重要**: AI機能のテストでは、実際のAPIを使用します（モックなし）。

## API ドキュメント

バックエンド起動後、以下のURLでインタラクティブなAPIドキュメントを確認できます：

- Swagger UI: http://localhost:8080/docs
- ReDoc: http://localhost:8080/redoc

### 主要エンドポイント

**対話・入力:**
- `POST /api/chat` - メインの対話エンドポイント（テキスト・音声・画像）
- `POST /api/captures` - 音声・画像のアップロード

**タスク管理:**
- `GET /api/tasks` - タスク一覧取得
- `POST /api/tasks` - タスク作成
- `PATCH /api/tasks/{task_id}` - タスク更新
- `DELETE /api/tasks/{task_id}` - タスク削除
- `POST /api/tasks/{task_id}/breakdown` - タスク分解

**Today機能:**
- `GET /api/today/top3` - 今日の最優先タスクTop3を取得

**プロジェクト:**
- `GET /api/projects` - プロジェクト一覧
- `POST /api/projects` - プロジェクト作成

**自律動作:**
- `POST /api/heartbeat` - 定期実行（進捗確認、励まし等）

## トラブルシューティング

### Backend起動エラー

**問題**: `ModuleNotFoundError`
```bash
# 解決: 依存パッケージを再インストール
pip install -e ".[dev]"
```

**問題**: `GOOGLE_API_KEY is not set`
```bash
# 解決: .envファイルを確認し、APIキーを設定
# https://aistudio.google.com/apikey で取得
```

### Frontend起動エラー

**問題**: `Cannot connect to backend`
```bash
# 解決: バックエンドが起動しているか確認
# http://localhost:8080/docs にアクセスできるか確認
```

**問題**: `CORS Error`
```bash
# 解決: backend/.env の ALLOWED_ORIGINS を確認
# フロントエンドのURLが含まれているか確認
```

### データベース関連

**問題**: タスクが表示されない
```bash
# 解決: データベースをリセット
cd backend
rm secretary.db
# サーバーを再起動
```

## GCP環境へのデプロイ（オプショナル）

本番環境（Google Cloud Platform）へのデプロイ手順については、`docs/INFRASTRUCTURE_SWITCHING.md` を参照してください。

### 環境切り替え

```bash
# .envファイルで環境を変更
ENVIRONMENT=gcp

# GCP関連の環境変数を設定
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
FIREBASE_PROJECT_ID=your-firebase-project
```

## 貢献

プルリクエストを歓迎します！大きな変更の場合は、まずIssueを開いて変更内容を議論してください。

### 開発ガイドライン

詳細な開発ガイドは `CLAUDE.md` を参照してください。

**主要な原則:**
- **Clean Architecture**: インフラ層を抽象化し、テスタビリティを確保
- **KISS原則**: シンプルな実装を優先、過度な抽象化を避ける
- **TDD**: テストを先に書いてから実装
- **Pydanticバリデーション**: LLM出力は必ず検証し、エラー時はリトライ
- **重複チェック**: タスク作成前に類似タスクを確認

## サポート

- バグ報告・機能要望: [GitHub Issues](https://github.com/yourusername/Secretary_Partner_AI/issues)
- ディスカッション: [GitHub Discussions](https://github.com/yourusername/Secretary_Partner_AI/discussions)

---

**Made with ❤️ for ADHD Warriors**
