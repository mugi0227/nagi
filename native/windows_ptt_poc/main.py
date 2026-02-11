from __future__ import annotations

import base64
import io
import json
import os
import queue
import threading
import time
import wave
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import requests
import sounddevice as sd
import webview
from dotenv import load_dotenv
from pynput import keyboard


# ---------------------------------------------------------------------------
# App configuration
# ---------------------------------------------------------------------------

@dataclass
class AppConfig:
    backend_base_url: str
    web_app_url: str
    hotkey: str
    sample_rate: int
    channels: int
    language: str
    window_width: int
    window_height: int
    window_margin_bottom: int
    min_record_seconds: float
    request_timeout_seconds: float
    hud_margin_bottom: int
    hud_preview_max_chars: int
    hud_response_max_chars: int

    @classmethod
    def from_env(cls) -> "AppConfig":
        base_url = os.getenv("BACKEND_BASE_URL", "http://localhost:8000/api").strip().rstrip("/")
        web_app_url = os.getenv("WEB_APP_URL", "http://localhost:5173").strip().rstrip("/")
        return cls(
            backend_base_url=base_url,
            web_app_url=web_app_url,
            hotkey=os.getenv("HOTKEY", "F8").strip(),
            sample_rate=int(os.getenv("AUDIO_SAMPLE_RATE", "16000")),
            channels=max(1, int(os.getenv("AUDIO_CHANNELS", "1"))),
            language=os.getenv("AUDIO_LANGUAGE", "ja-JP").strip() or "ja-JP",
            window_width=max(520, int(os.getenv("WINDOW_WIDTH", "820"))),
            window_height=max(240, int(os.getenv("WINDOW_HEIGHT", "440"))),
            window_margin_bottom=max(0, int(os.getenv("WINDOW_MARGIN_BOTTOM", "48"))),
            min_record_seconds=max(0.1, float(os.getenv("MIN_RECORD_SECONDS", "0.35"))),
            request_timeout_seconds=max(3.0, float(os.getenv("REQUEST_TIMEOUT_SECONDS", "35"))),
            hud_margin_bottom=max(0, int(os.getenv("HUD_MARGIN_BOTTOM", "28"))),
            hud_preview_max_chars=max(60, int(os.getenv("HUD_PREVIEW_MAX_CHARS", "320"))),
            hud_response_max_chars=max(60, int(os.getenv("HUD_RESPONSE_MAX_CHARS", "260"))),
        )


# ---------------------------------------------------------------------------
# Persistent user state
# ---------------------------------------------------------------------------

@dataclass
class StoredState:
    token: str | None = None
    session_id: str | None = None
    user_id: str | None = None
    user_email: str | None = None
    user_display_name: str | None = None
    hotkey: str | None = None

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "StoredState":
        return cls(
            token=raw.get("token"),
            session_id=raw.get("session_id"),
            user_id=raw.get("user_id"),
            user_email=raw.get("user_email"),
            user_display_name=raw.get("user_display_name"),
            hotkey=raw.get("hotkey"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "token": self.token,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "user_email": self.user_email,
            "user_display_name": self.user_display_name,
            "hotkey": self.hotkey,
        }


# ---------------------------------------------------------------------------
# Backend HTTP client
# ---------------------------------------------------------------------------

class BackendApiClient:
    def __init__(self, config: AppConfig, state: StoredState):
        self._config = config
        self._state = state
        self._session = requests.Session()

    @property
    def has_token(self) -> bool:
        token = (self._state.token or "").strip()
        return bool(token)

    def exchange_native_link_code(self, code: str) -> dict[str, Any]:
        payload = {"code": code}
        return self._request("POST", "/auth/native-link/exchange", json=payload, auth=False)

    def transcribe_audio(self, wav_bytes: bytes) -> str:
        encoded = base64.b64encode(wav_bytes).decode("ascii")
        payload = {
            "audio_base64": f"data:audio/wav;base64,{encoded}",
            "audio_mime_type": "audio/wav",
            "audio_language": self._config.language,
        }
        data = self._request("POST", "/chat/transcribe", json=payload, auth=True)
        return str(data.get("transcription", "")).strip()

    def send_chat(self, text: str) -> dict[str, Any]:
        payload: dict[str, Any] = {"text": text}
        if self._state.session_id:
            payload["session_id"] = self._state.session_id
        return self._request("POST", "/chat", json=payload, auth=True)

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any],
        auth: bool,
    ) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if auth:
            token = (self._state.token or "").strip()
            if not token:
                raise RuntimeError("未連携です。Webで連携コードを発行してこのアプリに貼り付けてください。")
            headers["Authorization"] = f"Bearer {token}"

        url = f"{self._config.backend_base_url}{path}"
        try:
            response = self._session.request(
                method, url, json=json, headers=headers,
                timeout=self._config.request_timeout_seconds,
            )
        except requests.RequestException as exc:
            raise RuntimeError(f"バックエンド通信に失敗しました: {exc}") from exc

        if response.status_code >= 400:
            detail = None
            try:
                body = response.json()
                if isinstance(body, dict):
                    detail = body.get("detail")
            except ValueError:
                detail = None
            suffix = f": {detail}" if detail else ""
            raise RuntimeError(f"HTTP {response.status_code} {response.reason}{suffix}")

        try:
            data = response.json()
        except ValueError as exc:
            raise RuntimeError("バックエンドから不正なJSONが返されました") from exc

        if not isinstance(data, dict):
            raise RuntimeError("バックエンドのレスポンス形式が想定外です。")
        return data


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _truncate_text(value: str, limit: int) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[: max(0, limit - 3)].rstrip()}..."


