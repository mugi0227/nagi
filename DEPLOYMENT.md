# Deployment Guide - AWS Linux Environment

このドキュメントは、nagiをAWS EC2（Amazon Linux）環境にデプロイする手順を説明します。

## 前提条件

- EC2インスタンス（Amazon Linux 2023推奨）
- Node.js 20.x（nvmでインストール済み）
- Python 3.11+（仮想環境設定済み）
- Nginx
- Git

## 1. リポジトリのクローン

```bash
cd /home/ec2-user
git clone <repository-url> Secretary_Partner_AI
cd Secretary_Partner_AI
```

## 2. バックエンドのセットアップ

```bash
cd backend

# 仮想環境作成とアクティベート
python3 -m venv .venv
source .venv/bin/activate

# 依存関係インストール
pip install -e ".[dev]"

# .envファイルの設定
cp .env.example .env
# .envファイルを編集して環境変数を設定
nano .env
```

### 必須環境変数 (.env)

```bash
ENVIRONMENT=local  # または gcp
LLM_PROVIDER=gemini-api
GOOGLE_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.0-flash
```

## 3. フロントエンドのセットアップ

```bash
cd ../frontend

# 依存関係インストール
npm install

# .envファイルの設定
cp .env.example .env
# .envファイルを編集
nano .env
```

### フロントエンド環境変数 (.env)

```bash
VITE_API_URL=http://localhost:8000/api
VITE_AUTH0_DOMAIN=your_auth0_domain
VITE_AUTH0_CLIENT_ID=your_client_id
VITE_AUTH0_AUDIENCE=your_audience
VITE_AUTH0_REDIRECT_URI=http://your-domain/
```

```bash
# ビルド実行
npm run build
```

## 4. systemdサービスのインストール

```bash
cd /home/ec2-user/Secretary_Partner_AI

# サービスファイルをコピー
sudo cp secretary-backend.service /etc/systemd/system/
sudo cp secretary-frontend.service /etc/systemd/system/

# systemdをリロード
sudo systemctl daemon-reload

# サービスを有効化（自動起動設定）
sudo systemctl enable secretary-backend
sudo systemctl enable secretary-frontend

# サービスを起動
sudo systemctl start secretary-backend
sudo systemctl start secretary-frontend

# ステータス確認
sudo systemctl status secretary-backend
sudo systemctl status secretary-frontend
```

## 5. Nginxのセットアップ

```bash
cd /home/ec2-user/Secretary_Partner_AI

# Nginx設定ファイルをコピー
sudo cp nginx-secretary.conf /etc/nginx/conf.d/

# Nginx設定テスト
sudo nginx -t

# Nginxを再起動
sudo systemctl restart nginx

# Nginx自動起動を有効化
sudo systemctl enable nginx
```

## 6. ファイアウォール設定（必要に応じて）

```bash
# ALBからのポート80アクセスを許可
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

## 7. 動作確認

```bash
# ローカルでヘルスチェック
curl http://localhost/health

# バックエンドAPI確認
curl http://localhost/api/health

# フロントエンド確認
curl http://localhost/
```

ブラウザで `http://<EC2のパブリックIP>` にアクセスして動作確認。

## サービス管理コマンド

### ログ確認

```bash
# バックエンドログ
sudo journalctl -u secretary-backend -f

# フロントエンドログ
sudo journalctl -u secretary-frontend -f

# Nginxログ
sudo tail -f /var/log/nginx/secretary_access.log
sudo tail -f /var/log/nginx/secretary_error.log
```

### サービスの再起動

```bash
# バックエンド再起動
sudo systemctl restart secretary-backend

# フロントエンド再起動
sudo systemctl restart secretary-frontend

# Nginx再起動
sudo systemctl restart nginx
```

### サービスの停止

```bash
sudo systemctl stop secretary-backend
sudo systemctl stop secretary-frontend
```

## アップデート手順

```bash
cd /home/ec2-user/Secretary_Partner_AI

# 変更をstash（ローカル変更がある場合）
git stash

# 最新版を取得
git pull origin main

# stashを戻す（必要に応じて）
git stash pop

# バックエンド更新
cd backend
source .venv/bin/activate
pip install -e ".[dev]"

# フロントエンド更新とビルド
cd ../frontend
npm install
npm run build

# サービス再起動
sudo systemctl restart secretary-backend
sudo systemctl restart secretary-frontend
```

## トラブルシューティング

### サービスが起動しない

```bash
# エラーログ確認
sudo journalctl -u secretary-backend -n 50
sudo journalctl -u secretary-frontend -n 50

# 権限確認
ls -la /home/ec2-user/Secretary_Partner_AI/backend
ls -la /home/ec2-user/Secretary_Partner_AI/frontend
```

### Nginxエラー

```bash
# 設定ファイルの文法チェック
sudo nginx -t

# エラーログ確認
sudo tail -50 /var/log/nginx/secretary_error.log
```

### ポート確認

```bash
# ポート使用状況確認
sudo netstat -tulpn | grep -E ':(80|8000|5173)'
```

## セキュリティ考慮事項

1. **環境変数の保護**: `.env`ファイルには機密情報が含まれるため、適切な権限設定（600）を行う

```bash
chmod 600 backend/.env
chmod 600 frontend/.env
```

2. **HTTPS設定**: 本番環境ではSSL/TLS証明書を設定する（Let's Encrypt推奨）

3. **ファイアウォール**: 不要なポートは閉じ、ALBからのアクセスのみ許可

## ALB設定（参考）

- **ターゲットグループ**: EC2インスタンスのポート80
- **ヘルスチェックパス**: `/health`
- **ヘルスチェック間隔**: 30秒
- **正常判定しきい値**: 2
- **非正常判定しきい値**: 2

## バックアップ推奨

定期的に以下をバックアップすることを推奨：

- データベース（SQLiteファイル）
- `.env`ファイル
- アップロードされたファイル（storage/ディレクトリ）
