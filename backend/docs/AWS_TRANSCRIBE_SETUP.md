# Amazon Transcribe 導入手順

このドキュメントは、Secretary Partner AI の音声入力を `.env` で `Amazon Transcribe` に切り替えるための実施手順です。

## 1. 事前条件

- バックエンドに AWS 認証情報が渡ること
  - AWS 上で実行する場合: IAM ロール推奨
  - ローカル実行の場合: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` または `AWS_PROFILE`
- 音声一時保存用の S3 バケットを作成済みであること
- バックエンドの `SPEECH_PROVIDER` 切替実装が適用済みであること

## 2. S3 バケット作成

1. 音声ファイル一時保存用のバケットを作成する。
2. バックエンドで使うリージョンと同じリージョンで作成する。
3. バケット名を控える（後で `AWS_TRANSCRIBE_S3_BUCKET` に設定）。

## 3. IAM 権限設定

バックエンド実行主体（EC2/ECS/Lambda など）に、最低限以下の権限を付与します。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "transcribe:StartTranscriptionJob",
        "transcribe:GetTranscriptionJob",
        "transcribe:DeleteTranscriptionJob"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_TRANSCRIBE_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::YOUR_TRANSCRIBE_BUCKET"
    }
  ]
}
```

補足:
- バケットが SSE-KMS の場合は `kms:Decrypt` など KMS 権限も追加してください。

## 4. `.env` 設定

`backend/.env` に以下を設定します。

```env
SPEECH_PROVIDER=amazon-transcribe

AWS_REGION=ap-northeast-1
AWS_TRANSCRIBE_S3_BUCKET=your-transcribe-bucket
AWS_TRANSCRIBE_S3_PREFIX=transcribe-input
AWS_TRANSCRIBE_LANGUAGE=ja-JP
AWS_TRANSCRIBE_POLL_SECONDS=1.0
AWS_TRANSCRIBE_TIMEOUT_SECONDS=180
```

補足:
- `AWS_REGION` と S3 バケットリージョンは揃えてください。
- `AWS_TRANSCRIBE_TIMEOUT_SECONDS` は長音声の場合に増やしてください。

## 5. 起動/反映

設定変更後にバックエンドを再起動します。

```bash
uvicorn main:app --reload
```

デプロイ環境では、同等の再起動操作を実施してください（systemd, ECS 再デプロイ等）。

## 6. 動作確認

### 6.1 UI で確認

- 既存の音声入力（PTT）から録音し、文字起こしが返ることを確認する。

### 6.2 API で確認（任意）

- `POST /api/chat/transcribe` に音声 Data URL を送って確認する。

期待結果:
- `{"transcription":"..."}` が返る
- CloudWatch / アプリログに Transcribe エラーが出ない

## 7. 失敗時のチェックポイント

- `AWS_TRANSCRIBE_S3_BUCKET` が空になっていないか
- IAM に `transcribe:*Job` と S3 権限があるか
- バケットリージョンと `AWS_REGION` が一致しているか
- 音声 MIME が対応形式か（`webm`, `wav`, `mp3`, `mp4/m4a`, `ogg`, `flac`, `amr`）
- タイムアウトが短すぎないか（`AWS_TRANSCRIBE_TIMEOUT_SECONDS`）

## 8. 仕様メモ

- 現実装は `StartTranscriptionJob` を使うバッチ処理です。
- 処理フロー:
  1. 音声を S3 にアップロード
  2. Transcribe ジョブ起動
  3. 完了までポーリング
  4. 文字起こし JSON を取得
  5. ジョブと一時音声ファイルを削除

## 9. 参考リンク

- StartTranscriptionJob:
  - https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html
- GetTranscriptionJob:
  - https://docs.aws.amazon.com/transcribe/latest/APIReference/API_GetTranscriptionJob.html
- 入力形式:
  - https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html
- IAM ポリシー例:
  - https://docs.aws.amazon.com/transcribe/latest/dg/security_iam_id-based-policy-examples.html

