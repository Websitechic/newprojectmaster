
# Fix Plan: Direct Messages Real-time Updates & 400 Bad Request Errors

## Root Cause Analysis

### Issue 1: 400 Bad Request on `/api/direct-messages/unread-count`

**Location**: `server/routes.ts` line ~1850-1865

**Root Causes**:
1. The endpoint checks `req.isAuthenticated()` and `req.user` but requests are being made before session is fully established
2. Multiple hooks/components are polling this endpoint simultaneously (sidebar, use-unread-messages hook)
3. No graceful handling when user is not yet authenticated
4. The endpoint returns 400 instead of 401 for unauthenticated requests

**Evidence from logs**:
```
6:29:18 AM [express] GET /api/direct-messages/unread-count 400 in 20ms
6:29:18 AM [express] GET /api/direct-messages/unread-count 400 in 21ms
```
Multiple rapid-fire 400 errors happening consistently.

### Issue 2: Direct Messages Not Received in Real-time

**Locations**: 
- `server/routes.ts` POST `/api/direct-messages` (line ~2400-2500)
- `client/src/App.tsx` GlobalNotificationListener (line ~100-300)
- `client/src/components/chat/direct-messages.tsx` (line ~150-250)

**Root Causes**:
1. **SSE Event Structure Mismatch**: 
   - Server sends: `{ type: 'direct_message', data: messageData }`
   - Client GlobalNotificationListener expects this and dispatches `direct-message-received` event
   - But the event is dispatched AFTER queries are invalidated, causing race conditions

2. **WebSocket Session Issues**:
   - WebSocket connections are failing to authenticate: `WebSocket connection without authenticated session`
   - Session data not accessible in WebSocket upgrade handler
   - Logs show: `WebSocket connection closed for user unknown, code: false, reason: no reason provided`

3. **Sound Notification Not Triggering**:
   - Code checks for `data.notification.type === 'message'` but direct messages create notifications with type `'message'`
   - However, the sound is only played in specific conditions that may not be met

**Evidence from logs**:
```
WebSocket connection session check: { hasSession: false, hasPassport: false, hasUser: false }
WebSocket connection without authenticated session - will wait for auth message
WebSocket connection closed for user unknown, code: false, reason: no reason provided
```

## Comprehensive Fix Plan

### Phase 1: Fix 400 Bad Request Errors (HIGH PRIORITY)

#### Step 1.1: Update `/api/direct-messages/unread-count` endpoint
**File**: `server/routes.ts` (around line 1850)

**Changes**:
- Change status code from 400 to 401 for unauthenticated requests
- Return `{ count: 0 }` instead of error for unauthenticated users
- Add proper error logging

**Before**:
```typescript
app.get("/api/direct-messages/unread-count", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  // ...
});
```

**After**:
```typescript
app.get("/api/direct-messages/unread-count", async (req, res) => {
  // Return 0 count for unauthenticated users instead of error
  if (!req.isAuthenticated() || !req.user) {
    return res.json({ count: 0 });
  }
  // ... rest of endpoint
});
```

#### Step 1.2: Add authentication check to `use-unread-messages.ts`
**File**: `client/src/hooks/use-unread-messages.ts` (around line 70-120)

**Changes**:
- Check if user exists before making requests
- Handle errors gracefully without logging to console
- Reduce polling frequency from 30s to 60s

#### Step 1.3: Add authentication check to sidebar SSE connection
**File**: `client/src/components/dashboard/sidebar.tsx` (around line 200-300)

**Changes**:
- Only establish SSE connection after user is confirmed authenticated
- Add retry logic with exponential backoff
- Proper cleanup on unmount

### Phase 2: Fix Real-time Direct Message Delivery (HIGH PRIORITY)

#### Step 2.1: Fix SSE message broadcasting
**File**: `server/routes.ts` POST `/api/direct-messages` (around line 2400)

**Current Issue**: SSE broadcast happens but may not include all necessary data

**Fix**:
```typescript
// After creating message, ensure complete data in SSE broadcast
const messageWithSender = {
  ...newMessage,
  senderName: user.name,
};

// Broadcast to receiver
const receiverBroadcast = {
  type: "direct_message",
  data: messageWithSender
};

if (global.sseClients && global.sseClients.has(parseInt(receiverId))) {
  const receiverClient = global.sseClients.get(parseInt(receiverId));
  if (receiverClient && !receiverClient.writableEnded) {
    receiverClient.write(`data: ${JSON.stringify(receiverBroadcast)}\n\n`);
  }
}

// Also broadcast to sender for UI update
if (global.sseClients && global.sseClients.has(senderId)) {
  const senderClient = global.sseClients.get(senderId);
  if (senderClient && !senderClient.writableEnded) {
    senderClient.write(`data: ${JSON.stringify(receiverBroadcast)}\n\n`);
  }
}
```

#### Step 2.2: Fix event handling in App.tsx
**File**: `client/src/App.tsx` GlobalNotificationListener (around line 150)

**Changes**:
- Dispatch custom event IMMEDIATELY before invalidating queries
- Ensure event includes all necessary message data
- Add better error handling and logging

**Fix**:
```typescript
else if (data.type === 'direct_message' && data.data) {
  console.log('💬 Global direct message received:', data.data);
  
  // Dispatch event FIRST for immediate UI update
  window.dispatchEvent(new CustomEvent('direct-message-received', { 
    detail: data.data 
  }));
  
  // Play sound for incoming messages (not from current user)
  if (data.data.senderId !== user?.id) {
    playNotificationSound().catch(err => {
      console.error('Sound error:', err);
    });
  }
  
  // Then invalidate queries
  queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/unread-count"] });
  queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/conversations"] });
}
```

