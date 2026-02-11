# Windows PTT Native PoC

## 機能概要
- グローバル長押しPTTホットキー（デフォルト `F8`）
- キーを離したタイミングで `POST /api/chat/transcribe` に送信して文字起こし
- 文字起こし結果は編集可能な入力欄に挿入
- `Enter` で `POST /api/chat` に送信
- 返信は下部パネルに表示
- ログインはワンタイムコード交換（`/api/auth/native-link/exchange`）
- `X`で閉じても終了せず、バックグラウンドで下中央HUDを表示
  - 録音中: `聞き取り中...`
  - 文字起こし中: `変換中...`
  - 確認: `プレビュー準備完了`
- バックグラウンド時
  - `Enter`: プレビュー送信
  - `Esc`: プレビュー破棄

## 前提
- Windows
- Python 3.11+
- backend が起動していること（`http://localhost:8000`）
- frontend が起動していること（`http://localhost:5173`）

## Setup
```powershell
cd native/windows_ptt_poc
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

## Run
```powershell
cd native/windows_ptt_poc
.venv\Scripts\Activate.ps1
python main.py
```

## 初回連携
1. Webアプリにログインする
2. 設定画面の「ネイティブ連携」でコードを発行する
3. ネイティブアプリにコードを貼り付けて `Link` を押す

## 使い方
1. `F8` を押している間に話す
2. `F8` を離す
3. 文字起こし結果を確認（必要なら編集）
4. `Enter` で送信

## バックグラウンド動作
- ウィンドウの `X` は「終了」ではなく「非表示」
- 音声HUDはグローバルで継続動作
- `非表示` ボタンで手動非表示
- `終了` ボタンでアプリ終了

## 補足
- トークンとセッションは `%APPDATA%\SecretaryPartnerNative\state.json` に保存されます
- 無音時は自動送信しません
