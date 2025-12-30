
# Project Instructions

## Error Fix: "searchTerm is not defined" in task-list.tsx

### Problem Analysis
The error occurs in `client/src/components/task/task-list.tsx` where the `searchTerm` variable is being used in the filtering logic but is never declared as a state variable.

### Root Cause
The component references `searchTerm` in the `filteredTasks` computation (around line 404-413) without declaring it. The variable is used to filter tasks by name and assignee name, but the React state variable and its setter function are missing.

### Files Affected
- `client/src/components/task/task-list.tsx`

### Solution Steps

1. **Add Missing State Declaration**
   - Add `const [searchTerm, setSearchTerm] = useState("");` to the component
   - This should be added with other state declarations near the top of the component (after line 61)

2. **Add Search Input UI**
   - The component also needs a search input field in the UI
   - This should be added before the table, similar to how it's implemented in `staff-task-list.tsx`
   - Include a label indicating users can search by task name or assignee name

3. **Verify Filtering Logic**
   - The filtering logic that uses `searchTerm` is already present
   - It filters by task title and assignee name
   - No changes needed to the filtering logic itself

### Implementation Details

**State Declaration (add after line 61):**
```typescript
const [searchTerm, setSearchTerm] = useState("");
```

**Search Input UI (add before the table section, around line 430):**
```typescript
<div className="space-y-2 mb-4">
  <div className="flex items-center space-x-2">
    <Input
      placeholder="Search tasks..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="max-w-sm"
    />
  </div>
  <p className="text-xs text-muted-foreground">
    Search by task name or assignee name
  </p>
</div>
```

### Related Files
- `client/src/components/task/staff-task-list.tsx` - Reference implementation with correct search functionality (line 45 and lines 70-80)

### Testing Checklist
After implementing fixes:
- [ ] Component loads without errors
- [ ] Search input is visible in the UI
- [ ] Searching by task name filters tasks correctly
- [ ] Searching by assignee name filters tasks correctly
- [ ] Search is case-insensitive
- [ ] Clearing search shows all tasks
- [ ] No console errors about undefined variables
