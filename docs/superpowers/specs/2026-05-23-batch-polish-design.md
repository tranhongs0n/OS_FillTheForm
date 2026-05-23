# Batch Data Feature Polish Design

**Date:** 2026-05-23
**Topic:** Batch Data Final Polish

## Overview
Final adjustments to the Batch Data feature to improve robustness and coverage. This includes sanitizing LLM output to handle markdown code blocks and enabling support for checkbox/radio inputs.

## Architecture

### 1. Robust JSON Extraction (`background.js`)
The `performAutofill` function currently uses simple regex to find JSON. We will replace this with a more robust `extractJson` helper that:
- Strips markdown code blocks (```json ... ```).
- Locates the first and last valid JSON boundary characters based on the expected type (Array or Object).
- Falls back gracefully to the original text if no boundaries are found.

### 2. Extended Input Support (`content.js`)
Currently, `checkbox` and `radio` inputs are skipped during the form scan because they were flagged as "internal" inputs.
- Update `isInternalInput` to allow `checkbox` and `radio`.
- The `apply_data` logic already supports these types by converting LLM boolean values to `click()` actions.

## Data Flow
1. `content.js`: Scans page, includes checkboxes/radios in the forms list.
2. `background.js`: Sends form context to LLM.
3. LLM: Returns JSON (potentially wrapped in markdown).
4. `background.js`: Sanitizes the raw text into a valid JSON string.
5. `background.js`: Parses and stores/applies data.

## Verification
- **Unit Test:** `test_batch_logic.js` should be updated to include cases for markdown-wrapped JSON.
- **Manual Test:** Use `test-form.html` to verify checkboxes and radios are filled correctly.
