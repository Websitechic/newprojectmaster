
const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');

async function exportDatabaseData() {
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  const exportDir = path.join(__dirname, 'database-exports');

  try {
    await client.connect();
    console.log('Connected to database');

    // Create export directory
    await fs.mkdir(exportDir, { recursive: true });

    // List of all tables in dependency order
    const tables = [
      'users',
      'projects',
      'project_members',
      'client_invitations',
      'tasks',
      'task_sessions',
      'notifications',
      'messages',
      'direct_messages',
      'project_messages',
      'message_read_receipts',
      'performance',
      'project_plans',
      'deliverables',
      'leave_applications',
      'bookings',
      'resources',
      'technical_support_requests',
      'deadline_extension_requests',
      'complaints',
      'staff_complaints',
      'memos',
      'memo_reads',
      'staff_queries',
      'client_sentiment',
      'notes',
      'sops',
      'sop_segments',
      'issue_reports',
      'general_channel_messages',
      'general_channel_read_receipts',
      'review_links',
      'project_briefings'
    ];

    // Export each table
    for (const table of tables) {
      console.log(`Exporting ${table}...`);
      
      const result = await client.query(`SELECT * FROM ${table}`);
      const data = {
        table: table,
        rowCount: result.rows.length,
        data: result.rows
      };

      const filePath = path.join(exportDir, `${table}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`✓ Exported ${result.rows.length} rows from ${table}`);
    }

    // Create a combined export file
    console.log('\nCreating combined export file...');
    const combinedData = {};
    
    for (const table of tables) {
      const filePath = path.join(exportDir, `${table}.json`);
      const fileContent = await fs.readFile(filePath, 'utf8');
      combinedData[table] = JSON.parse(fileContent);
    }

    await fs.writeFile(
      path.join(exportDir, 'full_database_export.json'),
      JSON.stringify(combinedData, null, 2)
    );

    console.log('\n✓ Database export completed successfully!');
    console.log(`Export location: ${exportDir}`);

  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

exportDatabaseData();
