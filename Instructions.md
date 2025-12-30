# Project Management Tool - Instructions

This document contains important instructions and notes for the project.

## Critical Error Fix - January 2025

### Error Encountered
```
Error [TransformError]: Transform failed with 1 error:
/home/runner/workspace/server/routes.ts:5353:43: ERROR: Expected ";" but found "{"
```

### Root Cause Analysis

**Location**: `server/routes.ts` line 5353

**Problem**: Capitalization typo in conditional statement
- Used: `If (user.role === 'product_owner')`
- Should be: `if (user.role === 'product_owner')`

**Impact**: 
- Server cannot start due to syntax error
- TypeScript/JavaScript interprets `If` as an undefined variable
- Parser expects semicolon after variable name, but finds opening brace instead

### Related Code Context

The error occurs in the `/api/memos/my-memos` endpoint when building department memo conditions:

```typescript
// Line ~5350-5360 in server/routes.ts
let deptConditions = [sql`${memos.recipients} @> ${JSON.stringify(["all_staff"])}`];

if (user.specialization) {
  deptConditions.push(sql`${memos.recipients} @> ${JSON.stringify([user.specialization])}`);
}

If (user.role === 'project_manager') {  // ❌ ERROR: Capital 'I'
  deptConditions.push(sql`${memos.recipients} @> ${JSON.stringify(["project_managers"])}`);
}

if (user.role === 'product_owner') {
  deptConditions.push(sql`${memos.recipients} @> ${JSON.stringify(["product_owners"])}`);
}
```

### Fix Required

Change line 5353 from:
```typescript
If (user.role === 'project_manager') {
```

To:
```typescript
if (user.role === 'project_manager') {
```

### Prevention Strategy

1. **Code Review**: Always review conditional statements for proper lowercase syntax
2. **Linting**: Ensure ESLint/TypeScript checks are enabled
3. **Testing**: Test server startup after any route modifications
4. **Auto-formatting**: Consider using Prettier to catch syntax issues automatically

### Verification Steps After Fix

1. Save the corrected file
2. Run `npm run dev` to start the server
3. Verify server starts without errors
4. Test the `/api/memos/my-memos` endpoint
5. Confirm memo filtering works for different user roles

### Files Modified
- `server/routes.ts` (line 5353)