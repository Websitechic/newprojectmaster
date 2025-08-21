
# Navigation Error Fix Plan

## Problem Summary
The application has multiple navigation-related errors causing setLocation reference errors and preventing proper project card navigation to project details pages.

## Root Causes Identified

### 1. Inconsistent Navigation Patterns
- Mixed use of `setLocation`, `window.location.href`, and `handleNavigation`
- Some components missing proper navigation hook imports
- Event bubbling causing multiple navigation attempts

### 2. Missing Context/Imports
- Some components don't properly import `useLocation` from wouter
- Inconsistent destructuring of navigation functions

### 3. Project Card Navigation Issues
- Multiple click handlers on nested elements
- Race conditions between navigation attempts
- Inconsistent project ID handling

## Fix Implementation Plan

### Phase 1: Standardize Navigation Imports
**Files to update:**
- `client/src/components/project/project-card.tsx`
- `client/src/pages/dashboard/index.tsx`
- `client/src/pages/dashboard/projects.tsx`

**Actions:**
1. Ensure all components properly import `useLocation` from wouter
2. Consistently destructure `[location, setLocation]` or `[_, setLocation]`
3. Remove any direct `window.location.href` usage in favor of `setLocation`

### Phase 2: Unify Navigation Function
**Create consistent navigation pattern:**
1. Use throttled navigation function in dashboard components
2. Implement proper event handling to prevent bubbling
3. Add navigation state management to prevent rapid successive calls

### Phase 3: Fix Project Card Navigation
**Files to update:**
- `client/src/components/project/project-card.tsx`
- `client/src/pages/dashboard/index.tsx`

**Actions:**
1. Simplify project card click handlers
2. Remove nested clickable elements causing event conflicts
3. Ensure proper project ID passing to navigation functions
4. Add proper event prevention (stopPropagation, preventDefault)

### Phase 4: Fix Dashboard Project Cards
**Files to update:**
- `client/src/pages/dashboard/index.tsx`

**Actions:**
1. Update all project card click handlers to use consistent navigation
2. Fix the handleNavigation function timeout logic
3. Ensure proper cleanup of navigation timeouts

### Phase 5: Standardize Project Details Navigation
**Target behavior:**
- Project cards should navigate to `/dashboard/projects/{id}` for managers
- Staff users should navigate to `/dashboard/projects/{id}/staff`
- Ensure proper role-based navigation logic

## Implementation Steps

### Step 1: Fix Navigation Imports
Ensure all components that need navigation properly import and use wouter:
```typescript
import { useLocation } from "wouter";
const [_, setLocation] = useLocation();
```

### Step 2: Implement Consistent Navigation Function
Create a reusable navigation utility that:
- Prevents rapid successive calls
- Handles cleanup properly
- Provides consistent error handling

### Step 3: Fix Project Card Component
Simplify the ProjectCard component to:
- Have a single click handler
- Use consistent navigation method
- Properly handle role-based routing

### Step 4: Update Dashboard Cards
Fix the dashboard project cards to:
- Use the same navigation pattern
- Prevent event bubbling
- Handle navigation timeouts properly

### Step 5: Test Navigation Flow
Verify that:
- Project cards navigate to correct project details page
- No setLocation errors occur
- Navigation is responsive and consistent
- Role-based routing works correctly

## Success Criteria
- ✅ No "setLocation is not defined" errors
- ✅ Project cards navigate to correct project details pages
- ✅ Consistent navigation behavior across all components
- ✅ No navigation race conditions or multiple rapid calls
- ✅ Proper role-based routing (staff vs manager views)

## Files Requiring Updates
1. `client/src/components/project/project-card.tsx` - Standardize navigation
2. `client/src/pages/dashboard/index.tsx` - Fix dashboard project cards
3. `client/src/pages/dashboard/projects.tsx` - Ensure consistent navigation
4. Any other components using project navigation

## Testing Checklist
- [ ] Click project cards from dashboard
- [ ] Click project cards from projects page
- [ ] Verify staff users go to staff project details
- [ ] Verify managers go to regular project details
- [ ] Test rapid clicking doesn't cause errors
- [ ] Verify WebSocket connections remain stable during navigation
