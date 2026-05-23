# Update Manifest with Keyboard Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `trigger_batch_fill` keyboard shortcut to `manifest.json`.

**Architecture:** Chrome Extension Commands API.

**Tech Stack:** JSON / Chrome Manifest V3.

---

### Task 1: Add command to manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add trigger_batch_fill to commands**

```json
    "trigger_batch_fill": {
      "suggested_key": {
        "default": "Ctrl+Shift+B",
        "mac": "Command+Shift+B"
      },
      "description": "Fill Next Unused Batch Record"
    }
```

- [ ] **Step 2: Verify JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"`
Expected: No errors.
