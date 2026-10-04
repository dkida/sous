import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CookingComposer from "../app/cooking-composer";
import type { VoiceState } from "./voice-client";

function props(voiceState: VoiceState = "idle") {
  return { language: "en" as const, message: "Can I use onions?", busy: false, voiceState, voiceError: "", transcript: "I have carrots.",
    onMessage(_value: string) {}, onSend() {}, onRecord() {}, onFinish() {}, onCancel() {} };
}
function find(node: ReactNode, type: string): ReactElement<Record<string, unknown>> {
  if (node && typeof node === "object" && "type" in node) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    if (element.type === type) return element as ReactElement<Record<string, unknown>>;
    for (const child of [element.props.children].flat(Infinity)) {
      try { return find(child, type); } catch { /* search next child */ }
    }
  }
  throw new Error("Element missing");
}
it("the composer exposes one text/voice surface, with a disabled empty send and no permanent transcript panel", () => {
  const idle = renderToStaticMarkup(createElement(CookingComposer, props()));
  assert.match(idle, /aria-label="ASK SOUS"/);
  assert.match(idle, /aria-label="Speak"/);
  assert.match(idle, /aria-label="Send"/);
  assert.match(idle, /Can I use onions\?/);
  assert.doesNotMatch(idle, /I have carrots|Heard:|VOICE \/ READY|Typing is always|Show current step/);
  const empty = CookingComposer({ ...props(), message: "  " });
  const tools = (empty.props.children as ReactElement[])[2]!;
  const send = (tools.props as { children: ReactElement[] }).children.at(-1)!;
  assert.equal((send.props as { disabled: boolean }).disabled, true);
});
it("Enter submits once; Shift+Enter and input-method composition preserve multiline input", () => {
  let submitted = 0; let prevented = 0;
  const component = CookingComposer({ ...props(), onSend() { submitted++; } });
  const handler = find(component, "textarea").props.onKeyDown as (event: unknown) => void;
  const event = { key: "Enter", shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false }, preventDefault() { prevented++; } };
  handler(event);
  assert.equal(submitted, 1); assert.equal(prevented, 1);
  handler({ ...event, shiftKey: true });
  handler({ ...event, nativeEvent: { isComposing: true } });
  handler({ ...event, keyCode: 229 });
  assert.equal(submitted, 1); assert.equal(prevented, 1);
  const busyHandler = find(CookingComposer({ ...props(), busy: true, onSend() { submitted++; } }), "textarea").props.onKeyDown as (event: unknown) => void;
  busyHandler(event); assert.equal(submitted, 1);
});
it("voice state lives inside the composer, exposes stop/cancel, and displays speech only while active", () => {
  for (const state of ["listening", "transcribing", "thinking", "speaking"] as const) {
    const rendered = renderToStaticMarkup(createElement(CookingComposer, props(state)));
    assert.match(rendered, new RegExp(state.toUpperCase()));
    assert.match(rendered, /readOnly/);
    assert.match(rendered, /I have carrots\./);
    assert.doesNotMatch(rendered, /Heard:|voice-strip/);
  }
  let finished = 0; let cancelled = 0;
  const listening = CookingComposer({ ...props("listening"), onFinish() { finished++; } });
  (find(listening, "button").props.onClick as () => void)();
  assert.equal(finished, 1);
  const speaking = CookingComposer({ ...props("speaking"), onCancel() { cancelled++; } });
  (find(speaking, "button").props.onClick as () => void)();
  assert.equal(cancelled, 1);
  const polish = renderToStaticMarkup(createElement(CookingComposer, { ...props("listening"), language: "pl" }));
  assert.match(polish, /SŁUCHAM/); assert.match(polish, /Zakończ i wyślij/);
});
it("recoverable voice errors keep the text draft and usable send/microphone controls", () => {
  const rendered = renderToStaticMarkup(createElement(CookingComposer, { ...props("error"), voiceError: "Microphone unavailable." }));
  assert.match(rendered, /role="alert"/);
  assert.match(rendered, /Voice interrupted\. Type or try again\./);
  assert.match(rendered, /Can I use onions\?/);
  assert.doesNotMatch(rendered, /readOnly|disabled|I have carrots/);
});
