import nodemailer from "nodemailer";
import "dotenv/config";

/**
 * Send an email with an OTP (or any HTML content).
 * @param {string} to - Recipient email address.
 * @param {string} subject - Email subject.
 * @param {string} html - HTML content (if not provided, a default OTP template is used).
 * @param {object} options - Additional options (e.g., otp, username).
 * @returns {Promise<object>} - Nodemailer info object.
 */
export const sendEmail = async (to, subject, html = null, options = {}) => {
  // Validate required env variables
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.error("❌ Missing email credentials in environment variables.");
    throw new Error("Email service not configured properly.");
  }

  // Create transporter with connection pooling and better timeouts
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
    pool: true, // use pooled connections
    maxConnections: 5,
    maxMessages: 100,
    rateLimit: true, // respect Gmail's rate limits
    socketTimeout: 10000, // 10 seconds
  });

  // If no custom HTML is provided, build a responsive OTP email template
  if (!html) {
    const { otp, username = "there", expiryMinutes = 10 } = options;
    if (!otp) throw new Error("OTP is required when using default template.");

    html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
        <title>Password Reset OTP</title>
        <style>
          @media only screen and (max-width: 600px) {
            .container { width: 100% !important; padding: 20px !important; }
            .otp-box { font-size: 28px !important; padding: 12px 20px !important; }
            .button { display: block !important; width: 100% !important; }
          }
        </style>
      </head>
      <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f4">
          <tr>
            <td align="center" style="padding: 30px 15px;">
              <table width="100%" max-width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; width:100%; background:#ffffff; border-radius:16px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
                <tr>
                  <td style="padding: 32px 28px 16px 28px; text-align:center; border-bottom:1px solid #e9ecef;">
                    <div style="display:inline-flex; align-items:center; gap:8px;">
                      <div style="width:36px; height:36px; background:#10b981; border-radius:10px; display:inline-flex; align-items:center; justify-content:center;">
                        <span style="font-size:20px; color:white;">🔐</span>
                      </div>
                      <span style="font-size:22px; font-weight:700; color:#1f2937;">Learn<span style="color:#10b981;">Hub</span></span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 28px 10px 28px;">
                    <h2 style="margin:0 0 8px; font-size:26px; font-weight:700; color:#111827;">Password Reset Request</h2>
                    <p style="margin:0; font-size:16px; color:#4b5563;">Hi <strong style="color:#10b981;">${escapeHtml(username)}</strong>,</p>
                    <p style="margin:16px 0; font-size:16px; color:#374151; line-height:1.5;">
                      We received a request to reset your password. Use the OTP below to proceed. This code is valid for <strong>${expiryMinutes} minutes</strong>.
                    </p>
                    <div style="background:#f0fdf4; border-radius:12px; padding:20px; text-align:center; margin:24px 0;">
                      <p style="margin:0 0 6px; font-size:14px; color:#065f46; letter-spacing:1px;">Your One‑Time Password</p>
                      <div class="otp-box" style="font-size:36px; font-weight:800; letter-spacing:6px; color:#059669; background:white; display:inline-block; padding:12px 28px; border-radius:12px; border:1px solid #d1fae5;">
                        ${otp}
                      </div>
                    </div>
                    <p style="margin:16px 0 0; font-size:14px; color:#6b7280;">
                      If you didn't request this, please ignore this email or contact support.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 28px 32px; text-align:center; border-top:1px solid #e9ecef;">
                    <p style="margin:0; font-size:12px; color:#9ca3af;">&copy; 2025 LearnHub. All rights reserved.</p>
                    <p style="margin:8px 0 0; font-size:12px; color:#9ca3af;">
                      <a href="#" style="color:#9ca3af; text-decoration:none;">Help Center</a> &nbsp;|&nbsp;
                      <a href="#" style="color:#9ca3af; text-decoration:none;">Privacy</a>
                    </p>
                  </td>
                </tr>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  const mailOptions = {
    from: `"LearnHub" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
    // Optional: add plain text alternative
    text: options.plainText || `Your OTP is: ${options.otp}. Valid for ${options.expiryMinutes || 10} minutes.`,
  };

  try {
    console.log(`📧 Attempting to send email to ${to}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${to}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error.message);
    // Re-throw with more context
    throw new Error(`Email delivery failed: ${error.message}`);
  }
};

/**
 * Simple helper to escape HTML special characters in user-provided strings.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Backward‑compatible function (if you only need OTP emails)
export const sendOtpMail = async (email, otp, username = "there") => {
  return sendEmail(email, "Password Reset OTP", null, { otp, username, expiryMinutes: 10 });
};