def _js_str(value: str) -> str:
    """Safely encode a Python string for embedding in JS."""
    return json.dumps(value, ensure_ascii=False)


# ---------------------------------------------------------------------------
# pywebview JS API – Main Window
# ---------------------------------------------------------------------------

class MainWindowApi:
    """Exposed to JavaScript in the main window via pywebview.api."""

    def __init__(self, app: "NativePttOverlayApp"):
        self._app = app

    def start_link_flow(self, code: str) -> None:
        self._app._start_link_flow(code)

    def apply_hotkey(self, key: str) -> None:
        self._app._apply_hotkey_from_ui(key)

    def send_message(self) -> None:
        self._app._start_send_flow()

    def clear_transcript(self) -> None:
        self._app._clear_transcript()

    def hide_window(self) -> None:
        self._app._hide_main_window()

    def close_app(self) -> None:
        self._app._shutdown()

    def open_link_page(self) -> None:
        webbrowser.open(f"{self._app._config.web_app_url}/native-link")

    def open_web_app(self) -> None:
        webbrowser.open(self._app._config.web_app_url)

    def open_tasks(self) -> None:
        webbrowser.open(f"{self._app._config.web_app_url}/tasks")

    def get_transcript_text(self) -> str:
        return self._app._get_transcript_text()


# ---------------------------------------------------------------------------
# pywebview JS API – HUD
# ---------------------------------------------------------------------------

class HudApi:
    """Exposed to JavaScript in the HUD overlay via pywebview.api."""

    def __init__(self, app: "NativePttOverlayApp"):
        self._app = app

    def hud_clicked(self) -> None:
        self._app._event_queue.put(("show_main", None))

    def hud_send(self, text: str) -> None:
        self._app._event_queue.put(("hud_send", text))

    def hud_cancel(self) -> None:
        self._app._event_queue.put(("hud_cancel", None))


# ---------------------------------------------------------------------------
# Main application
# ---------------------------------------------------------------------------

