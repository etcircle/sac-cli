# GPT Pro external review brief — SAC same-session automation

## Why GPT Pro is being used
The live product proof is done, but the remaining blocker is a nasty one: practical same-session browser control on macOS versus SAC editor/version semantics. This is worth an external heavy-thinking pass.

## Read these local docs first
1. `docs/handoffs/2026-04-17-sac-member-selector-dialog-handover.md`
2. `docs/handoffs/2026-04-17-table-widget-functionality-map.md`
3. `docs/handoffs/2026-04-17-roscoe-same-session-sac-automation-brief.md`
4. `tmp/live-proof-existing-session/RESULTS.md`

## Bundle paths
- handoff root: `/Users/felixcardix/.hermes/handoffs/chatgpt-pro/2026-04-17_201243-sac-cli-same-session-automation-gpt-pro`
- upload zip: `/Users/felixcardix/.hermes/handoffs/chatgpt-pro/2026-04-17_201243-sac-cli-same-session-automation-gpt-pro/bundle.zip`
- prompt: `/Users/felixcardix/.hermes/handoffs/chatgpt-pro/2026-04-17_201243-sac-cli-same-session-automation-gpt-pro/package/PROMPT.md`

## Concrete questions for GPT Pro
1. What is most likely blocking local same-session browser automation on macOS?
2. What is the most practical attach/control strategy that preserves the authenticated product session?
3. Is `contentlib.updateContent` worth pursuing for this lane?
4. What should `sac-cli` implement next?
5. What exact verification commands/checks should we run next?
