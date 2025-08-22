
const { db } = require("./db");
const { users } = require("./db/schema");
const { eq } = require("drizzle-orm");
const { scrypt, randomBytes } = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}

async function fixClientPasswords() {
  try {
    console.log("Finding client accounts with malformed passwords...");
    
    // Get all client users
    const clients = await db
      .select()
      .from(users)
      .where(eq(users.role, "client"));

    console.log(`Found ${clients.length} client accounts`);

    for (const client of clients) {
      // Check if password is malformed (doesn't contain a dot or is plaintext)
      if (!client.password || !client.password.includes('.') || client.password.length < 50) {
        console.log(`Fixing password for client: ${client.username} (${client.email})`);
        
        // For demo purposes, set a default password. In production, you'd want to force a password reset
        const defaultPassword = "TempPassword123!";
        const hashedPassword = await hashPassword(defaultPassword);
        
        await db
          .update(users)
          .set({ password: hashedPassword })
          .where(eq(users.id, client.id));
        
        console.log(`✓ Fixed password for ${client.username}`);
        console.log(`  Default password set to: ${defaultPassword}`);
        console.log(`  Please inform the client to change their password after login.`);
      } else {
        console.log(`✓ Client ${client.username} already has properly hashed password`);
      }
    }
    
    console.log("Password fix completed!");
  } catch (error) {
    console.error("Error fixing client passwords:", error);
  }
}

// Run the fix
fixClientPasswords().catch(console.error);
