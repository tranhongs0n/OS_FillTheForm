# Batch Data Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve LLM response parsing and expand form field support to include checkboxes and radio buttons.

**Architecture:**
- Introduce `extractJson` in `background.js` to strip markdown and isolate JSON structures.
- Relax `isInternalInput` in `content.js` to allow `checkbox` and `radio` types.

**Tech Stack:** JavaScript (Chrome Extension API), Regex.

---

### Task 1: Robust JSON Extraction in `background.js`

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Define `extractJson` helper function**

Add this function at the top level of `background.js` (e.g., after `getPromptForUrl`):

```javascript
function extractJson(text, isArray = false) {
  // Strip markdown code blocks
  let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
  
  const startChar = isArray ? '[' : '{';
  const endChar = isArray ? ']' : '}';
  const firstIndex = cleaned.indexOf(startChar);
  const lastIndex = cleaned.lastIndexOf(endChar);
  
  if (firstIndex !== -1 && lastIndex !== -1) {
    return cleaned.substring(firstIndex, lastIndex + 1);
  }
  return cleaned;
}
```

- [ ] **Step 2: Update `performAutofill` to use `extractJson`**

Replace the existing regex-based extraction logic.

Old:
```javascript
      const text = data.candidates[0].content.parts[0].text;
      const jsonMatch = batchCount > 1 ? text.match(/\[[\s\S]*\]/) : text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
```

New:
```javascript
      const text = data.candidates[0].content.parts[0].text;
      const jsonStr = extractJson(text, batchCount > 1);
```

### Task 2: Enable Checkbox and Radio in `content.js`

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Update `isInternalInput` filter**

Locate `isInternalInput` inside the `scan_form` message listener and remove the checkbox/radio filters.

Old:
```javascript
      const isInternalInput = el => {
        return el.type === 'file' || 
               el.type === 'checkbox' ||
               el.type === 'radio' ||
               el.classList.contains('vscomp-search-input') || 
               el.classList.contains('vscomp-hidden-input') ||
               (el.classList.contains('input') && el.closest('.osui-datepicker')) ||
               el.classList.contains('flatpickr-mobile');
      };
```

New:
```javascript
      const isInternalInput = el => {
        return el.type === 'file' || 
               el.classList.contains('vscomp-search-input') || 
               el.classList.contains('vscomp-hidden-input') ||
               (el.classList.contains('input') && el.closest('.osui-datepicker')) ||
               el.classList.contains('flatpickr-mobile');
      };
```

### Task 3: Verification

**Files:**
- Modify: `test/test_batch_logic.js`

- [ ] **Step 1: Add unit tests for `extractJson`**

Since `background.js` functions aren't easily exportable for Node tests without refactoring, we'll manually verify by simulating the logic in the test file or creating a small test runner if needed. For this polish, we'll add a test case to `test_batch_logic.js` that verifies the logic we implemented.

- [ ] **Step 2: Manual verification with `test-form.html`**

1. Open `test-form.html` in Chrome.
2. Trigger the extension.
3. Verify that Checkboxes and Radio buttons are now listed in the "Context form" sent to LLM (check console logs if needed).
4. Verify they are filled correctly based on LLM output.

- [ ] **Step 3: Commit all changes**
