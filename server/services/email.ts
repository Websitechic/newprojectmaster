import nodemailer from 'nodemailer';
import { User } from '@db/schema';

// For development, we'll use Ethereal - a fake SMTP service
// In production, you would use a real email service like SendGrid, AWS SES, etc.
const createTestAccount = async () => {
  const testAccount = await nodemailer.createTestAccount();
  
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
};

let transporter: nodemailer.Transporter;

// Use Gmail SMTP if credentials are provided, otherwise fallback to Ethereal
export const initializeEmailService = async () => {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    console.log("📧 Initializing Gmail SMTP service...");
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  } else {
    console.log("📧 Initializing Ethereal test email service...");
    transporter = await createTestAccount();
  }
};

export const sendVerificationEmail = async (user: User, token: string) => {
  const baseUrl = process.env.APP_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000');
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  const info = await transporter.sendMail({
    from: '"wcdigital worktool app" <noreply@wcdigital.com>',
    to: user.email,
    subject: "Verify your email address",
    html: `
      <h1>Welcome to wcdigital worktool app!</h1>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}">Verify Email</a>
      <p>If you didn't create this account, you can safely ignore this email.</p>
    `,
  });

  console.log("Verification email sent:", nodemailer.getTestMessageUrl(info));
  return info;
};

export const sendPasswordResetEmail = async (user: User, token: string) => {
  const baseUrl = process.env.APP_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000');
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const info = await transporter.sendMail({
    from: '"wcdigital worktool app" <noreply@wcdigital.com>',
    to: user.email,
    subject: "Reset your password",
    html: `
      <h1>Password Reset Request</h1>
      <p>You requested to reset your password. Click the link below to set a new password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
    `,
  });

  console.log("Password reset email sent:", nodemailer.getTestMessageUrl(info));
  return info;
};
