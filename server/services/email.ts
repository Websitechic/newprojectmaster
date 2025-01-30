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

export const initializeEmailService = async () => {
  transporter = await createTestAccount();
};

export const sendVerificationEmail = async (user: User, token: string) => {
  const verificationUrl = `${process.env.APP_URL || 'http://localhost:5000'}/verify-email?token=${token}`;

  const info = await transporter.sendMail({
    from: '"ProjectHub" <noreply@projecthub.com>',
    to: user.email,
    subject: "Verify your email address",
    html: `
      <h1>Welcome to ProjectHub!</h1>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}">Verify Email</a>
      <p>If you didn't create this account, you can safely ignore this email.</p>
    `,
  });

  console.log("Verification email sent:", nodemailer.getTestMessageUrl(info));
  return info;
};

export const sendPasswordResetEmail = async (user: User, token: string) => {
  const resetUrl = `${process.env.APP_URL || 'http://localhost:5000'}/reset-password?token=${token}`;

  const info = await transporter.sendMail({
    from: '"ProjectHub" <noreply@projecthub.com>',
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
