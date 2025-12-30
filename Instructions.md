# Project Management Tool - Instructions

## Current Issue: `allUsers is not defined` Error on Dashboard

### Problem Analysis

**Error Location**: `client/src/pages/dashboard/index.tsx`

**Root Causes**:
1. Variable `allUsers` is defined as an alias for `staff` data at line 73
2. The `filteredTasks` variable (around line 145) is being accessed before initialization
3. React hooks and data dependencies are not properly ordered
4. The `staff` query has `enabled: !!user` but returns undefined initially
5. Early return conditions don't account for loading states

### Affected Files

1. **client/src/pages/dashboard/index.tsx**
   - Variable declaration order issues
   - Missing null checks for `staff` data
   - `filteredTasks` referenced before proper initialization
   - Task filtering logic doesn't handle undefined `allUsers`

### Resolution Plan

#### Step 1: Fix Variable Declaration Order
- Move `allUsers` declaration closer to where `staff` is defined
- Add proper null coalescing for `allUsers`
- Ensure `allUsers` defaults to empty array when `staff` is undefined

#### Step 2: Add Proper Loading States
- Check if `staffLoading` is true before rendering
- Add null checks for `staff` data
- Ensure `allUsers` is always defined (even as empty array)

#### Step 3: Fix Task Filtering Logic
- Move `filteredTasks` declaration after all data is loaded
- Add guards to prevent accessing undefined data
- Ensure `searchFilteredTasks` properly handles undefined states

#### Step 4: Code Changes Required

**In client/src/pages/dashboard/index.tsx**:

1. **Line 73** - Change from:
   ```typescript
   const allUsers = staff;
   ```
   To:
   ```typescript
   const allUsers = staff || [];
   ```

2. **Around Line 145** - Fix filteredTasks initialization:
   - Ensure it's declared after `staffTasks` and `userTasks`
   - Add proper null checks
   - Use optional chaining and default values

3. **Around Line 162** - Fix searchFilteredTasks:
   - Add null checks before filtering
   - Ensure array operations don't run on undefined

#### Step 5: Implementation Pattern

```typescript
// Pattern to follow for all data-dependent variables:
const safeData = queryData || [];
const filtered = useMemo(() => {
  if (!safeData) return [];
  return safeData.filter(/* filtering logic */);
}, [safeData, /* other dependencies */]);
```

### Testing Checklist

After implementing fixes:
- [ ] Dashboard loads without errors for staff users
- [ ] Dashboard loads without errors for manager users
- [ ] Dashboard loads without errors for intern users
- [ ] Task filtering works correctly
- [ ] Search functionality works
- [ ] No console errors about undefined variables
- [ ] All cards display correct data

### Prevention Strategy

1. Always initialize query data with default values: `data || []`
2. Use optional chaining for nested property access
3. Declare computed variables in proper dependency order
4. Add loading states before rendering data-dependent UI
5. Use TypeScript strict mode to catch undefined access

### Related Issues

This error is similar to the previous `filteredTasks` initialization issue. Both stem from:
- Improper handling of async data loading
- Missing null checks for query results
- Variable references before initialization

### Next Steps

1. Apply fixes to dashboard/index.tsx
2. Test all user roles (staff, intern, manager, team lead)
3. Verify task search and filtering works
4. Check for similar patterns in other dashboard files
5. Add defensive coding patterns to prevent similar issues