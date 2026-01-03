import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, type User as SelectUser, UserStatus } from "@db/schema";
import { db } from "@db";
import { eq, and, gt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { sendVerificationEmail, sendPasswordResetEmail } from "./services/email";

const scryptAsync = promisify(scrypt);
const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    // Handle malformed password hashes
    if (!storedPassword || typeof storedPassword !== 'string') {
      console.error('Invalid stored password format:', storedPassword);
      return false;
    }

    const parts = storedPassword.split(".");
    if (parts.length !== 2) {
      console.error('Malformed password hash - expected format: hash.salt, got:', storedPassword);
      return false;
    }

    const [hashedPassword, salt] = parts;

    if (!hashedPassword || !salt) {
      console.error('Missing hash or salt in stored password');
      return false;
    }

    try {
      const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
      const suppliedPasswordBuf = (await scryptAsync(
        suppliedPassword,
        salt,
        64
      )) as Buffer;
      return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
    } catch (error) {
      console.error('Error comparing passwords:', error);
      return false;
    }
  },
};

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Login schema
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required")
});

// Registration validation
const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(["client", "project_manager", "staff", "intern", "product_owner", "customer_support_officer", "operations_manager", "team_lead"]),
  breakOneTime: z.string().optional(), // Daily break time
  specialization: z.string().optional(),
  productService: z.string().optional(),
  clientType: z.string().optional(),
  projectManagerType: z.enum(["main", "supervisor"]).optional() // New field for project manager type
});

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);

  // Always trust proxy for Replit deployments
  app.set("trust proxy", 1);

  const isProduction = process.env.NODE_ENV === 'production';
  const sessionSecret = process.env.SESSION_SECRET || process.env.REPL_ID || "fallback-secret-key-for-development-only";
  
  console.log('🔧 Session Configuration:');
  console.log('  - Environment:', isProduction ? 'production' : 'development');
  console.log('  - Trust proxy:', app.get("trust proxy"));
  console.log('  - Session secret source:', process.env.SESSION_SECRET ? 'SESSION_SECRET' : process.env.REPL_ID ? 'REPL_ID' : 'fallback');
  console.log('  - Cookie secure:', isProduction);
  
  if (isProduction && !process.env.SESSION_SECRET && !process.env.REPL_ID) {
    console.error('❌ CRITICAL: No SESSION_SECRET or REPL_ID found in production!');
    console.error('Set SESSION_SECRET in Secrets for secure sessions.');
  }

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset maxAge on every request
    store: new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
    cookie: {
      secure: isProduction, // Use secure cookies in production
      httpOnly: true,
      sameSite: isProduction ? "lax" : "lax", 
      maxAge: 14 * 24 * 60 * 60 * 1000, // 2 weeks of inactivity
      path: '/'
    },
    name: 'connect.sid', // Explicit session cookie name
    proxy: true // Trust first proxy
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log('Authenticating user:', username);
        const [user] = await db
          .select()
          .from(users)
          .where(sql`LOWER(${users.username}) = LOWER(${username})`)
          .limit(1);

        if (!user) {
          console.log('User not found:', username);
          return done(null, false, { message: "Incorrect username." });
        }
        
        console.log('User found, comparing password...');
        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) {
          console.log('Password mismatch for user:', username);
          return done(null, false, { message: "Incorrect password." });
        }
        console.log('User authenticated successfully:', username);
        return done(null, user);
      } catch (err) {
        console.error('CRITICAL: LocalStrategy database error:', err);
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
    console.log('Login attempt start:', { username: req.body?.username });
    
    passport.authenticate("local", (err: any, user: Express.User | false, info: IVerifyOptions) => {
      if (err) {
        console.error('CRITICAL: Passport authenticate error:', err);
        return res.status(500).json({ 
          error: "Internal server error during authentication",
          details: err.message 
        });
      }
      if (!user) {
        console.log('Authentication rejected:', info?.message);
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }

      console.log('User found and password matched:', user.id);

      // Login the user
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('CRITICAL: req.logIn error:', loginErr);
          return res.status(500).json({ 
            error: "Internal server error during session login",
            details: loginErr.message 
          });
        }

        console.log('req.logIn success, updating status for user:', user.id);

        // Update user status
        db.update(users)
          .set({
            status: UserStatus.ONLINE,
            lastActive: new Date()
          })
          .where(eq(users.id, user.id))
          .then(() => {
            console.log(`Status updated for user ${user.id}`);
          })
          .catch(err => {
            console.error('Async status update failed:', err);
          });

        // Save session
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('CRITICAL: Session storage save error:', saveErr);
            return res.status(500).json({ 
              error: "Internal server error saving session",
              details: saveErr.message 
            });
          }

          console.log('Login fully complete for user:', user.id);

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
        // Instruct client to logout from OneSignal as well
        return res.json({ message: "Logout successful", logoutOneSignal: true });
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

      const { username, password, role, name, email, breakOneTime, specialization, productService, clientType, projectManagerType } = result.data;

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      // Validate break time for non-client users
      if (role !== "client") {
        if (!breakOneTime) {
          return res.status(400).send("Daily break time is required for staff and project managers");
        }
      }

      // Validate project manager type
      if (role === "project_manager" && (!projectManagerType || !["main", "supervisor"].includes(projectManagerType))) {
        return res.status(400).send("Project manager type is required and must be either 'main' or 'supervisor'");
      }

      // Hash the password
      const hashedPassword = await crypto.hash(password);

      // Prepare user data
      const userData: any = {
        username,
        password: hashedPassword,
        name,
        email,
        role: role as any,
        status: UserStatus.ONLINE, // Set to online since they'll be logged in
        emailVerified: false,
        onboardingStatus: "not_onboarded",
        projectManagerType: role === "project_manager" ? projectManagerType : null,
      };

      // Add specialization for staff and intern users
      if ((role === "staff" || role === "intern") && specialization) {
        userData.specialization = specialization as any;
      }

      // Add client-specific fields
      if (role === "client") {
        if (productService) userData.productService = productService as any;
        if (clientType) userData.clientType = clientType as any;
      }

      // Add break times for non-client users
      if (role !== "client") {
        if (breakOneTime) userData.breakOneTime = breakOneTime;
      }


      // Create the new user
      const [newUser] = await db
        .insert(users)
        .values(userData)
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