# Design Spec: Per-Page Prompt Management

## Overview
Replace hardcoded `DOMAIN_CONTEXT` with a dynamic, URL-pattern based prompt override system to allow page-specific instructions.

## Components

### 1. Storage (`chrome.storage.local`)
- Key: `promptOverrides`
- Schema: `Map<string, string>` (pattern: prompt_text)

### 2. Background (`background.js`)
- `getPromptForUrl(url)`: 
  - Matches current URL against `promptOverrides` patterns.
  - Returns best match or global default.
- Integration: Update `performAutofill` to use `getPromptForUrl` instead of constant `DOMAIN_CONTEXT`.

### 3. Options (`options.html` / `options.js`)
- UI: Pattern/Prompt pair table.
- CRUD: Add/Remove/Update patterns.

## Data Schema
```json
{
  "promptOverrides": [
    { "pattern": "https://qhs.giam-sat.gov.vn/*", "instruction": "..." },
    { "pattern": "*", "instruction": "Global default" }
  ]
}
```

## Plan
1. Spec approved.
2. Implement storage logic.
3. Update background orchestrator.
4. Update options UI.
