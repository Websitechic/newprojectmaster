import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, type User as SelectUser, UserStatus } from "@db/schema";
import { db } from "@db";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";

const scryptAsync = promisify(scrypt);
const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    const [hashedPassword, salt] = storedPassword.split(".");
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(
      suppliedPassword,
      salt,
      64
    )) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Login schema
const loginSchema = z.object({
  username: z.string(),
  password: z.string()
});

// Registration validation
const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(["client", "project_manager", "staff"]),
  breakOneTime: z.string().optional(),
  breakTwoTime: z.string().optional(),
});

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
    cookie: {
      secure: app.get("env") === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          return done(null, false, { message: "Incorrect username." });
        }
        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Incorrect password." });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: Express.User | false, info: IVerifyOptions) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: info.message || "Authentication failed" });
      }
      
      // Login the user
      req.logIn(user, async (err) => {
        if (err) {
          return next(err);
        }
        
        // Update user status to online and last active timestamp
        try {
          await db
            .update(users)
            .set({ 
              status: UserStatus.ONLINE,
              lastActive: new Date()
            })
            .where(eq(users.id, user.id));
            
          console.log(`User ${user.id} (${user.username}) is now online`);
        } catch (error) {
          console.error('Error updating user status on login:', error);
        }
        
        return res.json({ 
          message: "Login successful",
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name
          }
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", async (req, res, next) => {
    // First update the user's status to offline
    if (req.isAuthenticated() && req.user) {
      try {
        await db
          .update(users)
          .set({ 
            status: UserStatus.OFFLINE,
            lastActive: new Date()
          })
          .where(eq(users.id, req.user.id));
          
        console.log(`User ${req.user.id} (${req.user.username}) is now offline`);
      } catch (error) {
        console.error('Error updating user status on logout:', error);
      }
    }
    
    // Then proceed with the normal logout
    req.logout((err) => {
      if (err) {
        return next(err);
      }
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destruction error:", err);
          return res.status(500).json({ message: "Logout failed" });
        }
        res.clearCookie("connect.sid");
        return res.json({ message: "Logout successful" });
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    return res.json(req.user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        return res
          .status(400)
          .send("Invalid input: " + result.error.issues.map(i => i.message).join(", "));
      }

      const { username, password, role, name, email, breakOneTime, breakTwoTime } = result.data;

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      // Validate break times for non-client users
      if (role !== "client") {
        if (!breakOneTime || !breakTwoTime) {
          return res.status(400).send("Break times are required for staff and project managers");
        }

        // Check if break times are at least 1 hour apart
        const break1 = new Date(`2000-01-01T${breakOneTime}:00`);
        const break2 = new Date(`2000-01-01T${breakTwoTime}:00`);
        const timeDiff = Math.abs(break2.getTime() - break1.getTime()) / (1000 * 60 * 60);

        if (timeDiff < 1) {
          return res.status(400).send("Break times must be at least 1 hour apart");
        }
      }

      // Hash the password
      const hashedPassword = await crypto.hash(password);

      // Create the new user
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          role,
          name,
          email,
          status: UserStatus.ONLINE, // Set to online since they'll be logged in
          breakOneTime: role !== "client" ? breakOneTime : null,
          breakTwoTime: role !== "client" ? breakTwoTime : null,
        })
        .returning();

      // Log the user in after registration
      req.login(newUser, (err) => {
        if (err) {
          return next(err);
        }
        return res.json({
          message: "Registration successful",
          user: { 
            id: newUser.id, 
            username: newUser.username, 
            role: newUser.role,
            name: newUser.name
          },
        });
      });
    } catch (error) {
      next(error);
    }
  });
  // Email verification endpoint
  app.get("/api/verify-email/:token", async (req, res) => {
    try {
      const token = req.params.token;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.verificationToken, token))
        .limit(1);

      if (!user) {
        return res.status(400).send("Invalid verification token");
      }

      await db
        .update(users)
        .set({
          emailVerified: true,
          verificationToken: null,
        })
        .where(eq(users.id, user.id));

      return res.json({ message: "Email verified successfully" });
    } catch (error) {
      return res.status(500).send("Error verifying email");
    }
  });

  // Request password reset endpoint
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        return res.status(400).send("No account found with this email");
      }

      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 3600000); // 1 hour from now

      await db
        .update(users)
        .set({
          resetPasswordToken: token,
          resetPasswordExpires: expires,
        })
        .where(eq(users.id, user.id));

      await sendVerificationEmail(user, token); //Assuming sendVerificationEmail is available and correct

      res.json({ message: "Password reset email sent" });
    } catch (error) {
      res.status(500).send("Error requesting password reset");
    }
  });

  // Reset password endpoint
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      const [user] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.resetPasswordToken, token),
            gt(users.resetPasswordExpires!, new Date())
          )
        )
        .limit(1);

      if (!user) {
        return res.status(400).send("Invalid or expired reset token");
      }

      const hashedPassword = await crypto.hash(newPassword);

      await db
        .update(users)
        .set({
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        })
        .where(eq(users.id, user.id));

      res.json({ message: "Password reset successful" });
    } catch (error) {
      res.status(500).send("Error resetting password");
    }
  });
}