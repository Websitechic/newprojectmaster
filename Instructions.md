
# Project Management Tool - Instructions

## Current Issue: Application Startup Error

### Problem
The application fails to start with a syntax error in `client/src/components/chat/direct-messages.tsx` at line 1047.

### Root Cause
- Duplicate code blocks in the `direct-messages.tsx` file
- Conflicting implementations of message rendering logic
- Invalid JavaScript syntax due to improper code merge

### Files Affected
1. `client/src/components/chat/direct-messages.tsx` - Contains duplicate/malformed code

### Fix Plan

#### Step 1: Clean up direct-messages.tsx
- Remove duplicate `renderMessageContent` function implementations
- Consolidate message rendering logic into a single, coherent implementation
- Ensure proper handling of:
  - Reply messages with quoted content
  - Forwarded messages
  - Date separators
  - Read receipts (double-check marks)
  - Message editing and deletion
  - URL link rendering

#### Step 2: Verify Message Features
Ensure the following features work correctly:
- **Search**: Message search functionality within conversations
- **Read Receipts**: Double-check marks showing message has been viewed
- **Date Separators**: Show date headers when messages are from different days
- **Last Seen**: Display when user was last active
- **Online Status**: Show online/offline/idle status with indicator

#### Step 3: Test the Fix
1. Start the application with `npm run dev`
2. Verify no syntax errors
3. Test direct messaging features:
   - Send messages
   - Reply to messages
   - Edit messages
   - Delete messages
   - Forward messages
   - Search messages
   - Verify read receipts appear

### Implementation Details

#### Message Rendering Logic (Consolidated)
The message content should be rendered with:
1. Date separators between days
2. Quoted reply context (clickable to jump to original)
3. Forwarded message indicator
4. URL link detection and rendering
5. Edit/delete dropdown menu
6. Read receipt indicators (CheckCheck icon)
7. Timestamp with edit indicator

#### Code Structure
```javascript
// Single renderMessageContent function that handles:
- Reply messages (with clickable quoted content)
- Forwarded messages (with indicator)
- Regular messages (with URL parsing)
- Edit state (textarea with save/cancel)
- Action menu (copy, edit, delete, reply, forward)
- Read receipts (for sent messages)
```

### Next Steps After Fix
1. Monitor console for any runtime errors
2. Test all messaging features end-to-end
3. Verify WebSocket connectivity
4. Check database migrations are applied
5. Ensure email service initializes properly

### Prevention
- Always review file changes before applying
- Test thoroughly after code merges
- Use version control to track changes
- Avoid duplicate function implementations