#### Step 2.3: Fix direct-messages.tsx event listener
**File**: `client/src/components/chat/direct-messages.tsx` (around line 180)

**Changes**:
- Ensure event listener is set up before component mounts
- Add message deduplication logic
- Better state management

### Phase 3: Fix WebSocket Authentication (MEDIUM PRIORITY)

#### Step 3.1: Improve WebSocket session handling
**File**: `server/websocket.ts` (around line 40-80)

**Changes**:
- Increase auth timeout from 10s to 30s
- Better session access with fallbacks
- Reduce log noise for normal operations

**Fix**:
```typescript
// Increase timeout for authentication
const authTimeout = setTimeout(() => {
  if (!userId && ws.readyState === ws.OPEN) {
    console.log('Closing unauthenticated WebSocket after 30s timeout');
    ws.close(1008, 'Authentication timeout');
  }
}, 30000); // Changed from 10000 to 30000
```

#### Step 3.2: Ensure client sends auth immediately
**File**: `client/src/hooks/use-websocket.ts` (around line 80-120)

**Changes**:
- Send auth message immediately on `onopen`
- Add retry logic for failed auth
- Better connection state management

### Phase 4: Consolidate and Optimize (LOW PRIORITY)

#### Step 4.1: Remove redundant polling
**Goal**: Rely on SSE for real-time updates, use polling only as fallback

**Files to update**:
- `client/src/hooks/use-unread-messages.ts` - Reduce polling frequency to 2 minutes
- `client/src/components/dashboard/sidebar.tsx` - Remove separate SSE connection, rely on global one

#### Step 4.2: Add SSE connection health monitoring
**File**: `client/src/App.tsx`

**Add**:
- Heartbeat checking
- Automatic reconnection with exponential backoff
- Connection status indicator

## Implementation Order

### Day 1: Critical Fixes
1. **Fix 400 errors** (30 minutes)
   - Update `/api/direct-messages/unread-count` to return `{ count: 0 }` for unauthenticated users
   - Add auth checks to `use-unread-messages.ts`
   - Test: No more 400 errors in console

2. **Fix SSE message broadcasting** (45 minutes)
   - Update POST `/api/direct-messages` endpoint to broadcast complete data
   - Ensure both sender and receiver get SSE updates
   - Test: Send message, verify both users see it immediately

3. **Fix event handling order** (30 minutes)
   - Update `App.tsx` to dispatch event before invalidating queries
   - Add deduplication in `direct-messages.tsx`
   - Test: Messages appear instantly without refresh

### Day 2: Stability Improvements
4. **Improve WebSocket authentication** (45 minutes)
   - Update timeout in `websocket.ts` from 10s to 30s
   - Better session handling
   - Test: Fewer WebSocket disconnections

5. **Optimize polling** (20 minutes)
   - Reduce polling frequency
   - Add connection health monitoring
   - Test: Less network traffic, same functionality

## Testing Checklist

- [ ] No 400 errors appear in browser console
- [ ] User A sends message to User B - appears instantly for both users
- [ ] User B sees message without refreshing page
- [ ] Sound plays for User B when receiving message
- [ ] Unread count updates immediately
- [ ] Works across multiple browser tabs
- [ ] Works when navigating between pages
- [ ] WebSocket stays connected (check logs for "connection closed" messages)
- [ ] SSE connection remains stable

## Success Metrics

- **Zero** 400 errors in console logs after authentication
- Direct messages appear in **< 500ms**
- **< 3** WebSocket reconnections per hour per user
- **< 10** redundant API calls per minute per user
- Sound notification plays **100%** of the time for incoming messages

## Files to Modify (in order)

1. `server/routes.ts` - GET `/api/direct-messages/unread-count` endpoint
2. `server/routes.ts` - POST `/api/direct-messages` endpoint (SSE broadcast)
3. `client/src/App.tsx` - GlobalNotificationListener event handling
4. `client/src/components/chat/direct-messages.tsx` - Event listener setup
5. `client/src/hooks/use-unread-messages.ts` - Auth checks and error handling
6. `server/websocket.ts` - Auth timeout and session handling
7. `client/src/hooks/use-websocket.ts` - Immediate auth message sending

## Technical Notes

### SSE Event Flow (Corrected)
1. User A sends message via POST `/api/direct-messages`
2. Server creates message in database
3. Server broadcasts SSE to User B (receiver): `{ type: 'direct_message', data: {...} }`
4. Server broadcasts SSE to User A (sender): same message for UI update
5. Client (App.tsx) receives SSE message
6. Client dispatches `direct-message-received` custom event
7. direct-messages.tsx component listens for event and updates UI
8. Client invalidates queries to sync data

### Current vs Expected Behavior

**Current (Broken)**:
- SSE message sent → queries invalidated → event dispatched → component may not catch event
- 400 errors spam console because endpoint rejects unauthenticated requests
- WebSocket closes immediately due to no session

**Expected (Fixed)**:
- SSE message sent → event dispatched immediately → component updates UI → queries invalidated in background
- Endpoint returns `{ count: 0 }` for unauthenticated users, no errors
- WebSocket waits 30s for auth message before closing
