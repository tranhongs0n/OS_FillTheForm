# Context Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable context-aware LLM auto-filling by adding a DOM context capture feature to the extension.

**Architecture:** Add messaging between Popup and Content Script to extract page metadata and store it in `chrome.storage.local`. Background script retrieves this storage for LLM prompt generation.

**Tech Stack:** Manifest V3, Chrome Extensions API (storage, messaging), Vanilla JS.

---

### Task 1: Content Script Capture Logic

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Add capture handler**

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "captureContext") {
    const fields = Array.from(document.querySelectorAll('input, textarea')).map(el => {
        const label = document.querySelector(`label[for="${el.id}"]`)?.innerText || el.placeholder || "";
        return { label, type: el.type, id: el.id, name: el.name };
    });
    sendResponse({
      url: window.location.href,
      title: document.title,
      fields
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add content.js
git commit -m "feat: add captureContext listener to content script"
```

### Task 2: Popup UI and Logic

**Files:**
- Modify: `popup.html`
- Modify: `popup.js`

- [ ] **Step 1: Add Capture button to `popup.html`**

```html
<button id="capture-btn">Capture Context</button>
<div id="status"></div>
```

- [ ] **Step 2: Add message dispatch to `popup.js`**

```javascript
document.getElementById('capture-btn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  const response = await chrome.tabs.sendMessage(tab.id, {action: "captureContext"});
  chrome.storage.local.set({contextSnapshot: response}, () => {
      document.getElementById('status').innerText = "Context Captured!";
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add capture button and logic to popup"
```

### Task 3: Background Injection

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Update background to read context**

```javascript
// Inside auto-fill orchestrator
chrome.storage.local.get(['contextSnapshot'], (result) => {
    if (result.contextSnapshot) {
        const context = result.contextSnapshot;
        const prompt = `Context: ${JSON.stringify(context)}\n\nFill this form...`;
        // Proceed with API call
    }
});
```

- [ ] **Step 2: Commit**

```bash
git add background.js
git commit -m "feat: background script injects context into LLM prompt"
```
