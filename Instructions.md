# Project Management Tool - Instructions

## Database Migration Approach

**IMPORTANT**: Never use `npm run db:push` or `npx drizzle-kit push` in this project.

Instead, follow these approaches:
1. **For schema changes**: Create manual SQL migration files in the `migrations/` directory
2. **Apply migrations**: The application automatically runs migrations on startup via `server/index.ts`
3. **For production**: Manually apply SQL files to the production database
4. **Verification**: Check migration status in the `__drizzle_migrations` table

## Current Issue: General Channel JSX Syntax Error (RESOLVED)

### Problem
The application fails to start with a JSX syntax error in `client/src/pages/dashboard/general-channel.tsx` at line 855: "Unterminated JSX contents"

### Root Cause
- **Missing closing div**: There was a missing closing `</div>` tag in the header section
- **JSX structure mismatch**: The header container had proper opening tags but was missing the final closing div before the Card component
- **Location**: Around line 855, between the header section and the main Card component

### Fix Applied
Added the missing closing `</div>` tag after the header section and before the Card component to properly close the header container structure.

## Previous Issue: Team Chat Syntax Error (RESOLVED)

### Problem
The application fails to start with a syntax error in `client/src/pages/dashboard/team-chat.tsx` at line 1171.

### Root Cause
- **Duplicate message wrapper divs**: There were two opening `<div>` tags for the same message container at lines 1046-1047
- **Invalid JSX structure**: The duplicate div caused the subsequent comment `{/* Forward Message Dialog */}` to appear in an invalid position
- **Code merge issue**: This appears to have been caused by an incomplete merge or edit where code was duplicated instead of replaced

### Files Affected
1. `client/src/pages/dashboard/team-chat.tsx` - Contains duplicate message wrapper divs

### Fix Applied

#### Step 1: Remove Duplicate Message Wrapper
- **Location**: Around line 1046-1047
- **Issue**: Two identical opening divs:
  ```tsx
  <div key={msg.id} id={`message-${msg.id}`} className="flex gap-3 group transition-all duration-300">
  <div key={msg.id} id={`message-${msg.id}`} className="flex gap-3 group transition-all duration-300">
  ```
- **Solution**: Removed the duplicate div, keeping only one

#### Step 2: Verify JSX Structure
- Ensured proper nesting of JSX elements
- Verified that all opening tags have matching closing tags
- Confirmed that comments are in valid positions

### Verified Features in Team Chat
The following features should now work correctly:
- **Search**: Message search functionality with search input in header
- **Read Receipts**: Double-check marks showing message view count
- **Date Separators**: Date headers between messages from different days
- **Message Actions**: Reply, Forward, Edit, Delete, Copy, Pin
- **Mentions**: @user mentions with autocomplete suggestions
- **@all/@everyone**: Tag all team members at once
- **Pinned Messages**: Pin important messages to top of chat

### General Channel & Direct Messages
Similar features have been implemented in:
- `client/src/pages/dashboard/general-channel.tsx` - Pin messages, tag all, search, read receipts
- `client/src/components/chat/direct-messages.tsx` - Last seen, online status, search, read receipts

### Next Steps
1. Test the application startup
2. Verify all chat features work as expected
3. Test message sending, editing, and deletion
4. Verify mention functionality (@user and @all)
5. Test search functionality across all chat types

## Troubleshooting Common Issues

### 1. Database Schema Issues
- **Never use**: `npm run db:push` or `npx drizzle-kit push`
- **Instead**: Create manual SQL migration files and let the app apply them on startup
- **Check**: The `__drizzle_migrations` table to see which migrations have been applied

### 2. JSX Syntax Errors
- **Common causes**: Missing closing tags, duplicate opening tags, mismatched nesting
- **How to fix**: Carefully trace the opening and closing tags, ensure proper JSX structure
- **Tools**: Use IDE's JSX validation or check console for specific line numbers

### 3. WebSocket Connection Issues
- **Symptoms**: "User not authenticated (401)" messages
- **Cause**: Session not established before WebSocket connection
- **Solution**: The WebSocket waits for auth message after connection (already implemented)

### 4. Database Migration Errors
- **"column already exists" errors**: Normal when migrations have already been applied
- **Missing tables**: Check if migration file exists in `migrations/` directory
- **Failed migrations**: Review the SQL syntax and ensure compatibility with PostgreSQL

### 5. Application Not Starting
- **Check**: Console output for specific error messages
- **Common issues**: 
  - JSX syntax errors (check file paths in error message)
  - Database connection failures
  - Port already in use
  - Missing environment variables