class NativePttOverlayApp:
    # HUD size constants
    HUD_COMPACT_W, HUD_COMPACT_H = 340, 86
    HUD_PREVIEW_W, HUD_PREVIEW_H = 540, 210
    HUD_SENT_W, HUD_SENT_H = 440, 110
    HUD_IDLE_W, HUD_IDLE_H = 340, 76

    def __init__(self, config: AppConfig):
        self._config = config
        self._state_file = self._resolve_state_file()
        self._state = self._load_state()
        self._api = BackendApiClient(config, self._state)

        self._event_queue: queue.Queue[tuple[str, Any]] = queue.Queue()
        self._hotkey_pressed = False
        self._is_recording = False
        self._is_processing_audio = False
        self._is_sending = False
        self._main_hidden = False
        self._record_start = 0.0
        self._audio_stream: sd.InputStream | None = None
        self._audio_chunks: list[np.ndarray] = []
        self._current_audio_rms = 0.0
        self._listener: keyboard.Listener | None = None
        self._hotkey_key: keyboard.Key | None = None
        self._hotkey_char: str | None = None
        self._active_hotkey = "F8"
        self._set_hotkey_binding((self._state.hotkey or config.hotkey), fallback=True)
        self._enter_pressed = False
        self._esc_pressed = False
        self._awaiting_send_confirmation = False
        self._pending_preview_text = ""
        self._transcript_text_cache = ""

        self._drain_timer: threading.Timer | None = None
        self._shutting_down = False
        self._main_window_ready = False
        self._hud_window_ready = False

        # Resolve UI paths
        ui_dir = Path(__file__).parent / "ui"
        main_html = str(ui_dir / "main_window.html")
        hud_html = str(ui_dir / "hud.html")

        # Create windows
        self._main_window = webview.create_window(
            "Secretary Partner",
            main_html,
            js_api=MainWindowApi(self),
            width=config.window_width,
            height=config.window_height,
            min_size=(520, 300),
            frameless=True,
            easy_drag=False,
            on_top=True,
        )

        self._hud_window = webview.create_window(
            "HUD",
            hud_html,
            js_api=HudApi(self),
            width=self.HUD_COMPACT_W,
            height=self.HUD_COMPACT_H,
            frameless=True,
            on_top=True,
            hidden=True,
        )

        # Register window events
        self._main_window.events.loaded += self._on_main_loaded
        self._main_window.events.closed += self._on_main_closed
        self._hud_window.events.loaded += self._on_hud_loaded

    def run(self) -> None:
        webview.start(debug=os.getenv("DEBUG", "").lower() in ("1", "true"))

    # -- Window event handlers ──────────────────────────────────

    def _on_main_loaded(self) -> None:
        self._main_window_ready = True
        self._position_main_window()
        self._update_auth_label()
        self._update_hotkey_display()
        self._set_idle_status()
        self._start_keyboard_listener()
        self._start_drain_loop()

    def _on_hud_loaded(self) -> None:
        self._hud_window_ready = True

    def _on_main_closed(self) -> None:
        self._shutdown()

    # -- Window positioning ─────────────────────────────────────

    def _position_main_window(self) -> None:
        try:
            screens = webview.screens
            if screens:
                screen = screens[0]
                sw, sh = screen.width, screen.height
            else:
                sw, sh = 1920, 1080
        except Exception:
            sw, sh = 1920, 1080

        x = max(0, (sw - self._config.window_width) // 2)
        y = max(0, sh - self._config.window_height - self._config.window_margin_bottom)
        self._main_window.move(x, y)

    def _position_hud(self, w: int, h: int) -> None:
        try:
            screens = webview.screens
            if screens:
                screen = screens[0]
                sw, sh = screen.width, screen.height
            else:
                sw, sh = 1920, 1080
        except Exception:
            sw, sh = 1920, 1080

        x = max(0, (sw - w) // 2)
        y = max(0, sh - h - self._config.hud_margin_bottom)
        self._hud_window.resize(w, h)
        self._hud_window.move(x, y)

    # -- JS evaluation helpers ──────────────────────────────────

    def _eval_main(self, js: str) -> None:
        if not self._main_window_ready or self._shutting_down:
            return
        try:
            self._main_window.evaluate_js(js)
        except Exception:
            pass

    def _eval_hud(self, js: str) -> None:
        if not self._hud_window_ready or self._shutting_down:
            return
        try:
            self._hud_window.evaluate_js(js)
        except Exception:
            pass

    # -- Event queue drain loop ─────────────────────────────────

    def _start_drain_loop(self) -> None:
        if self._shutting_down:
            return
        self._drain_queue()
        self._drain_timer = threading.Timer(0.033, self._start_drain_loop)
        self._drain_timer.daemon = True
        self._drain_timer.start()

    def _drain_queue(self) -> None:
        try:
            while True:
                event, payload = self._event_queue.get_nowait()
                if event == "hotkey_down":
                    self._start_recording()
                elif event == "hotkey_up":
                    self._stop_recording_and_process()
                elif event == "transcription":
                    self._apply_transcription(str(payload))
                elif event == "chat_response":
                    self._apply_chat_response(payload)
                elif event == "error":
                    self._set_error(str(payload))
                elif event == "linked":
                    self._apply_link_result(payload)
                elif event == "confirm_send":
                    self._confirm_send_hidden_mode()
                elif event == "cancel_preview":
                    self._cancel_preview_hidden_mode()
                elif event == "show_main":
                    self._show_main_window()
                elif event == "hud_send":
                    self._hud_send_requested(str(payload))
                elif event == "hud_cancel":
                    self._hud_cancel_requested()
                elif event == "audio_rms":
                    self._eval_hud(f"updateAudioLevel({payload})")
        except queue.Empty:
            pass

    # -- Transcript text sync ───────────────────────────────────

    def _get_transcript_text(self) -> str:
        return self._transcript_text_cache

    def _set_transcript_text(self, text: str) -> None:
        self._transcript_text_cache = text
        self._eval_main(f"updateTranscript({_js_str(text)})")

    # -- Status updates (main window) ───────────────────────────

    def _update_status(self, text: str, hint: str = "") -> None:
        self._eval_main(f"updateStatus({_js_str(text)}, {_js_str(hint)})")

    def _update_status_dot(self, state: str) -> None:
        self._eval_main(f"updateStatusDot({_js_str(state)})")

    def _update_auth_label(self) -> None:
        if self._state.user_display_name:
            label = self._state.user_display_name
        elif self._state.user_email:
            label = self._state.user_email
        elif self._state.user_id:
            label = self._state.user_id
        elif self._state.token:
            label = "連携済み"
        else:
            label = "未連携"
        self._eval_main(f"updateAuthLabel({_js_str(f'認証: {label}')})")

    def _update_hotkey_display(self) -> None:
        self._eval_main(
            f"updateHotkeyDisplay({_js_str(self._active_hotkey)}, "
            f"{_js_str(f'現在のホットキー: {self._active_hotkey}')})"
        )

    def _set_send_enabled(self, enabled: bool) -> None:
        self._eval_main(f"setSendEnabled({'true' if enabled else 'false'})")

    def _set_response(self, text: str) -> None:
        self._eval_main(f"updateResponse({_js_str(text)})")

    # -- HUD control ────────────────────────────────────────────

    def _show_hud_recording(self) -> None:
        self._position_hud(self.HUD_COMPACT_W, self.HUD_COMPACT_H)
        self._hud_window.show()
        self._eval_hud("showRecording()")

    def _show_hud_processing(self) -> None:
        self._position_hud(self.HUD_COMPACT_W, self.HUD_COMPACT_H)
        self._hud_window.show()
        self._eval_hud("showProcessing()")

    def _show_hud_preview(self, text: str) -> None:
        self._position_hud(self.HUD_PREVIEW_W, self.HUD_PREVIEW_H)
        self._hud_window.show()
        self._eval_hud(f"showPreview({_js_str(text)}, {_js_str(self._active_hotkey)})")

    def _show_hud_sent(self, response_preview: str) -> None:
        self._position_hud(self.HUD_SENT_W, self.HUD_SENT_H)
        self._hud_window.show()
        self._eval_hud(f"showSent({_js_str(response_preview)})")

    def _show_hud_idle(
        self, status: str, hint: str = "", preview: str = "",
        *, auto_hide_seconds: float | None = None,
    ) -> None:
        if preview:
            w, h = self.HUD_PREVIEW_W, self.HUD_PREVIEW_H
        else:
            w, h = self.HUD_IDLE_W, self.HUD_IDLE_H
        self._position_hud(w, h)
        self._hud_window.show()
        self._eval_hud(f"showIdle({_js_str(status)}, {_js_str(hint)}, {_js_str(preview)})")
        if auto_hide_seconds and auto_hide_seconds > 0:
            t = threading.Timer(auto_hide_seconds, self._auto_hide_hud)
            t.daemon = True
            t.start()

    def _hide_hud(self) -> None:
        try:
            self._hud_window.hide()
        except Exception:
            pass

    def _auto_hide_hud(self) -> None:
        if not self._awaiting_send_confirmation:
            self._hide_hud()

    # -- HUD bridge methods (called from event queue) ───────────

    def _hud_send_requested(self, text: str) -> None:
        if self._is_recording or self._is_processing_audio or self._is_sending:
            return
        if not self._awaiting_send_confirmation:
            return
        # Sync HUD text back to transcript
        if text:
            self._set_transcript_text(text)
        self._start_send_flow()

    def _hud_cancel_requested(self) -> None:
        if self._is_recording or self._is_processing_audio or self._is_sending:
            return
        self._awaiting_send_confirmation = False
        self._pending_preview_text = ""
        self._set_transcript_text("")
        self._show_hud_idle(
            "キャンセルしました",
            "プレビューをクリアしました",
            auto_hide_seconds=1.4,
        )
        self._set_idle_status(hide_hud=False)

    # -- Hotkey management ──────────────────────────────────────

    def _normalize_hotkey_input(self, raw: str) -> str | None:
        value = (raw or "").strip()
        if not value:
            return None
        upper = value.upper()
        if upper.startswith("F") and upper[1:].isdigit():
            number = int(upper[1:])
            if 1 <= number <= 12:
                return upper
            return None
        if len(value) == 1 and value.isalnum():
            return value.upper()
        return None

    def _parse_hotkey(self, raw: str) -> tuple[keyboard.Key | None, str | None]:
        normalized = self._normalize_hotkey_input(raw) or "F8"
        if normalized.startswith("F"):
            key_name = normalized.lower()
            maybe_key = getattr(keyboard.Key, key_name, None)
            if isinstance(maybe_key, keyboard.Key):
                return maybe_key, None
            return keyboard.Key.f8, None
        return None, normalized.lower()

    def _set_hotkey_binding(self, raw: str, *, fallback: bool = False) -> bool:
        normalized = self._normalize_hotkey_input(raw)
        if not normalized:
            if not fallback:
                return False
            normalized = "F8"
        hotkey_key, hotkey_char = self._parse_hotkey(normalized)
        self._hotkey_key = hotkey_key
        self._hotkey_char = hotkey_char
        self._active_hotkey = normalized
        return True

    def _apply_hotkey_from_ui(self, key: str) -> None:
        if self._is_recording or self._is_processing_audio or self._is_sending:
            self._update_status("ホットキー変更不可", "録音・処理・送信中はホットキーを変更できません。")
            self._show_hud_idle(
                "ホットキー変更不可", "録音・送信中は変更できません",
                auto_hide_seconds=2.2,
            )
            return
        if not self._set_hotkey_binding(key, fallback=False):
            self._update_status("ホットキー設定エラー", "F1〜F12 または英数字1文字を指定してください。")
            self._show_hud_idle(
                "ホットキー設定エラー", "F1〜F12 または英数字1文字を指定してください",
                auto_hide_seconds=2.8,
            )
            return
        self._state.hotkey = self._active_hotkey
        self._save_state()
        self._update_status("ホットキーを更新しました", f"新しいホットキー: {self._active_hotkey}")
        self._update_hotkey_display()
        self._show_hud_idle(
            "ホットキーを更新しました",
            f"{self._active_hotkey} に変更しました",
            auto_hide_seconds=2.0,
        )
        self._set_idle_status(hide_hud=False)

    def _set_idle_status(self, *, hide_hud: bool = True) -> None:
        hotkey_label = self._active_hotkey
        self._update_status("待機中", f"{hotkey_label} 長押しで録音、離して文字起こし、Enterで送信します。")
        self._update_status_dot("idle")
        if hide_hud and not self._awaiting_send_confirmation:
            if self._main_hidden:
                self._show_hud_idle(
                    "待機中", f"{hotkey_label} 長押しで録音",
                    auto_hide_seconds=1.2,
                )
            else:
                self._hide_hud()

    # -- Keyboard listener ──────────────────────────────────────

    def _is_hotkey(self, key: keyboard.Key | keyboard.KeyCode) -> bool:
        if self._hotkey_key is not None:
            return key == self._hotkey_key
        if self._hotkey_char is not None and isinstance(key, keyboard.KeyCode):
            char = (key.char or "").lower()
            return char == self._hotkey_char
        return False

    def _start_keyboard_listener(self) -> None:
        self._listener = keyboard.Listener(
            on_press=self._on_key_press, on_release=self._on_key_release,
        )
        self._listener.daemon = True
        self._listener.start()

    def _on_key_press(self, key: keyboard.Key | keyboard.KeyCode) -> None:
        if not self._is_hotkey(key):
            if key == keyboard.Key.enter and self._main_hidden and not self._enter_pressed:
                self._enter_pressed = True
                self._event_queue.put(("confirm_send", None))
            elif key == keyboard.Key.esc and self._main_hidden and not self._esc_pressed:
                self._esc_pressed = True
                self._event_queue.put(("cancel_preview", None))
            return
        if self._hotkey_pressed:
            return
        self._hotkey_pressed = True
        self._event_queue.put(("hotkey_down", None))

    def _on_key_release(self, key: keyboard.Key | keyboard.KeyCode) -> None:
        if not self._is_hotkey(key):
            if key == keyboard.Key.enter:
                self._enter_pressed = False
            elif key == keyboard.Key.esc:
                self._esc_pressed = False
            return
        if not self._hotkey_pressed:
            return
        self._hotkey_pressed = False
        self._event_queue.put(("hotkey_up", None))

    # -- Recording logic ────────────────────────────────────────

    def _start_recording(self) -> None:
        if not self._api.has_token:
            self._update_status("未連携", "Webの連携ページでコードを発行して貼り付けてください。")
            self._update_status_dot("error")
            self._show_hud_idle(
                "未連携",
                "設定画面のネイティブ連携でコードを発行してください",
                auto_hide_seconds=2.4,
            )
            return
        if self._is_recording or self._is_processing_audio or self._is_sending:
            return
        # Sync editable HUD text before starting a new recording
        if self._awaiting_send_confirmation:
            self._sync_hud_to_transcript()
        self._audio_chunks = []
        self._current_audio_rms = 0.0
        self._record_start = time.monotonic()
        self._update_status("聞き取り中...", "ホットキーを押し続けたまま話してください。")
        self._update_status_dot("recording")
        self._show_hud_recording()
        try:
            self._audio_stream = sd.InputStream(
                samplerate=self._config.sample_rate,
                channels=self._config.channels,
                dtype="int16",
                callback=self._audio_callback,
            )
            self._audio_stream.start()
            self._is_recording = True
        except Exception as exc:
            self._is_recording = False
            self._audio_stream = None
            self._set_error(f"マイクの起動に失敗しました: {exc}")

    def _audio_callback(
        self, indata: np.ndarray, frames: int, _time: Any,
        status_flags: sd.CallbackFlags,
    ) -> None:
        if status_flags or frames <= 0:
            return
        self._audio_chunks.append(indata.copy())
        rms = float(np.sqrt(np.mean(indata.astype(np.float32) ** 2)))
        self._current_audio_rms = min(1.0, rms / 3000.0)
        self._event_queue.put(("audio_rms", self._current_audio_rms))

    def _stop_recording_and_process(self) -> None:
        if not self._is_recording:
            return

        stream = self._audio_stream
        self._audio_stream = None
        self._is_recording = False
        if stream is not None:
            try:
                stream.stop()
                stream.close()
            except Exception:
                pass

        duration = time.monotonic() - self._record_start
        if duration < self._config.min_record_seconds or not self._audio_chunks:
            # If we were doing additional recording from preview, restore preview
            if self._awaiting_send_confirmation:
                full_text = self._transcript_text_cache.strip()
                if full_text:
                    self._show_hud_preview(full_text)
                    self._update_status_dot("idle")
                    return
            self._show_hud_idle(
                "音声を検出できません",
                "少し長めに押して話してみてください",
                auto_hide_seconds=1.8,
            )
            self._set_idle_status(hide_hud=False)
            return

        try:
            audio_data = np.concatenate(self._audio_chunks, axis=0)
        except ValueError:
            if self._awaiting_send_confirmation:
                full_text = self._transcript_text_cache.strip()
                if full_text:
                    self._show_hud_preview(full_text)
                    return
            self._set_idle_status()
            return
        self._audio_chunks = []

        self._is_processing_audio = True
        self._update_status("変換中...", "音声を文字起こししています...")
        self._update_status_dot("processing")
        self._show_hud_processing()
        worker = threading.Thread(target=self._transcribe_worker, args=(audio_data,), daemon=True)
        worker.start()

    def _transcribe_worker(self, audio_data: np.ndarray) -> None:
        try:
            wav_bytes = self._encode_wav(audio_data)
            transcription = self._api.transcribe_audio(wav_bytes)
            self._event_queue.put(("transcription", transcription))
        except Exception as exc:
            self._event_queue.put(("error", f"音声文字起こしに失敗しました: {exc}"))

    def _encode_wav(self, audio_data: np.ndarray) -> bytes:
        if audio_data.ndim == 1:
            payload = audio_data[:, np.newaxis]
        else:
            payload = audio_data
        with io.BytesIO() as buffer:
            with wave.open(buffer, "wb") as wav:
                wav.setnchannels(self._config.channels)
                wav.setsampwidth(2)
                wav.setframerate(self._config.sample_rate)
                wav.writeframes(payload.astype(np.int16).tobytes())
            return buffer.getvalue()

    # -- Transcription & send ───────────────────────────────────

    def _apply_transcription(self, text: str) -> None:
        self._is_processing_audio = False
        cleaned = text.strip()
        if not cleaned:
            if self._awaiting_send_confirmation:
                full_text = self._transcript_text_cache.strip()
                if full_text:
                    self._show_hud_preview(full_text)
                    return
            self._show_hud_idle(
                "音声を検出できません",
                "入力するテキストがありません",
                auto_hide_seconds=1.8,
            )
            self._set_idle_status(hide_hud=False)
            return

        current = self._transcript_text_cache.strip()
        next_text = f"{current}\n{cleaned}".strip() if current else cleaned
        self._set_transcript_text(next_text)
        self._eval_main("focusTranscript()")
        self._awaiting_send_confirmation = True
        self._pending_preview_text = next_text
        hotkey = self._active_hotkey
        self._update_status("プレビュー準備完了", f"編集してEnterで送信。{hotkey} で追加録音できます。")
        self._update_status_dot("idle")
        self._show_hud_preview(next_text)

    def _sync_hud_to_transcript(self) -> None:
        """Get text from HUD and sync to transcript cache."""
        try:
            result = self._hud_window.evaluate_js("getPreviewText()")
            if result and isinstance(result, str) and result.strip():
                self._set_transcript_text(result.strip())
        except Exception:
            pass

    def _confirm_send_hidden_mode(self) -> None:
        if not self._main_hidden:
            return
        if not self._awaiting_send_confirmation:
            return
        if self._is_recording or self._is_processing_audio or self._is_sending:
            return
        self._sync_hud_to_transcript()
        self._start_send_flow()

    def _cancel_preview_hidden_mode(self) -> None:
        if not self._main_hidden:
            return
        if not self._awaiting_send_confirmation:
            return
        if self._is_recording or self._is_sending or self._is_processing_audio:
            return
        self._hud_cancel_requested()

    def _start_send_flow(self) -> None:
        if self._is_sending or self._is_processing_audio:
            return
        if not self._api.has_token:
            self._update_status("未連携", "Webの連携ページでコードを発行して貼り付けてください。")
            self._update_status_dot("error")
            self._show_hud_idle("未連携", "先に連携を完了してください", auto_hide_seconds=2.4)
            return
        text = self._transcript_text_cache.strip()
        if not text:
            return

        self._is_sending = True
        self._awaiting_send_confirmation = False
        self._pending_preview_text = ""
        self._set_send_enabled(False)
        self._update_status("送信中...", "メッセージを送信しています...")
        self._update_status_dot("sending")
        preview = _truncate_text(text, self._config.hud_preview_max_chars)
        self._show_hud_idle("送信中...", hint="アシスタントに送信しています", preview=preview)
        worker = threading.Thread(target=self._send_worker, args=(text,), daemon=True)
        worker.start()

    def _send_worker(self, text: str) -> None:
        try:
            response = self._api.send_chat(text)
            self._event_queue.put(("chat_response", response))
        except Exception as exc:
            self._event_queue.put(("error", f"チャット送信に失敗しました: {exc}"))

    def _apply_chat_response(self, payload: Any) -> None:
        self._is_sending = False
        self._set_send_enabled(True)
        self._awaiting_send_confirmation = False
        self._pending_preview_text = ""

        if not isinstance(payload, dict):
            self._set_error("チャット応答の形式が不正です。")
            return

        session_id = payload.get("session_id")
        if isinstance(session_id, str) and session_id.strip():
            self._state.session_id = session_id.strip()
            self._save_state()

        assistant_message = str(payload.get("assistant_message", "")).strip()
        self._set_response(assistant_message or "空の応答")
        self._set_transcript_text("")
        self._show_hud_sent(assistant_message or "空の応答")
        # Auto-hide after delay
        delay = 5.0 if self._main_hidden else 3.6
        t = threading.Timer(delay, self._auto_hide_hud)
        t.daemon = True
        t.start()
        self._set_idle_status(hide_hud=False)

    # -- Link flow ──────────────────────────────────────────────

    def _start_link_flow(self, code: str) -> None:
        if self._is_sending or self._is_processing_audio:
            return
        code = (code or "").strip()
        if not code:
            self._update_status("連携コードが必要です。", "Web側でワンタイムコードを発行して貼り付けてください。")
            return
        self._update_status("連携中...", "コードをトークンに交換しています...")
        worker = threading.Thread(target=self._link_worker, args=(code,), daemon=True)
        worker.start()

    def _link_worker(self, code: str) -> None:
        try:
            data = self._api.exchange_native_link_code(code)
            self._event_queue.put(("linked", data))
        except Exception as exc:
            self._event_queue.put(("error", f"連携に失敗しました: {exc}"))

    def _apply_link_result(self, payload: Any) -> None:
        if not isinstance(payload, dict):
            self._set_error("連携レスポンスの形式が不正です。")
            return

        access_token = payload.get("access_token")
        user = payload.get("user")
        if not isinstance(access_token, str) or not access_token.strip():
            self._set_error("連携レスポンスに access_token が含まれていません")
            return

        self._state.token = access_token.strip()
        self._state.session_id = None
        if isinstance(user, dict):
            self._state.user_id = str(user.get("id") or "") or None
            email = user.get("email")
            display_name = user.get("display_name")
            self._state.user_email = str(email) if isinstance(email, str) and email else None
            self._state.user_display_name = (
                str(display_name) if isinstance(display_name, str) and display_name else None
            )

        self._save_state()
        self._eval_main("clearLinkCode()")
        self._update_auth_label()
        self._update_status("連携完了", "準備完了です。ホットキー長押しで音声入力できます。")
        self._show_hud_idle(
            "連携完了", "ホットキー長押しで音声入力できます",
            auto_hide_seconds=2.0,
        )

    # -- UI helpers ─────────────────────────────────────────────

    def _clear_transcript(self) -> None:
        if self._is_sending:
            return
        self._awaiting_send_confirmation = False
        self._pending_preview_text = ""
        self._set_transcript_text("")
        self._set_idle_status()

    def _set_error(self, message: str) -> None:
        self._is_processing_audio = False
        self._is_sending = False
        self._awaiting_send_confirmation = False
        self._set_send_enabled(True)
        self._update_status("エラー", message)
        self._update_status_dot("error")
        self._show_hud_idle(
            "エラー",
            _truncate_text(message, self._config.hud_preview_max_chars),
            auto_hide_seconds=4.2,
        )

    def _hide_main_window(self) -> None:
        if self._main_hidden:
            return
        self._main_hidden = True
        try:
            self._main_window.hide()
        except Exception:
            pass
        if not self._awaiting_send_confirmation:
            self._show_hud_idle(
                "バックグラウンド実行中",
                f"{self._active_hotkey} 長押しで音声入力",
                auto_hide_seconds=2.0,
            )

    def _show_main_window(self) -> None:
        if not self._main_hidden:
            return
        # Sync editable HUD text before showing main window
        if self._awaiting_send_confirmation:
            self._sync_hud_to_transcript()
        self._main_hidden = False
        try:
            self._main_window.show()
        except Exception:
            pass
        if self._awaiting_send_confirmation:
            full_text = self._transcript_text_cache.strip()
            self._show_hud_preview(full_text)
            # Auto-hide HUD after a delay since main is visible
            t = threading.Timer(4.2, self._auto_hide_hud)
            t.daemon = True
            t.start()
        else:
            self._hide_hud()

    # -- Persistence ────────────────────────────────────────────

    def _resolve_state_file(self) -> Path:
        appdata = os.getenv("APPDATA")
        base = Path(appdata) if appdata else (Path.home() / ".secretary_partner_native")
        target_dir = base / "SecretaryPartnerNative"
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir / "state.json"

    def _load_state(self) -> StoredState:
        if not self._state_file.exists():
            return StoredState()
        try:
            raw = json.loads(self._state_file.read_text(encoding="utf-8"))
        except Exception:
            return StoredState()
        if not isinstance(raw, dict):
            return StoredState()
        return StoredState.from_dict(raw)

    def _save_state(self) -> None:
        data = self._state.to_dict()
        self._state_file.write_text(
            json.dumps(data, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )

    # -- Shutdown ───────────────────────────────────────────────

    def _shutdown(self) -> None:
        if self._shutting_down:
            return
        self._shutting_down = True

        if self._drain_timer is not None:
            self._drain_timer.cancel()
            self._drain_timer = None

        if self._listener is not None:
            try:
                self._listener.stop()
            except Exception:
                pass
            self._listener = None

        if self._audio_stream is not None:
            try:
                self._audio_stream.stop()
                self._audio_stream.close()
            except Exception:
                pass
            self._audio_stream = None

        try:
            self._hud_window.destroy()
        except Exception:
            pass
        try:
            self._main_window.destroy()
        except Exception:
            pass


def main() -> None:
    load_dotenv()
    config = AppConfig.from_env()
    app = NativePttOverlayApp(config)
    app.run()


if __name__ == "__main__":
    main()
