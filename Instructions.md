
# App Startup Issues - Debug and Fix Plan

## Analysis Summary

Based on deep code analysis and chat history, the app is experiencing multiple interconnected issues that prevent proper startup. The main problems stem from WebSocket session handling, API routing conflicts, and database schema mismatches.

## Critical Issues Identified

### 1. WebSocket Session Authentication Failures
**Location**: `server/websocket.ts`, `server/index.ts`
**Problem**: WebSocket upgrade process failing due to improper session handling
**Symptoms**:
- "Cannot read properties of undefined (reading 'session')"
- "extWs.terminate is not a function"
- WebSocket connections failing after login

### 2. API Route HTML Response Issue
**Location**: `server/routes.ts`
**Problem**: API endpoints returning HTML instead of JSON causing "Unexpected token '<'" errors
**Root Cause**: Static file serving middleware conflicting with API routes

### 3. Database Schema Inconsistencies
**Location**: `db/schema.ts`, client sentiment functionality
**Problem**: Client sentiment schema mismatch between timestamp and text fields
**Impact**: Sentiment submission failing with "toISOString is not a function"

### 4. Missing Session Middleware Configuration
**Location**: `server/index.ts`, `server/routes.ts`
**Problem**: Inconsistent session parser usage between HTTP and WebSocket connections

## Detailed Fix Plan

### Phase 1: Fix WebSocket Authentication (Priority: CRITICAL)

#### Step 1.1: Fix WebSocket Session Handling
**File**: `server/websocket.ts`
**Changes needed**:
- Remove redundant session checking that causes undefined errors
- Fix terminate function calls
- Improve error handling for session parsing

#### Step 1.2: Consolidate Session Middleware
**File**: `server/index.ts`
**Changes needed**:
- Ensure single session middleware instance
- Fix WebSocket upgrade session parsing
- Add proper error boundaries

### Phase 2: Fix API Routing Issues (Priority: HIGH)

#### Step 2.1: Prevent HTML Responses in API Routes
**File**: `server/routes.ts`
**Changes needed**:
- Add middleware to ensure all /api routes return JSON
- Prevent static file serving from interfering with API routes
- Add proper Content-Type headers

#### Step 2.2: Fix Route Handler Error Responses
**File**: `server/routes.ts`
**Changes needed**:
- Ensure all error responses are JSON formatted
- Add consistent error handling across all endpoints

### Phase 3: Database Schema Fixes (Priority: MEDIUM)

#### Step 3.1: Fix Client Sentiment Schema
**File**: Already fixed in previous changes
**Status**: ✅ Completed - weekStart/weekEnd changed from timestamp to text

#### Step 3.2: Run Database Migration
**Command**: `npm run db:push`
**Purpose**: Apply schema changes to database

### Phase 4: Frontend Error Handling (Priority: MEDIUM)

#### Step 4.1: Improve Error Boundaries
**Files**: Various React components
**Changes needed**:
- Add better error handling for API failures
- Implement fallback UI for connection issues

## Implementation Order

### Immediate Fixes (Do First)
1. Fix WebSocket session authentication in `server/websocket.ts`
2. Fix API routing middleware in `server/routes.ts`
3. Ensure consistent session handling in `server/index.ts`

### Secondary Fixes (Do After Immediate)
1. Run database migration: `npm run db:push`
2. Test WebSocket connections
3. Test client sentiment submission

### Verification Steps (Do Last)
1. Start app with `npm run dev`
2. Test login functionality
3. Test WebSocket connections (check browser dev tools)
4. Test API endpoints (should return JSON, not HTML)
5. Test client sentiment submission
6. Verify real-time features work

## Key Files to Modify

### Critical Files
- `server/websocket.ts` - Fix session handling and terminate calls
- `server/index.ts` - Consolidate session middleware
- `server/routes.ts` - Fix API routing and JSON responses

### Secondary Files
- Various React components for error handling improvements

## Testing Checklist

After implementing fixes:
- [ ] App starts without console errors
- [ ] Login works and establishes session
- [ ] WebSocket connections succeed
- [ ] API endpoints return JSON (not HTML)
- [ ] Client sentiment submission works
- [ ] Real-time notifications work
- [ ] No "Unexpected token '<'" errors
- [ ] No session-related WebSocket errors

## Root Cause Analysis

The primary issue stems from inconsistent session handling between HTTP and WebSocket connections, compounded by middleware ordering problems that cause API routes to serve HTML instead of JSON. The WebSocket authentication failures cascade into broader app instability.

## Prevention Strategies

1. Centralize session middleware configuration
2. Add comprehensive error boundaries
3. Implement better logging for debugging
4. Add API response type validation
5. Regular testing of WebSocket connections

## Dependencies

No additional packages required - all fixes use existing dependencies.

## Estimated Time

- Immediate fixes: 30-45 minutes
- Secondary fixes: 15-30 minutes  
- Testing and verification: 30 minutes
- **Total**: 1.5-2 hours

## Notes

- Some fixes have already been partially implemented based on chat history
- Database schema fix for client sentiment is already complete
- Focus on WebSocket session handling as the primary blocker
