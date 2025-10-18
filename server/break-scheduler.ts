import { db } from "@db";
import { users, tasks, UserStatus, WorkStatus } from "@db/schema";
import { eq, and } from "drizzle-orm";

interface BreakSession {
  userId: number;
  breakType: 'daily';
  startTime: Date;
  endTime: Date;
}

class BreakScheduler {
  private activeBreaks: Map<number, BreakSession> = new Map();
  private intervalId: NodeJS.Timeout | null = null;

  start() {
    // Check every minute for break times
    this.intervalId = setInterval(() => {
      this.checkBreakTimes();
    }, 60000); // Check every minute

    console.log('Break scheduler started');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('Break scheduler stopped');
  }

  private async checkBreakTimes() {
    try {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5); // HH:mm format

      // Check if it's a business day and within business hours
      if (!this.isBusinessTime(now)) {
        console.log('Outside business hours or weekend - skipping break checks');
        return;
      }

      // Get all staff members
      const allStaff = await db
        .select()
        .from(users)
        .where(eq(users.role, 'staff'));

      for (const user of allStaff) {
        // First check if user should return from leave
        await this.checkLeaveStatus(user);

        // Only check breaks for users not on leave
        if (user.workStatus !== WorkStatus.ABSENT && user.breakOneTime) {
          // Check if user is already on break
          if (this.activeBreaks.has(user.id)) {
            await this.checkBreakEnd(user);
          } else if (user.workStatus === WorkStatus.ON_BREAK) {
            // Handle users who are on break but not in activeBreaks (e.g., after server restart)
            await this.handleOrphanedBreak(user);
          } else {
            // Check if it's time for the daily break
            await this.checkBreakStart(user, currentTime);
          }
        }
      }
    } catch (error) {
      console.error('Error in break scheduler:', error);
    }
  }

  private async checkBreakStart(user: any, currentTime: string) {
    if (!user || !user.breakOneTime) {
      return;
    }

    const breakTime = user.breakOneTime;

    // Check if current time matches break time (within 1 minute window)
    if (this.isTimeToBreak(currentTime, breakTime)) {
      await this.startBreak(user, 'daily');
    }
  }

  private async checkBreakEnd(user: any) {
    const breakSession = this.activeBreaks.get(user.id);
    if (!breakSession) return;

    const now = new Date();
    const breakDuration = Math.floor((now.getTime() - breakSession.startTime.getTime()) / 60000); // minutes

    // Break ends automatically after 60 minutes (1 hour)
    if (breakDuration >= 60) {
      console.log(`Auto-ending break for user ${user.id} after ${breakDuration} minutes`);
      await this.endBreak(user.id);
      
      // Send notification based on duration
      try {
        const { createNotification } = await import('./routes');
        if (breakDuration >= 90) {
          await createNotification(
            user.id,
            "break_overtime",
            `🔴 Your break has been automatically ended after ${breakDuration} minutes. Please contact your supervisor.`,
            null,
            "break"
          );
        } else if (breakDuration >= 75) {
          await createNotification(
            user.id,
            "break_overtime",
            "⚠️ Your break has been automatically ended after exceeding the limit. Please return to work.",
            null,
            "break"
          );
        } else {
          await createNotification(
            user.id,
            "break_ended",
            "✅ Break ended. Welcome back to work!",
            null,
            "break"
          );
        }
      } catch (notificationError) {
        console.error("Error sending break end notification:", notificationError);
      }
    }
  }

  private isTimeToBreak(currentTime: string, breakTime: string): boolean {
    // Check if current time is within 1 minute of break time
    const current = this.timeToMinutes(currentTime);
    const scheduled = this.timeToMinutes(breakTime);

    // Allow 1-minute window for break to start
    return Math.abs(current - scheduled) <= 1;
  }

  private timeToMinutes(time: string): number {
    if (!time || typeof time !== 'string') {
      return 0;
    }
    const [hours, minutes] = time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      return 0;
    }
    return hours * 60 + minutes;
  }

  private isBusinessTime(date: Date): boolean {
    // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const dayOfWeek = date.getDay();

    // Check if it's a weekend (Saturday = 6, Sunday = 0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }

    // Check if it's within business hours (9 AM to 6 PM on weekdays)
    const hours = date.getHours();
    if (hours < 9 || hours >= 18) {
      return false;
    }

    return true;
  }

  private async startBreak(user: any, breakType: 'daily') {
    try {
      // Double-check business hours before starting break
      const now = new Date();
      if (!this.isBusinessTime(now)) {
        console.log(`Skipping break for ${user.name} - outside business hours`);
        return;
      }

      console.log(`Starting ${breakType} break for user ${user.name}`);

      // Send break reminder notification with more detail
      try {
        const { createNotification } = await import('./routes');
        await createNotification(
          user.id,
          "break_reminder",
          "☕ Break time! Your scheduled break has started. You can continue working or take a 1-hour break.",
          null,
          "break"
        );
      } catch (notificationError) {
        console.error("Error sending break reminder notification:", notificationError);
      }

      // DO NOT pause running timers - staff control their own timers
      const endTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      // Update user status to on break
      await db
        .update(users)
        .set({
          workStatus: WorkStatus.ON_BREAK,
          breakStartTime: now,
          breakCount: user.breakCount + 1,
          lastActive: now
        })
        .where(eq(users.id, user.id));

      // Store break session
      this.activeBreaks.set(user.id, {
        userId: user.id,
        breakType,
        startTime: now,
        endTime
      });

      console.log(`User ${user.name} is now on ${breakType} break until ${endTime.toTimeString()}`);

    } catch (error) {
      console.error(`Error starting break for user ${user.id}:`, error);
    }
  }

  private async endBreak(userId: number) {
    try {
      const breakSession = this.activeBreaks.get(userId);
      if (!breakSession) return;

      console.log(`Ending break for user ${userId}`);

      const resumeTime = new Date();
      const breakDuration = Math.floor((resumeTime.getTime() - breakSession.startTime.getTime()) / 60000); // minutes

      // Update user status back to active
      await db
        .update(users)
        .set({
          workStatus: WorkStatus.ACTIVE,
          breakStartTime: null,
          lastActive: resumeTime
        })
        .where(eq(users.id, userId));

      // DO NOT resume timers - staff control their own timers

      // Send break end notification
      try {
        const { createNotification } = await import('./routes');
        const message = breakDuration <= 60 
          ? "✅ Break ended. Welcome back to work!" 
          : `⚠️ Break ended after ${breakDuration} minutes. Welcome back to work.`;
        
        await createNotification(
          userId,
          "break_ended",
          message,
          null,
          "break"
        );
      } catch (notificationError) {
        console.error("Error sending break end notification:", notificationError);
      }

      // Remove from active breaks
      this.activeBreaks.delete(userId);

      console.log(`Break ended for user ${userId}`);

    } catch (error) {
      console.error(`Error ending break for user ${userId}:`, error);
    }
  }

  private async checkLeaveStatus(user: any) {
    try {
      // Check if user is on leave and their leave has ended
      if (user.workStatus === WorkStatus.ABSENT && user.absenceEndDate) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const leaveEndDate = new Date(user.absenceEndDate);
        const leaveEndDay = new Date(leaveEndDate.getFullYear(), leaveEndDate.getMonth(), leaveEndDate.getDate());

        // If leave has ended (current date is after leave end date)
        if (today > leaveEndDay) {
          console.log(`User ${user.name} returning from leave`);

          // Update user status back to active
          await db
            .update(users)
            .set({
              workStatus: WorkStatus.ACTIVE,
              absenceReason: null,
              absenceEndDate: null,
              lastActive: now
            })
            .where(eq(users.id, user.id));

          console.log(`User ${user.name} has returned from leave and is now active`);
        }
      }
    } catch (error) {
      console.error(`Error checking leave status for user ${user.id}:`, error);
    }
  }

  private async handleOrphanedBreak(user: any) {
    try {
      if (!user.breakStartTime) {
        // If no break start time, reset to active
        await db
          .update(users)
          .set({
            workStatus: WorkStatus.ACTIVE,
            breakStartTime: null,
            lastActive: new Date()
          })
          .where(eq(users.id, user.id));
        return;
      }

      const breakStartTime = new Date(user.breakStartTime);
      const now = new Date();
      const breakDuration = Math.floor((now.getTime() - breakStartTime.getTime()) / 60000); // minutes

      // Always end breaks that have exceeded 60 minutes, regardless of business hours
      if (breakDuration >= 60) {
        console.log(`Auto-ending orphaned break for user ${user.name} (${breakDuration} minutes - exceeds 60 min limit)`);
        await this.endBreakDirectly(user.id);
        return;
      }

      // If it's outside business hours or weekend, end the break immediately
      if (!this.isBusinessTime(now)) {
        console.log(`Ending orphaned break for user ${user.name} - outside business hours`);
        await this.endBreakDirectly(user.id);
        return;
      }

      // Recreate the break session only if still within 60 minutes
      const endTime = new Date(breakStartTime.getTime() + 60 * 60 * 1000); // 1 hour from start
      this.activeBreaks.set(user.id, {
        userId: user.id,
        breakType: 'daily',
        startTime: breakStartTime,
        endTime: endTime
      });
      console.log(`Recreated break session for user ${user.name}, will end at ${endTime.toTimeString()}`);
    } catch (error) {
      console.error(`Error handling orphaned break for user ${user.id}:`, error);
    }
  }

  private async endBreakDirectly(userId: number) {
    try {
      console.log(`Ending break directly for user ${userId}`);

      // Update user status back to active
      await db
        .update(users)
        .set({
          workStatus: WorkStatus.ACTIVE,
          breakStartTime: null,
          lastActive: new Date()
        })
        .where(eq(users.id, userId));

      // Remove from active breaks if exists
      this.activeBreaks.delete(userId);

      console.log(`Break ended directly for user ${userId}`);
    } catch (error) {
      console.error(`Error ending break directly for user ${userId}:`, error);
    }
  }

  // Method to get currently active breaks (for debugging/monitoring)
  getActiveBreaks(): BreakSession[] {
    return Array.from(this.activeBreaks.values());
  }
}

export const breakScheduler = new BreakScheduler();