# Design Spec: Batch Management UI

## Overview
Add a new section to the extension popup to trigger batch generation and manage the generated records. This allows users to generate multiple data sets at once and apply them sequentially.

## UI Changes (`popup.html`)
- **Batch Generation Section**: Located below the main "Generate & Fill" button.
- **Controls**:
  - Three buttons for generating 5, 10, or 20 records.
  - A "Clear" button to wipe the current batch.
- **Batch List**: A scrollable area displaying the generated records.
- **Record Display**:
  - Each item shows a summary (first 2-3 fields).
  - An "Apply" button to fill the form with that specific record.
  - Visual feedback for "Used" records (grayed out and strike-through).

## Logic Changes (`popup.js`)
- **Event Listeners**:
  - Handle batch generation requests by sending `batchCount` to the background script.
  - Handle "Clear" action to reset `batchData` in `chrome.storage.local`.
  - Handle "Apply" action to send `apply_data` to the content script and mark the record as used.
- **Rendering**:
  - `renderBatchData()` function to build the list from storage.
  - Automatic updates using `chrome.storage.onChanged` to stay in sync with the background script (especially when using shortcuts).

## Data Flow
1. User clicks "10" in Batch Generation.
2. Popup sends `get_data` message with `batchCount: 10`.
3. Background script fetches data from Gemini and saves to `chrome.storage.local.batchData`.
4. Popup detects storage change and calls `renderBatchData()`.
5. User clicks "Apply" on a record.
6. Popup sends `apply_data` to Content Script and updates the record's `used` status in storage.
