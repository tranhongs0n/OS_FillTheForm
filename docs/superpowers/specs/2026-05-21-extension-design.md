# Extension Design: LLM Auto-Filler

## Overview
Browser extension to capture form context, generate sample data via LLM, and fill form fields.

## Components
1. **Popup**: Configuration UI (API key), trigger button.
2. **Background**: Handle API communication, orchestrate state.
3. **Content Script**: DOM traversal (labels, inputs, selects), form filling.

## Data Flow
1. User clicks "Auto-fill".
2. Content Script scrapes DOM → Send message to Background.
3. Background sends prompt to LLM (Model API).
4. Background receives JSON response → Send to Content Script.
5. Content Script fills values → Dispatches input events.

## Tech Stack
- Manifest V3
- Vanilla JS (no heavy frameworks needed)
- Fetch API
- Local Storage (settings)

## Security
- API key local storage (encrypted? no, simple `chrome.storage.local`).
- Content Script only interacts with authorized form fields.

## Status
Design draft ready. Ready to convert to implementation plan.
