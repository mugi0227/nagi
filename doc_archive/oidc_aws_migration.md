# 📘 OIDC/JWT 認証基盤統一 & AWS Cognito 移行手順書

## 1. 概要・アーキテクチャ

本手順は、認証機能をアプリ（バックエンド）から切り離し、**OIDC (OpenID Connect)** に統一するためのものです。これにより、将来的にGoogle Cloud IdentityやAuth0など、IdP（Identity Provider）を自由に差し替えられる構成にします。

### 認証フローのイメージ

1. **Frontend**: Cognitoへログイン → **JWT (ID Token)** を取得
2. **Frontend**: APIリクエストのヘッダーに `Authorization: Bearer <JWT>` を付与
3. **Backend**: 公開鍵 (JWKS) を使ってJWTの署名を検証 → `sub` (ユーザーID) を特定
4. **Backend**: `users` テーブルと照合し、認可を行う

---

## 2. 事前準備: 環境変数の定義

各環境変数の役割と設定値を定義します。

### Backend (.env)

| 変数名 | 設定値の例・説明 |
| --- | --- |
| **`AUTH_PROVIDER`** | `oidc` (必須: 検証機能を有効化) |
| **`OIDC_ISSUER`** | `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`<br>

<br>※ トークンの発行元URL |
| **`OIDC_AUDIENCE`** | `<appClientId>`<br>

<br>※ トークンの利用先ID |
| `OIDC_JWKS_URL` | **(空欄でOK)**<br>

<br>※ 空の場合、Issuer末尾に `/.well-known/jwks.json` を付与して自動取得します |
| `OIDC_EMAIL_CLAIM` | `email` (Cognitoのデフォルト) |
| `OIDC_NAME_CLAIM` | `name` (Cognitoのデフォルト) |
| `OIDC_ALLOW_EMAIL_LINKING` | `false` (推奨)<br>

<br>※ `true` にするとメールアドレス一致で既存ユーザーと紐付けます（セキュリティリスクあり） |

### Frontend (.env)

| 変数名 | 設定値の例・説明 |
| --- | --- |
| **`VITE_AUTH_MODE`** | `oidc` |
| `VITE_AUTH_TOKEN` | (ローカル開発用)<br>

<br>※ Backendの検証をバイパスする場合のみ使用 |

---

## 3. AWS Cognito セットアップ手順

AWSコンソールにて以下のリソースを作成します。

### Step 1: User Pool の作成

* **サインインオプション**: Eメール (推奨)
* **パスワードポリシー**: プロジェクトのセキュリティ要件に合わせる
* **MFA**: 必要に応じて設定 (開発環境ならOFFでも可)

### Step 2: App client の作成

* **Client type**: Public client (Single Page Appなどの場合)
* **Client secret**: **Generate client secret は「OFF」にする** (Frontendから直接アクセスするため)
* **Allowed OAuth Flows**: `Authorization code grant` を選択
* **Allowed OAuth Scopes**: `openid`, `email`, `profile` を選択

### Step 3: Hosted UI (ログイン画面) の設定

* **Domain**: Cognitoドメインを作成 (例: `my-app-auth`)
* **Allowed callback URLs**: ログイン後の戻り先 (例: `http://localhost:3000/callback`)
* **Allowed sign-out URLs**: ログアウト後の戻り先 (例: `http://localhost:3000`)

### 📝 設定値の控え（Backend設定用）

セットアップ完了後、以下の値を控えてください。

1. **User Pool ID** (例: `ap-northeast-1_xxxxxxxxx`)
2. **App Client ID** (例: `5hg8...`)
3. **Region** (例: `ap-northeast-1`)

---

## 4. 移行・切り替え作業

既存のIdP（または独自認証）からCognitoへ切り替えます。

### ⚠️ 重要: 既存ユーザーの扱いについて

既存の `users` テーブルのデータと、Cognito上のユーザーをどう紐付けるか決定してください。

#### パターンA: 自動紐付け（開発環境・少人数向け）

* **設定**: `OIDC_ALLOW_EMAIL_LINKING=true`
* **挙動**: ログインしたメールアドレスがDBにあれば、そのユーザーとしてログインします。
* **注意**: メールアドレスのなりすましリスクがあるため、Cognito側で「メール確認済み(Email Verified)」が必須です。

#### パターンB: 手動紐付け（本番環境・推奨）

* **設定**: `OIDC_ALLOW_EMAIL_LINKING=false`
* **手順**: DB管理者権限でSQLを実行し、既存ユーザーにCognitoの `sub` (UUID) を埋め込みます。
```sql
UPDATE users 
SET provider_issuer = 'https://cognito-idp...', provider_sub = '<Cognitoのsub>' 
WHERE email = 'user@example.com';

```



### 切り替え手順

1. **Cognitoユーザー作成**: 管理画面またはCLIでテストユーザーを作成する。
2. **Backend設定**: `.env` を書き換え、再起動。
3. **Frontend設定**: `.env` を書き換え、ビルド/再起動。
4. **動作確認**: ブラウザからログインを試行する。

---

## 5. 動作確認項目 (チェックリスト)

* [ ] **ログイン画面遷移**: アプリの「ログイン」ボタンでCognitoのHosted UIへ飛ぶか
* [ ] **トークン取得**: コールバック後、LocalStorage/Cookie等にJWTが保存されているか
* [ ] **API疎通**: `/api/projects` 等へリクエストした際、ヘッダーに `Authorization: Bearer ...` が付与され、`200 OK` が返るか
* [ ] **ユーザー作成**: (新規の場合) `users` テーブルにレコードがINSERTされているか
* [ ] **ユーザー特定**: (既存の場合) 期待したユーザーIDとして認識されているか

## 6. ロールバック手順

障害発生時は以下の手順で旧環境に戻します。

1. **Backend**: `.env` を `AUTH_PROVIDER=mock` (または元の設定) に戻して再デプロイ。
2. **Frontend**: `.env` を `VITE_AUTH_MODE=mock` に戻して再デプロイ。
