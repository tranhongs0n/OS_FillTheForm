# Batch Data Generation and Management Design

## Goal
Improve data variance by generating a batch of records in a single LLM request. Allow users to save these records and fill forms sequentially using a "Next Unused" shortcut or manual selection.

## Architecture

### 1. Batch Generation
- **Trigger:** User clicks a batch size button (5, 10, 20) in the extension popup.
- **Context:** Extension scans the current active tab's form to extract fields (labels, types, IDs).
- **LLM Request:** Sends a single prompt to Gemini asking for a JSON array of N distinct records.
- **Variance Control:** 
    - `temperature`: 0.9
    - `presence_penalty`: 0.7
    - `frequency_penalty`: 0.7
    - Strict System Prompt constraints for Vietnamese names, roles, and tasks.

### 2. Storage
- **Key:** `chrome.storage.local.batchData`
- **Structure:**
  ```json
  {
    "timestamp": 123456789,
    "records": [
      { "id": 1, "data": { "Name": "A", ... }, "used": false },
      { "id": 2, "data": { "Name": "B", ... }, "used": false }
    ]
  }
  ```

### 3. Usage
- **Popup UI:** Displays a list of records. Click a record to apply it. "Used" records are styled differently.
- **Keyboard Shortcut:** `Ctrl+Shift+B` (customizable) triggers "Fill Next Unused".
    - Finds the first record where `used === false`.
    - Sends `apply_data` to content script.
    - Updates storage to set `used: true`.
- **Reset:** Button in popup to clear the current batch.

### 4. Prompt Template
```text
Context: Generate mock data for a Vietnamese organizational chart.
Format: JSON array of [N] objects containing keys: {STT, Ho_ten, Chuc_vu, Chuc_danh, Nhiem_vu}.

STRICT CONSTRAINTS:
- ZERO REPETITION: Absolutely no duplicate names, titles, or task descriptions across the array.
- NAMES (Ho_ten): Force extreme diversity in Vietnamese names. Mix genders, rare surnames, and varied name lengths.
- ROLES (Chuc_vu / Chuc_danh): Distribute across entirely different departments (Finance, Tech, HR, Ops).
- TASKS (Nhiem_vu): Each task must cover a completely distinct domain. Do not reuse verbs or subjects.
```

## UI Changes
- **Popup:**
    - New "Batch Generation" section with buttons: [5] [10] [20].
    - List of generated records with "Apply" button and "Used" status.
    - "Clear Batch" button.

## Technical Tasks
1. Update `manifest.json` with `trigger_batch_fill` command.
2. Update `background.js`:
    - Implement `performBatchGeneration` with high-variance parameters.
    - Handle `trigger_batch_fill` command.
    - Update prompt logic for arrays.
3. Update `popup.js` / `popup.html`:
    - Add batch UI elements.
    - Manage display and storage of batch records.
4. Update `content.js`:
    - (No major changes needed, `apply_data` already handles JSON objects).
