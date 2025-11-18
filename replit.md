# Project Management Tool - Replit Configuration

## Overview

This is a comprehensive project management tool built for Websitechic Digital Agency. The application serves IT professionals, project managers, staff members, and clients with features for task management, collaboration, performance tracking, and client relationship management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application follows a modern full-stack architecture with clear separation between frontend and backend concerns:

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Framework**: Radix UI components with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation
- **Real-time Features**: WebSocket connections for chat and notifications

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Authentication**: Passport.js with local strategy and session-based auth
- **Session Storage**: In-memory store with express-session
- **Real-time Communication**: WebSocket server and Server-Sent Events (SSE)
- **Video Calling**: Socket.IO for WebRTC signaling

## Key Components

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Schema**: Comprehensive schema supporting users, projects, tasks, messages, bookings, and performance tracking
- **Migrations**: Automated database migrations in `/migrations` directory

### Authentication System
- **Strategy**: Session-based authentication using Passport.js
- **Security**: Scrypt-based password hashing with salt
- **Session Management**: Memory store with 24-hour cookie expiration
- **Role-based Access**: Multiple user roles (client, project_manager, staff, intern, product_owner, operations_manager)

### Task Management
- **Task Assignment**: Tasks with deadlines, assignees, and status tracking
- **Time Tracking**: Built-in timer functionality with break scheduling
- **Status Management**: Todo, in-progress, completed, review, and technical support states
- **Notifications**: Automated email and in-app notifications for task assignments

### Communication System
- **Project Chat**: Real-time messaging within project contexts
- **Direct Messages**: Private messaging between team members
- **Video Calls**: WebRTC-based video calling with Socket.IO signaling
- **Notifications**: Real-time notifications via WebSocket and SSE

### Performance Tracking
- **KPI Management**: Backend KPI input and tracking
- **Reports**: Weekly performance reports with chart visualization
- **Daily Visibility**: Real-time performance monitoring for staff
- **Analytics**: Performance analysis using charts and metrics

## Data Flow

### Authentication Flow
1. User submits credentials via login form
2. Passport.js validates credentials against database
3. Session established with user data
4. Frontend receives user object and updates auth state
5. Subsequent requests include session cookie for authentication

### Task Management Flow
1. Project managers create tasks with assignments
2. Tasks stored in database with notifications triggered
3. Staff members receive real-time notifications
4. Task updates propagate through WebSocket connections
5. Time tracking data persists to database with break scheduling

### Real-time Communication Flow
1. WebSocket connections established on user login
2. Messages sent through WebSocket server
3. Server broadcasts to relevant project members
4. Database stores message history
5. Unread counts updated in real-time

## External Dependencies

### Core Backend Dependencies
- **Express.js**: Web application framework
- **Drizzle ORM**: Type-safe database ORM
- **Passport.js**: Authentication middleware
- **Socket.IO**: Real-time bidirectional communication
- **Nodemailer**: Email service integration
- **Multer**: File upload handling

### Core Frontend Dependencies
- **React**: UI library with TypeScript
- **TanStack Query**: Server state management
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **React Hook Form**: Form state management
- **Zod**: Schema validation

### Development Tools
- **Vite**: Fast build tool and development server
- **TypeScript**: Type safety across the stack
- **ESBuild**: Fast JavaScript bundler for production

## Deployment Strategy

### Build Process
- **Frontend**: Vite builds React application to `dist/public`
- **Backend**: ESBuild bundles server code to `dist/index.js`
- **Database**: Drizzle migrations run via `npm run db:push`

### Environment Configuration
- **DATABASE_URL**: PostgreSQL connection string (required)
- **NODE_ENV**: Environment flag (development/production)
- **Session Secret**: Defaults to REPL_ID for development

### Hosting Requirements
- **Node.js Runtime**: ES modules support required
- **PostgreSQL Database**: Configured via DATABASE_URL
- **WebSocket Support**: Required for real-time features
- **File System Access**: For uploaded files and migrations

### Development Setup
1. Install dependencies: `npm install`
2. Set up PostgreSQL database and configure DATABASE_URL
3. Run migrations: `npm run db:push`
4. Start development server: `npm run dev`

### Production Deployment
1. Build application: `npm run build`
2. Set NODE_ENV=production
3. Configure database connection
4. Start production server: `npm start`

The application is designed to be deployed on cloud platforms like Replit, with automatic scaling capabilities and session persistence through the configured memory store.