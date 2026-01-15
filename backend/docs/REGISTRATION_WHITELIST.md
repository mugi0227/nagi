# Registration Whitelist

ユーザー登録を特定のメールアドレスに制限するホワイトリスト機能。

## 概要

この機能により、事前に許可したメールアドレスのみがユーザー登録できるようになります。
招待制のクローズドサービスや、特定のチーム・組織のみに限定したい場合に有用です。

## 設定方法

### 環境変数

`.env`ファイルに以下を設定：

```bash
# カンマ区切りでメールアドレスを指定
REGISTRATION_WHITELIST_EMAILS=user1@example.com,user2@example.com,admin@company.co.jp
```

### 動作

| 設定値 | 動作 |
|--------|------|
| 空（デフォルト） | 制限なし。誰でも登録可能 |
| メールアドレスを指定 | 指定されたメールアドレスのみ登録可能 |

### 注意事項

- **大文字小文字を区別しない**: `User@Example.com` と `user@example.com` は同一として扱われる
- **前後の空白は無視**: `  user@example.com  ` は `user@example.com` として扱われる
- **空のエントリは無視**: `user1@example.com,,user2@example.com` は有効

## エラーレスポンス

ホワイトリストにないメールアドレスで登録しようとした場合：

```json
{
  "detail": "This email address is not allowed to register"
}
```

- **HTTPステータス**: `403 Forbidden`

## 適用範囲

この制限は以下のエンドポイントに適用されます：

- `POST /api/auth/register` - ローカル認証での新規登録

**注意**: OIDC認証では、外部プロバイダーでの認証後にユーザーが作成されるため、このホワイトリストは適用されません。OIDC利用時は、プロバイダー側でアクセス制御を行ってください。

## ユーザー名（Username）の一意性

ホワイトリストとは別に、ユーザー名の一意性もデータベースレベルで保証されています。

| エラー条件 | HTTPステータス | メッセージ |
|------------|----------------|------------|
| ユーザー名が既に存在 | `409 Conflict` | `Username already exists` |
| メールアドレスが既に存在 | `409 Conflict` | `Email already exists` |

## 設定例

### 例1: 特定のドメインのみ許可したい場合

現在、ドメインベースの制限はサポートしていません。個別のメールアドレスを列挙してください。

```bash
REGISTRATION_WHITELIST_EMAILS=alice@company.co.jp,bob@company.co.jp,carol@company.co.jp
```

### 例2: 開発環境で制限を無効化

```bash
# 空にすると制限なし
REGISTRATION_WHITELIST_EMAILS=
```

### 例3: 本番環境で招待制にする

```bash
REGISTRATION_WHITELIST_EMAILS=invited-user1@gmail.com,invited-user2@outlook.com
```

## 関連ファイル

- [config.py](../app/core/config.py) - 環境変数定義
- [auth.py](../app/api/auth.py) - 登録エンドポイント実装
- [.env.example](../.env.example) - 環境変数サンプル
