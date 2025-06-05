
import { db } from "@db";
import { users, tasks, UserStatus, WorkStatus } from "@db/schema";
import { eq, and } from "drizzle-orm";

interface BreakSession {
  userId: number;
  breakType: 'first' | 'second';
  startTime: Date;
  endTime: Date;
  pausedTaskId?: number;
  wasTimerRunning?: boolean;
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

      // Get all staff members
      const allStaff = await db
        .select()
        .from(users)
        .where(eq(users.role, 'staff'));

      for (const user of allStaff) {
        // First check if user should return from leave
        await this.checkLeaveStatus(user);

        // Only check breaks for users not on leave
        if (user.workStatus !== WorkStatus.ABSENT && user.breakOneTime && user.breakTwoTime) {
          // Check if user is already on break
          if (this.activeBreaks.has(user.id)) {
            await this.checkBreakEnd(user);
          } else if (user.workStatus === WorkStatus.ON_BREAK) {
            // Handle users who are on break but not in activeBreaks (e.g., after server restart)
            await this.handleOrphanedBreak(user);
          } else {
            // Check if it's time for a break
            await this.checkBreakStart(user, currentTime);
          }
        }
      }
    } catch (error) {
      console.error('Error in break scheduler:', error);
    }
  }

  private async checkBreakStart(user: any, currentTime: string) {
    const breakOneTime = user.breakOneTime;
    const breakTwoTime = user.breakTwoTime;

    let shouldStartBreak = false;
    let breakType: 'first' | 'second' | null = null;

    // Check if current time matches break times (within 1 minute window)
    if (this.isTimeToBreak(currentTime, breakOneTime)) {
      breakType = 'first';
      shouldStartBreak = true;
    } else if (this.isTimeToBreak(currentTime, breakTwoTime)) {
      breakType = 'second';
      shouldStartBreak = true;
    }

    if (shouldStartBreak && breakType) {
      await this.startBreak(user, breakType);
    }
  }

  private async checkBreakEnd(user: any) {
    const breakSession = this.activeBreaks.get(user.id);
    if (!breakSession) return;

    const now = new Date();
    
    // Break ends after 1 hour
    if (now >= breakSession.endTime) {
      await this.endBreak(user.id);
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
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private async startBreak(user: any, breakType: 'first' | 'second') {
    try {
      console.log(`Starting ${breakType} break for user ${user.name}`);

      // Check if user has a running task timer
      const [runningTask] = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.assigneeId, user.id),
          eq(tasks.isTimerRunning, true)
        ))
        .limit(1);

      let pausedTaskId;
      let wasTimerRunning = false;

      if (runningTask) {
        // Pause the timer and save elapsed time
        const elapsedSeconds = Math.floor((new Date().getTime() - new Date(runningTask.timerStartTime!).getTime()) / 1000);
        const newTimeSpent = (runningTask.timeSpent || 0) + elapsedSeconds;

        await db
          .update(tasks)
          .set({
            isTimerRunning: false,
            timerStartTime: null,
            timeSpent: newTimeSpent,
            updatedAt: new Date()
          })
          .where(eq(tasks.id, runningTask.id));

        pausedTaskId = runningTask.id;
        wasTimerRunning = true;
        console.log(`Paused timer for task ${runningTask.id} during break`);
      }

      const now = new Date();
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
        endTime,
        pausedTaskId,
        wasTimerRunning
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

      // Update user status back to active
      await db
        .update(users)
        .set({
          workStatus: WorkStatus.ACTIVE,
          breakStartTime: null,
          lastActive: new Date()
        })
        .where(eq(users.id, userId));

      // Resume timer if there was one running
      if (breakSession.pausedTaskId && breakSession.wasTimerRunning) {
        await db
          .update(tasks)
          .set({
            isTimerRunning: true,
            timerStartTime: new Date(),
            updatedAt: new Date()
          })
          .where(eq(tasks.id, breakSession.pausedTaskId));

        console.log(`Resumed timer for task ${breakSession.pausedTaskId} after break`);
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

      // If break has exceeded 1 hour, end it
      if (breakDuration >= 60) {
        console.log(`Ending orphaned break for user ${user.name} (${breakDuration} minutes)`);
        await this.endBreakDirectly(user.id);
      } else {
        // Recreate the break session
        const endTime = new Date(breakStartTime.getTime() + 60 * 60 * 1000); // 1 hour from start
        this.activeBreaks.set(user.id, {
          userId: user.id,
          breakType: 'first', // Default type
          startTime: breakStartTime,
          endTime: endTime
        });
        console.log(`Recreated break session for user ${user.name}`);
      }
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
