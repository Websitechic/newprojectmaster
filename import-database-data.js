
const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');

async function importDatabaseData() {
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
  const exportFile = process.argv[2] || path.join(__dirname, 'database-exports', 'full_database_export.json');
  
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('Connected to database');

    // Read the export file
    const fileContent = await fs.readFile(exportFile, 'utf8');
    const allData = JSON.parse(fileContent);

    // Import order (respects foreign key dependencies)
    const importOrder = [
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

    // Start transaction
    await client.query('BEGIN');

    for (const table of importOrder) {
      if (!allData[table] || !allData[table].data || allData[table].data.length === 0) {
        console.log(`Skipping ${table} (no data)`);
        continue;
      }

      console.log(`Importing ${table}...`);
      const rows = allData[table].data;

      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

        const query = `
          INSERT INTO ${table} (${columns.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT DO NOTHING
        `;

        await client.query(query, values);
      }

      // Update sequence for tables with serial primary keys
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('${table}', 'id'),
          COALESCE((SELECT MAX(id) FROM ${table}), 1),
          true
        )
      `);

      console.log(`✓ Imported ${rows.length} rows into ${table}`);
    }

    await client.query('COMMIT');
    console.log('\n✓ Database import completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

importDatabaseData();
