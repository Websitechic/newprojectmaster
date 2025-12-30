
# Project Instructions

## Error Fix: "Cannot read properties of undefined (reading 'find')"

### Problem Analysis
The error occurs in `client/src/pages/dashboard/index.tsx` where the code attempts to call `.find()` on arrays that may be undefined during initial component render before data is fetched.

### Root Cause
1. **Location**: Dashboard component (`client/src/pages/dashboard/index.tsx`)
2. **Issue**: Several array operations (`.find()`, `.filter()`) are performed on data from React Query hooks that may be undefined during initial render
3. **Specific Problems**:
   - `staffTasks.find()` is called without checking if `staffTasks` is defined (around line 238)
   - `tasks` array from useQuery can be undefined before data loads
   - `staff` array from useQuery can be undefined before data loads

### Files Affected
- `client/src/pages/dashboard/index.tsx`

### Solution Steps

1. **Add Null/Undefined Checks for staffTasks**
   - Ensure `staffTasks` is always an array (never undefined)
   - Update line ~160 where `staffTasks` is defined to use fallback empty array
   - Use optional chaining or null coalescing for all array operations

2. **Add Null/Undefined Checks for activeTask**
   - Line ~238: `const activeTask = staffTasks.find((task) => task.isTimerRunning);`
   - Should be: `const activeTask = staffTasks?.find((task) => task.isTimerRunning);`

3. **Ensure Consistent Array Initialization**
   - `staffTasks` should always be an array, even if empty
   - Use `|| []` fallback after all filter operations

4. **Add Loading States**
   - While data is loading, ensure all derived arrays have safe defaults
   - Consider showing loading state UI when `tasksLoading` or `staffLoading` is true

### Implementation Plan

**Step 1**: Fix staffTasks initialization (line ~160)
```typescript
const staffTasks =
  user?.role === "staff" || user?.role === "intern"
    ? (tasks?.filter((task) => task.assigneeId === user?.id) || [])
    : (tasks || []);
```

**Step 2**: Add optional chaining to activeTask (line ~238)
```typescript
const activeTask = staffTasks?.find((task) => task.isTimerRunning);
```

**Step 3**: Ensure userTasks has safe fallback (line ~241+)
```typescript
const userTasks =
  user?.role === "staff" || user?.role === "intern"
    ? staffTasks || []
    : user?.role === "client" &&
        user?.clientType === "support_maintenance_client"
      ? tasks || []
      : // ... rest of conditions
```

**Step 4**: Add safety to filteredTasks (line ~254+)
```typescript
const filteredTasks = user?.role === "staff" || user?.role === "intern"
  ? (staffTasks || []).filter((task) =>
      taskSearchQuery ? task.title.toLowerCase().includes(taskSearchQuery.toLowerCase()) : true
    )
  : (tasks || []).filter((task) =>
      taskSearchQuery ? task.title.toLowerCase().includes(taskSearchQuery.toLowerCase()) : true
    );
```

**Step 5**: Add safety to all task categorizations (line ~271+)
```typescript
const tasksInProgress = (userTasks || []).filter(
  (task) => task.status === "in_progress"
);
const pendingTasks = (userTasks || []).filter((task) => task.status === "pending");
const todoTasks = (userTasks || []).filter((task) => task.status === "todo");
const tasksInReview = (userTasks || []).filter((task) => task.status === "review");
const technicalSupportTasks = (userTasks || []).filter(
  (task) => task.status === "technical_support",
);
```

### Testing Checklist
- [ ] Dashboard loads without errors
- [ ] Dashboard shows correct data after loading
- [ ] Staff/Intern view works correctly
- [ ] Manager/Admin view works correctly
- [ ] All task filters work properly
- [ ] No console errors during initial load
- [ ] Page refresh doesn't cause errors
