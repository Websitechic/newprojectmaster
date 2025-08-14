
import { db } from "@db";
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
        SELECT created_at, sender_id
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
}

export const communicationMonitor = new CommunicationMonitor();
