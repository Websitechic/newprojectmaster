
import { db } from "@db";
import { users } from "@db/schema";

const initializeDatabase = async () => {
  try {
    console.log('Initializing database connection...');
    
    // Test basic database connectivity
    const result = await db.select().from(users).limit(1);
    console.log('Database connection verified successfully');
    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    
    // Check if it's a table doesn't exist error
    if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) {
      console.log('Database tables not found. This is likely a migration issue.');
      console.log('The application will continue but database features may not work properly.');
      
      // Return true to allow server to start even without proper database setup
      // This prevents the app from completely failing to start
      return true;
    }
    
    // For connection errors, try to continue
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      console.log('Database connection failed. Server will start in limited mode.');
      return true;
    }
    
    return false;
  }
};

export { initializeDatabase };
