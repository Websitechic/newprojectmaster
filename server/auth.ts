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
      if (!storedPassword || !suppliedPassword) {
        console.error('Missing password input:', { hasStored: !!storedPassword, hasSupplied: !!suppliedPassword });
        return false;
      }
      
      const parts = storedPassword.split(".");
      if (parts.length !== 2) {
        console.error('Malformed password hash - expected format: hash.salt, got length:', parts.length);
        return false;
      }

      const [hashedPassword, salt] = parts;
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
      sameSite: "lax", 
      maxAge: 14 * 24 * 60 * 60 * 1000, // 2 weeks of inactivity
      path: '/',
      domain: undefined // Let browser set automatically
    },
    name: 'connect.sid', // Explicit session cookie name
    proxy: true // Trust first proxy (Replit handles HTTPS)
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log('\n--- LocalStrategy Authentication Start ---');
        console.log('Authenticating user:', username);
        
        // Validate inputs
        if (!username || !password) {
          console.log('Missing username or password');
          return done(null, false, { message: "Username and password are required." });
        }
        
        console.log('Querying database for user:', username);
        let user;
        try {
          const result = await db
            .select()
            .from(users)
            .where(sql`LOWER(${users.username}) = LOWER(${username})`)
            .limit(1);
          user = result[0];
          
          if (user) {
            console.log('User found:', {
              id: user.id,
              username: user.username,
              hasPassword: !!user.password,
              passwordLength: user.password?.length
            });
          }
        } catch (dbErr) {
          console.error('DATABASE ERROR during login:', dbErr);
          return done(dbErr);
        }

        if (!user) {
          console.log('User not found:', username);
          return done(null, false, { message: "Incorrect username." });
        }
        
        console.log('User found, comparing password...');
        console.log('Stored password hash format:', {
          hasPassword: !!user.password,
          passwordLength: user.password?.length,
          hasDot: user.password?.includes('.')
        });
        
        // Add error handling for password comparison
        let isMatch = false;
        try {
          isMatch = await crypto.compare(password, user.password);
          console.log('Password comparison result:', isMatch);
        } catch (compareErr) {
          console.error('CRITICAL: Password comparison error:', compareErr);
          console.error('Error details:', {
            message: compareErr instanceof Error ? compareErr.message : 'Unknown error',
            stack: compareErr instanceof Error ? compareErr.stack : undefined,
            storedPassword: user.password?.substring(0, 20) + '...'
          });
          return done(new Error('Password verification failed'));
        }
        
        if (!isMatch) {
          console.log('Password mismatch for user:', username);
          return done(null, false, { message: "Incorrect password." });
        }
        
        console.log('User authenticated successfully:', username);
        return done(null, user);
      } catch (err) {
        console.error('CRITICAL: LocalStrategy error:', err);
        console.error('Error details:', {
          message: err instanceof Error ? err.message : 'Unknown error',
          stack: err instanceof Error ? err.stack : undefined
        });
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
    console.log('\n========== LOGIN ATTEMPT START ==========');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Request headers:', {
      host: req.headers.host,
      origin: req.headers.origin,
      referer: req.headers.referer,
      'user-agent': req.headers['user-agent']?.substring(0, 50)
    });
    console.log('Session info:', {
      hasSession: !!req.session,
      sessionID: req.session?.id,
      hasPassport: !!(req.session && req.session.passport)
    });
    console.log('Login attempt for username:', req.body?.username);
    
    // Validate input first
    if (!req.body || !req.body.username || !req.body.password) {
      console.log('Login failed: Missing credentials');
      console.log('========== LOGIN ATTEMPT END (FAILED) ==========\n');
      return res.status(400).json({ message: "Username and password are required" });
    }
    
    passport.authenticate("local", (err: any, user: Express.User | false, info: IVerifyOptions) => {
      if (err) {
        console.error('\n❌ CRITICAL: Passport authenticate error:', err);
        console.error('Error type:', err.constructor.name);
        console.error('Error message:', err.message);
        console.error('Error stack:', err.stack);
        console.log('========== LOGIN ATTEMPT END (ERROR) ==========\n');
        return res.status(500).json({ 
          message: "Internal server error during authentication strategy",
          error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      if (!user) {
        console.log('Authentication rejected:', info?.message);
        console.log('========== LOGIN ATTEMPT END (REJECTED) ==========\n');
        return res.status(401).json({ message: info?.message || "Invalid username or password" });
      }

      console.log('✅ User authenticated successfully:', user.id);

      // Login the user
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('\n❌ CRITICAL: req.logIn error:', loginErr);
          console.error('Error type:', loginErr.constructor.name);
          console.error('Error message:', loginErr.message);
          console.error('Error stack:', loginErr.stack);
          console.log('========== LOGIN ATTEMPT END (LOGIN ERROR) ==========\n');
          return res.status(500).json({ 
            message: "Internal server error during session login",
            error: process.env.NODE_ENV === 'development' ? loginErr.message : undefined
          });
        }

        console.log('✅ req.logIn success, updating status for user:', user.id);

        // Update user status (non-blocking)
        db.update(users)
          .set({
            status: UserStatus.ONLINE,
            lastActive: new Date()
          })
          .where(eq(users.id, user.id))
          .then(() => {
            console.log(`✅ Status updated for user ${user.id}`);
          })
          .catch(err => {
            console.error('⚠️ Async status update failed:', err);
          });

        // Save session explicitly
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('\n❌ CRITICAL: Session storage save error:', saveErr);
            console.error('Error type:', saveErr.constructor.name);
            console.error('Error message:', saveErr.message);
            console.error('Error stack:', saveErr.stack);
            console.log('========== LOGIN ATTEMPT END (SESSION SAVE ERROR) ==========\n');
            return res.status(500).json({ 
              message: "Internal server error saving session",
              error: process.env.NODE_ENV === 'development' ? saveErr.message : undefined
            });
          }

          console.log('✅ Login fully complete for user:', user.id);
          console.log('Session saved with ID:', req.session.id);
          console.log('========== LOGIN ATTEMPT END (SUCCESS) ==========\n');

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