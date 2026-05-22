# Design Spec: Context-Aware LLM Auto-Filler

## Overview
Enable context-aware form filling by allowing users to capture "context snapshots" of the current webpage before initiating auto-fill.

## Components

### 1. Content Script (`content.js`)
- `captureContext()`: Scrapes `window.location.href`, `document.title`, and all visible form labels and inputs.
- Returns serialized JSON metadata.

### 2. Popup (`popup.js`)
- **UI**: Add "Capture Context" button.
- **Logic**:
    - Listens for button click.
    - Sends `capture` message to active content script.
    - Stores returned context in `chrome.storage.local`.
    - Updates UI state to "Context Captured".

### 3. Background (`background.js`)
- **Logic**:
    - When auto-fill triggered: Check `chrome.storage.local` for existing context.
    - If found: Prepend context metadata to LLM prompt.
    - Clean up or persist storage per user preference.

## Data Schema
```json
{
  "url": "string",
  "title": "string",
  "fields": [
    { "label": "string", "type": "string", "id": "string", "name": "string" }
  ]
}
```

## Security
- Context storage ephemeral (local session).
- Sensitive fields filtering recommended (optional future iteration).

## Plan
1. Update `content.js` to expose `captureContext` message handler.
2. Update `popup.html`/`popup.js` to implement capture flow.
3. Update `background.js` to inject context into API call.
