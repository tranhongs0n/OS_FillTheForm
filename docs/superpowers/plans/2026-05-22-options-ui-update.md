# Options UI Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a table to the options page for managing pattern-based prompt overrides.

**Architecture:** Extend the existing options page (`options.html`) and script (`options.js`) to persist prompt overrides in `chrome.storage.local`.

**Tech Stack:** Chrome Extensions API, Vanilla JS, HTML, CSS.

---

### Task 1: Update Options UI

**Files:**
- Modify: `D:\Projects\autoCreateSampleDataOutSystems\options.html`

- [ ] **Step 1: Add prompt override section to options.html**

```html
<h3>Prompt Overrides</h3>
<table id="overrideTable">
  <thead>
    <tr><th>Pattern</th><th>Instruction</th><th>Action</th></tr>
  </thead>
  <tbody></tbody>
</table>
<button id="addOverride">Add Row</button>
```

### Task 2: Implement Options Logic

**Files:**
- Modify: `D:\Projects\autoCreateSampleDataOutSystems\options.js`

- [ ] **Step 1: Load overrides on init**

```javascript
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['promptOverrides'], (result) => {
    const overrides = result.promptOverrides || [];
    const tbody = document.querySelector('#overrideTable tbody');
    overrides.forEach(addRow);
  });
});
```

- [ ] **Step 2: Add Row logic**

```javascript
function addRow(data = { pattern: '', instruction: '' }) {
  const tbody = document.querySelector('#overrideTable tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" value="${data.pattern}"></td>
    <td><input type="text" value="${data.instruction}"></td>
    <td><button class="removeRow">Remove</button></td>
  `;
  tbody.appendChild(tr);
}

document.getElementById('addOverride').addEventListener('click', () => addRow());
```

- [ ] **Step 3: Save logic**

```javascript
function saveOptions() {
  const overrides = [];
  document.querySelectorAll('#overrideTable tbody tr').forEach(tr => {
    overrides.push({
      pattern: tr.cells[0].querySelector('input').value,
      instruction: tr.cells[1].querySelector('input').value
    });
  });
  chrome.storage.local.set({ promptOverrides: overrides });
}
```

### Task 3: Commit Changes

- [ ] **Step 1: Stage and Commit**

Run: `git add options.html options.js`
Run: `git commit -m "feat: UI for managing prompt overrides"`
