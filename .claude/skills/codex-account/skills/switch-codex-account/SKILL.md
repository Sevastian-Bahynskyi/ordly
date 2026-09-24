---
name: switch-codex-account
description: Switch the Codex account in the ChatGPT macOS app, using one designated Chrome profile for authentication. Run only when explicitly invoked.
argument-hint: <baginski.play@gmail.com|support@couplegoai.com>
disable-model-invocation: true
---

# Switch Codex account

Switch only the Codex account in the local ChatGPT macOS app requested in `$ARGUMENTS`. Invocation authorizes controlling ChatGPT's Codex UI, using the designated Chrome profile, selecting the exact approved account, and accepting the minimum routine OAuth continuation. It does not authorize entering credentials or changing account security.

## Approved accounts

| Codex account |
| --- |
| `baginski.play@gmail.com` |
| `support@couplegoai.com` |

If the argument is missing, ambiguous, or not an exact email in the table, stop and ask the user to choose one of the two supported accounts.

## Authentication Chrome profile

Always use the single Chrome profile `baginski.play@gmail.com` for authentication, regardless of the target Codex account. That Chrome profile already has both approved Google accounts saved, so choose the requested account from ChatGPT's account chooser. Do not use or look for a separate Chrome profile for `support@couplegoai.com`.

## Required workflow

1. Load all computer-use tools needed for the app and authentication flow in one bulk tool search. Do not load or call Claude-in-Chrome tools, and do not rely on a browser extension.
2. Before calling computer-use `request_access`, tell the user: "Approve the separate ChatGPT application-access prompt now. Chat approval and approved websites do not satisfy this prompt; it may appear in this session or in Claude Desktop on the Mac. I will be waiting on that prompt until it is approved."
3. Request computer-use access to `ChatGPT` only. The installed app's display name is `ChatGPT` even though its bundle identifier is `com.openai.codex`. Treat an interrupted access request as an app-access interruption, never as an authentication failure.
4. Inspect ChatGPT's Codex UI and read its visible signed-in email. If it already exactly matches the target, make no changes and report that it is active.
5. Use ChatGPT's account menu to start its normal switch-account or sign-out/sign-in flow. Do not edit Codex configuration, authentication files, cookies, or Keychain data.
6. If authentication remains inside the ChatGPT window, use computer use to select only the exact target email and complete routine `Continue`, `Allow`, or equivalent OAuth controls that only authenticate that account to ChatGPT.
7. If ChatGPT opens Chrome, use native computer use to control the Chrome profile `baginski.play@gmail.com`. On ChatGPT's Google account chooser, select only the exact target email, then complete routine `Continue`, `Allow`, or equivalent OAuth controls that only authenticate that account to ChatGPT. Do not switch Chrome profiles or use a browser extension. Stop if the designated profile is unavailable or the exact target email is not offered.
8. Return to ChatGPT and verify that its visible signed-in email exactly matches the target before reporting success.

## Human-action boundaries

- For a push confirmation that can be approved entirely on the user's phone, state the target account, notify the user if push notification is available, wait, and resume after approval.
- For a password, one-time-code entry, passkey interaction, CAPTCHA, account addition/recovery, or account security-setting change, take a fresh screenshot when safe, identify the exact blocking prompt without reproducing sensitive values, and tell the user what must be completed. Resume after the user completes it when possible.
- Stop if the designated Chrome profile or exact target email is unavailable, a required approval is not reachable remotely, or the final ChatGPT email cannot be verified.

Never read, reveal, copy, log, or modify passwords, one-time codes, tokens, cookies, authentication files, or Keychain entries. Do not switch Claude accounts or change the active Vibe Remote worker. Use native computer use for both ChatGPT and the Chrome authentication flow; do not use browser-extension or shell automation.
