
const initializeDatabase = async () => {
  try {
    // Check if database is accessible
    const result = await db.select().from(users).limit(1);
    console.log('Database connection verified');
    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    
    // Check if it's a table doesn't exist error
    if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
      console.log('Database tables not found. Please ensure your database is properly set up.');
      console.log('You may need to run the SQL migrations manually or use your preferred database setup method.');
    }
    
    return false;
  }
};

export { initializeDatabase };
