
import { db } from "../db";
import { sql } from "drizzle-orm";

class CommunicationMonitor {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly DELAY_THRESHOLD_HOURS = 1; // 1 hour delay threshold

  start() {
    console.log("Starting communication monitor...");
    
    // Run initial check
    this.checkDelayedResponses();
    
    // Set up periodic checking (every 15 minutes)
    this.monitoringInterval = setInterval(() => {
      this.checkDelayedResponses();
    }, 15 * 60 * 1000);
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log("Communication monitor stopped");
    }
  }

  private async checkDelayedResponses() {
    try {
      console.log("Checking for delayed responses...");

      // Get all projects with recent team messages
      const projectsWithMessages = await db.execute(sql`
        SELECT DISTINCT 
          pm.project_id,
          p.name as project_name,
          p.manager_id as project_manager_id
        FROM project_messages pm
        JOIN projects p ON pm.project_id = p.id
        WHERE pm.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        ORDER BY pm.project_id
      `);

      for (const project of projectsWithMessages.rows) {
        await this.checkProjectDelayedResponses(
          project.project_id,
          project.project_name,
          project.project_manager_id
        );
      }

      console.log(`Checked ${projectsWithMessages.rows.length} projects for delayed responses`);
    } catch (error) {
      console.error("Error checking delayed responses:", error);
    }
  }

  private async checkProjectDelayedResponses(projectId: number, projectName: string, projectManagerId: number) {
    try {
      // Get all project members
      const members = await db.execute(sql`
        SELECT DISTINCT u.id, u.name
        FROM project_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = ${projectId}
        AND pm.invitation_status = 'accepted'
        AND u.role IN ('staff', 'project_manager')
      `);

      // Check each member's response patterns
      for (const member of members.rows) {
        await this.checkMemberResponseDelay(
          projectId,
          projectName,
          member.id,
          member.name,
          projectManagerId
        );
      }
    } catch (error) {
      console.error(`Error checking project ${projectId} delayed responses:`, error);
    }
  }

  private async checkMemberResponseDelay(
    projectId: number,
    projectName: string,
    staffId: number,
    staffName: string,
    projectManagerId: number
  ) {
    try {
      // Check if communication_delays table exists first
      const tableExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'communication_delays'
        );
      `);
      
      if (!tableExists.rows[0]?.exists) {
        console.log('communication_delays table does not exist, skipping delay tracking');
        return;
      }

      // Check for mentions that haven't been responded to
      await this.checkMentionResponses(projectId, projectName, staffId, staffName, projectManagerId);

      // Get the last message from this staff member in this project
      const lastResponse = await db.execute(sql`
        SELECT created_at
        FROM project_messages
        WHERE project_id = ${projectId}
        AND sender_id = ${staffId}
        ORDER BY created_at DESC
        LIMIT 1
      `);

      // Get the last message from others (that might need a response)
      const lastOtherMessage = await db.execute(sql`
        SELECT created_at, sender_id, content
        FROM project_messages
        WHERE project_id = ${projectId}
        AND sender_id != ${staffId}
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (lastOtherMessage.rows.length === 0) {
        return; // No messages from others to respond to
      }

      const lastOtherMessageTime = new Date(lastOtherMessage.rows[0].created_at);
      const lastResponseTime = lastResponse.rows[0] 
        ? new Date(lastResponse.rows[0].created_at)
        : new Date(0); // Beginning of time if no response yet

      // Check if there's a delay (other message is after staff's last response + threshold)
      const hoursDelayed = (Date.now() - Math.max(lastOtherMessageTime.getTime(), lastResponseTime.getTime())) / (1000 * 60 * 60);

      if (hoursDelayed >= this.DELAY_THRESHOLD_HOURS && lastOtherMessageTime > lastResponseTime) {
        // Check if we already have a record for this delay
        const existingDelay = await db.execute(sql`
          SELECT id FROM communication_delays
          WHERE project_id = ${projectId}
          AND staff_id = ${staffId}
          AND last_response_time = ${lastResponseTime.toISOString()}
        `);

        if (existingDelay.rows.length === 0) {
          // Create new delay record
          await db.execute(sql`
            INSERT INTO communication_delays (
              project_id, 
              staff_id, 
              project_manager_id, 
              last_response_time, 
              delay_hours,
              status
            )
            VALUES (
              ${projectId},
              ${staffId},
              ${projectManagerId},
              ${lastResponseTime.toISOString()},
              ${Math.round(hoursDelayed * 100) / 100},
              'pending'
            )
          `);

          console.log(`Detected delayed response: ${staffName} in ${projectName} (${Math.round(hoursDelayed * 100) / 100}h delayed)`);
        }
      }
    } catch (error) {
      console.error(`Error checking member ${staffId} response delay:`, error);
    }
  }

  private async checkMentionResponses(
    projectId: number,
    projectName: string,
    staffId: number,
    staffName: string,
    projectManagerId: number
  ) {
    try {
      // Get staff username/name for mention detection
      const staff = await db.execute(sql`
        SELECT username, name FROM users WHERE id = ${staffId}
      `);

      if (staff.rows.length === 0) return;

      const staffUsername = staff.rows[0].username;
      const staffFullName = staff.rows[0].name;

      // Check for messages mentioning this staff member that haven't been responded to
      const mentionMessages = await db.execute(sql`
        SELECT pm.id, pm.content, pm.created_at, pm.sender_id, u.name as sender_name
        FROM project_messages pm
        LEFT JOIN users u ON pm.sender_id = u.id
        WHERE pm.project_id = ${projectId}
        AND pm.sender_id != ${staffId}
        AND pm.created_at >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
        AND (
          pm.content ILIKE ${'%@' + staffUsername + '%'} OR
          pm.content ILIKE ${'%' + staffFullName + '%'}
        )
        ORDER BY pm.created_at DESC
      `);

      for (const mention of mentionMessages.rows) {
        const mentionTime = new Date(mention.created_at);
        
        // Check if staff member responded after this mention
        const responseAfterMention = await db.execute(sql`
          SELECT id FROM project_messages
          WHERE project_id = ${projectId}
          AND sender_id = ${staffId}
          AND created_at > ${mentionTime.toISOString()}
          LIMIT 1
        `);

        // If no response after mention and it's been more than threshold hours
        const hoursDelayed = (Date.now() - mentionTime.getTime()) / (1000 * 60 * 60);
        
        if (responseAfterMention.rows.length === 0 && hoursDelayed >= this.DELAY_THRESHOLD_HOURS) {
          // Check if we already tracked this mention
          const existingMentionDelay = await db.execute(sql`
            SELECT id FROM communication_delays
            WHERE project_id = ${projectId}
            AND staff_id = ${staffId}
            AND mention_message_id = ${mention.id}
          `);

          if (existingMentionDelay.rows.length === 0) {
            // Create delay record for unresponded mention
            await db.execute(sql`
              INSERT INTO communication_delays (
                project_id, 
                staff_id, 
                project_manager_id, 
                mention_message_id,
                delay_hours,
                delay_type,
                status
              )
              VALUES (
                ${projectId},
                ${staffId},
                ${projectManagerId},
                ${mention.id},
                ${Math.round(hoursDelayed * 100) / 100},
                'mention_unresponded',
                'pending'
              )
            `);

            console.log(`Detected unresponded mention: ${staffName} mentioned by ${mention.sender_name} in ${projectName} (${Math.round(hoursDelayed * 100) / 100}h ago)`);
          }
        }
      }
    } catch (error) {
      console.error(`Error checking mention responses for ${staffId}:`, error);
    }
  }
}

export const communicationMonitor = new CommunicationMonitor();
