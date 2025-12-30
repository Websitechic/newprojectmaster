
# Chat Features Implementation Guide

## Remaining Features to Implement

### Team Chat Features

1. **Tag All Members** - Add @everyone or @all functionality
2. **Search Messages**
3. **Double Tick Read Receipts**
4. **Date Separators**

### General Channel Features

1. **Pin Messages** (partially done in server/routes.ts)
2. **Tag All Members** 
3. **Search Messages**
4. **Double Tick Read Receipts**
5. **Date Separators**

## Implementation Steps

### For Team Chat (client/src/pages/dashboard/team-chat.tsx)

Add these imports and state:
```typescript
import { CheckCheck, AtSign } from "lucide-react";
const [messageSearchQuery, setMessageSearchQuery] = useState("");
const [readCounts, setReadCounts] = useState<Record<number, number>>({});
```

Add search bar in header and implement @everyone mention detection.

### For General Channel (client/src/pages/dashboard/general-channel.tsx)

Similar to Team Chat plus pin functionality for ops managers and team leads.

### Server Routes Additions

Already added:
- `/api/direct-messages/:messageId/read-count`
- `/api/projects/:projectId/team-messages/:messageId/read-count`
- `/api/general-channel/messages/:messageId/read-count`
- `/api/general-channel/messages/:messageId/pin`

## Next Steps

Run migration:
```bash
npm run db:push
```

Then update each chat component following the patterns established in direct-messages.tsx.
