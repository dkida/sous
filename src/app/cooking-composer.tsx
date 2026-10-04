"use client";

import type { KeyboardEvent } from "react";
import type { Language } from "../shared/language";
import { copy } from "../web/i18n";
import type { VoiceState } from "../web/voice-client";

interface Props {
  language: Language;
  message: string;
  busy: boolean;
  systemStatus?: string;
  voiceState: VoiceState;
  voiceError: string;
  transcript: string;
  onMessage(value: string): void;
  onSend(): void;
  onRecord(): void;
  onFinish(): void;
  onCancel(): void;
}

/** Presentation only. Text and microphone actions use the screen's existing ports. */
export default function CookingComposer(props: Props) {
  const { language, message, busy, voiceState, voiceError, transcript } = props;
  const t = copy[language];
  const active = voiceState !== "idle" && voiceState !== "error";
  const canSend = Boolean(message.trim()) && !busy && !active;
  const listening = voiceState === "listening";
  const speaking = voiceState === "speaking";
  const status = active ? t[voiceState] : busy ? props.systemStatus ?? t.thinking : voiceError ? t.error : "";
  const recognized = active && Boolean(transcript);
  function keyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Do not submit unfinished input-method composition (including keyCode 229).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      if (canSend) props.onSend();
    }
  }
  return (
    <form className={`composer ${listening ? "is-listening" : ""}`} aria-label={t.composerLabel}
      onSubmit={(event) => { event.preventDefault(); if (canSend) props.onSend(); }}>
      <div className="composer-heading">
        <label className="eyebrow" htmlFor="question">{t.composerLabel}</label>
        <span className="composer-status eyebrow" role="status" aria-live="polite">{status}</span>
      </div>
      <textarea id="question" className="composer-input" rows={2} maxLength={4000}
        placeholder={listening ? t.listeningPlaceholder : t.questionPlaceholder}
        value={recognized ? transcript : message} readOnly={active || busy}
        aria-describedby={voiceError ? "composer-error" : undefined}
        onKeyDown={keyboard} onChange={(event) => props.onMessage(event.target.value)} />
      <div className="composer-tools">
        <button type="button" className={`composer-mic ${listening ? "is-recording" : ""}`}
          aria-label={listening ? t.finishSend : speaking ? t.stopSpeech : t.speak}
          title={listening ? t.finishSend : speaking ? t.stopSpeech : t.speak}
          disabled={!listening && !speaking && (active || busy)}
          onClick={listening ? props.onFinish : speaking ? props.onCancel : props.onRecord}>
          {listening || speaking ? <><span className="stop-mark" aria-hidden="true" />{t.stop}</> :
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3M8 21h8" /></svg>}
        </button>
        {listening && <button type="button" className="composer-cancel" onClick={props.onCancel}>{t.cancel}</button>}
        {voiceError && <p className="composer-error" id="composer-error" role="alert" title={voiceError}>{t.voiceRecovery}<span className="sr-only"> {voiceError}</span></p>}
        <button type="submit" className="composer-send" disabled={!canSend} aria-label={t.send} title={t.send}><span aria-hidden="true">→</span></button>
      </div>
    </form>
  );
}
