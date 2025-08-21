
# Staff Queries Error Fix Plan

## Problem Analysis
The "failed to create staff query" error is caused by multiple issues:

### 1. Database Field Name Mismatches
- **Frontend sends**: `explanation`, `attachmentUrl`, `submitterId`
- **Backend expects**: `whyQuery`, `attachmentPath`, `sentBy`
- **Database schema has**: `why_query`, `attachment_path`, `sent_by`

### 2. Department List Issue
- Current endpoint fetches departments from user specializations
- Need predefined department list: Technical support, design, development, media buying, copywriting, automation, community manager, Project manager, product owner

### 3. Form Data Handling
- Frontend form sends wrong field names to backend
- Backend tries to insert with mismatched field names

## Files to Fix

### 1. server/routes.ts (POST /api/staff-queries endpoint)
**Location**: Around line 1000-1050
**Issue**: Field name mismatch in database insertion
**Fix**: Update field names to match database schema:
```javascript
// Change from:
explanation: whyQuery,
attachmentUrl: attachmentPath,
submitterId: user.id,

// To:
whyQuery,
attachmentPath: attachmentPath || null,
sentBy: user.id,
```

### 2. server/routes.ts (GET /api/departments endpoint) 
**Location**: Around line 600-650
**Issue**: Returns user specializations instead of predefined departments
**Fix**: Replace with hardcoded department list:
```javascript
const departmentList = [
  "Technical support",
  "Design", 
  "Development",
  "Media buying",
  "Copywriting",
  "Automation",
  "Community manager",
  "Project manager",
  "Product owner"
];
```

### 3. client/src/pages/dashboard/staff-queries.tsx
**Location**: Form submission handler
**Issue**: Sends wrong field names to backend
**Fix**: Update mutation to send correct field names matching backend expectations

## Implementation Steps

1. **Fix Backend Field Names** (server/routes.ts)
   - Update POST /api/staff-queries to use correct database field names
   - Ensure field mapping matches schema: whyQuery, attachmentPath, sentBy

2. **Fix Department Endpoint** (server/routes.ts)
   - Replace GET /api/departments with predefined list
   - Remove dependency on user specializations

3. **Update Frontend Form** (staff-queries.tsx)
   - Ensure form sends data with correct field names
   - Update mutation to match backend expectations

4. **Test Error Handling**
   - Add proper error logging to identify field mismatches
   - Ensure database constraints are handled properly

## Expected Results
- Staff query creation should work without field name errors
- Department dropdown should show the 9 predefined departments
- Form submission should succeed and show success message
- Queries should appear in the staff queries list

## Verification Steps
1. Try creating a staff query - should succeed
2. Check department dropdown - should show 9 departments
3. Verify query appears in database with correct field values
4. Test with different user roles (operations manager, project manager)

## Database Schema Reference
```sql
staff_queries table fields:
- why_query (text, required)
- attachment_path (text, optional) 
- sent_by (integer, required, FK to users.id)
- staff_id (integer, required, FK to users.id)
- staff_name (text, required)
- department (text, required)
```
