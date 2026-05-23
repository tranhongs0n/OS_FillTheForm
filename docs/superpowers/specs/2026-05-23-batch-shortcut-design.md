# Batch Data Shortcut Design

Add a keyboard shortcut to trigger filling from batch data records.

## Architecture
- Extension manifest commands system.

## Components
- `manifest.json`: Add `trigger_batch_fill` command.

## User Experience
- User presses `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac).
- Chrome emits command event.
- Background worker listens for command (implementation in later tasks).

## Testing
- Manifest syntax validation.
- Visual check of Chrome extensions page for registered shortcut.
