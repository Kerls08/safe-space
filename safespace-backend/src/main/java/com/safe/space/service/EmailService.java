package com.safe.space.service;

import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;

/**
 * Brevo SMTP Email Dispatch Service.
 *
 * Handles asynchronous email delivery for:
 *   1. Account Welcome & Credential Provisioning (Default Password)
 *   2. Admin-initiated Password Reset Notifications
 *
 * Configured via application.yaml (pointing to Brevo smtp-relay.brevo.com:587).
 * Fails safely if credentials are unconfigured or mail dispatch fails.
 */
@Service
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${safespace.mail.from-address:noreply@safespace.edu.ph}")
    private String fromAddress;

    @Value("${safespace.mail.from-name:SafeSpace System}")
    private String fromName;

    @Value("${safespace.mail.app-url:http://localhost:5173}")
    private String appUrl;

    @Value("${safespace.mail.enabled:true}")
    private boolean mailEnabled;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    public EmailService(@Autowired(required = false) JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    /**
     * Send Welcome & Initial Temporary Password email asynchronously.
     */
    public void sendWelcomeEmail(String toEmail, String fullName, String username, String tempPassword) {
        if (!shouldSend(toEmail)) return;

        CompletableFuture.runAsync(() -> {
            try {
                String subject = "Welcome to SafeSpace — Your Account Credentials";
                String htmlBody = buildWelcomeHtml(fullName, username, tempPassword);
                sendHtmlMail(toEmail, subject, htmlBody);
                log.info("Welcome email sent successfully to {} ({})", username, toEmail);
            } catch (Exception e) {
                log.warn("Failed to send welcome email to {} ({}): {}", username, toEmail, e.getMessage());
            }
        });
    }

    /**
     * Send Password Reset notification email asynchronously.
     */
    public void sendPasswordResetEmail(String toEmail, String fullName, String username, String newTempPassword) {
        if (!shouldSend(toEmail)) return;

        CompletableFuture.runAsync(() -> {
            try {
                String subject = "SafeSpace — Password Reset Notification";
                String htmlBody = buildPasswordResetHtml(fullName, username, newTempPassword);
                sendHtmlMail(toEmail, subject, htmlBody);
                log.info("Password reset email sent successfully to {} ({})", username, toEmail);
            } catch (Exception e) {
                log.warn("Failed to send password reset email to {} ({}): {}", username, toEmail, e.getMessage());
            }
        });
    }

    // ── Internal Helpers ──

    private boolean shouldSend(String toEmail) {
        if (!mailEnabled) {
            log.debug("Email sending skipped: safespace.mail.enabled is false.");
            return false;
        }
        if (toEmail == null || toEmail.trim().isEmpty()) {
            log.debug("Email sending skipped: recipient email is null/empty.");
            return false;
        }
        if (mailSender == null || mailUsername == null || mailUsername.trim().isEmpty()) {
            log.warn("Email service skipped for {}: SMTP username not configured (SPRING_MAIL_USERNAME missing).", toEmail);
            return false;
        }
        return true;
    }

    private void sendHtmlMail(String toEmail, String subject, String htmlContent) throws Exception {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());

        helper.setFrom(fromAddress, fromName);
        helper.setTo(toEmail);
        helper.setSubject(subject);
        helper.setText(htmlContent, true);

        mailSender.send(message);
    }

    // ── HTML Template Generators ──

    private String buildWelcomeHtml(String fullName, String username, String tempPassword) {
        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #333; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
                .header { background: linear-gradient(135deg, #4f46e5 0%%, #7c3aed 100%%); color: #ffffff; padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
                .header p { margin: 5px 0 0 0; opacity: 0.9; font-size: 14px; }
                .content { padding: 30px; }
                .greeting { font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 15px; }
                .credential-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 20px; margin: 20px 0; }
                .field { margin-bottom: 12px; }
                .field:last-child { margin-bottom: 0; }
                .label { font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px; }
                .value { font-size: 16px; font-weight: 600; color: #0f172a; margin-top: 2px; }
                .password-badge { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 6px 14px; border-radius: 6px; font-family: monospace; font-size: 18px; font-weight: 700; letter-spacing: 1px; }
                .notice { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 14px; color: #92400e; font-size: 13px; margin: 20px 0; }
                .btn-container { text-align: center; margin: 30px 0 10px 0; }
                .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; transition: background 0.2s; }
                .footer { background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>SafeSpace</h1>
                  <p>Student Wellness & Support Portal</p>
                </div>
                <div class="content">
                  <div class="greeting">Hello, %s! 👋</div>
                  <p>An account has been created for you on the <strong>SafeSpace</strong> platform by your institution administrator.</p>
                  
                  <div class="credential-box">
                    <div class="field">
                      <div class="label">Login ID / Username</div>
                      <div class="value">%s</div>
                    </div>
                    <div class="field" style="margin-top: 15px;">
                      <div class="label">Default Password</div>
                      <div style="margin-top: 6px;"><span class="password-badge">%s</span></div>
                    </div>
                  </div>

                  <div class="notice">
                    🔒 <strong>Security Action Required:</strong> For your security, you will be automatically prompted to change this temporary password upon your first login.
                  </div>

                  <div class="btn-container">
                    <a href="%s" class="btn">Log In to SafeSpace</a>
                  </div>
                </div>
                <div class="footer">
                  This email was sent automatically by SafeSpace System.<br>If you did not expect this email, please contact your university administrator.
                </div>
              </div>
            </body>
            </html>
            """.formatted(escapeHtml(fullName), escapeHtml(username), escapeHtml(tempPassword), escapeHtml(appUrl));
    }

    private String buildPasswordResetHtml(String fullName, String username, String newTempPassword) {
        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #333; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
                .header { background: linear-gradient(135deg, #0284c7 0%%, #2563eb 100%%); color: #ffffff; padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
                .header p { margin: 5px 0 0 0; opacity: 0.9; font-size: 14px; }
                .content { padding: 30px; }
                .greeting { font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 15px; }
                .credential-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7; border-radius: 8px; padding: 20px; margin: 20px 0; }
                .field { margin-bottom: 12px; }
                .field:last-child { margin-bottom: 0; }
                .label { font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px; }
                .value { font-size: 16px; font-weight: 600; color: #0f172a; margin-top: 2px; }
                .password-badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 6px 14px; border-radius: 6px; font-family: monospace; font-size: 18px; font-weight: 700; letter-spacing: 1px; }
                .notice { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 14px; color: #92400e; font-size: 13px; margin: 20px 0; }
                .btn-container { text-align: center; margin: 30px 0 10px 0; }
                .btn { display: inline-block; background: #0284c7; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; }
                .footer { background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>SafeSpace</h1>
                  <p>Password Reset Notification</p>
                </div>
                <div class="content">
                  <div class="greeting">Hello, %s!</div>
                  <p>Your password for <strong>SafeSpace</strong> has been reset by an administrator.</p>
                  
                  <div class="credential-box">
                    <div class="field">
                      <div class="label">Username</div>
                      <div class="value">%s</div>
                    </div>
                    <div class="field" style="margin-top: 15px;">
                      <div class="label">New Temporary Password</div>
                      <div style="margin-top: 6px;"><span class="password-badge">%s</span></div>
                    </div>
                  </div>

                  <div class="notice">
                    🔑 You must change this temporary password upon your next login.
                  </div>

                  <div class="btn-container">
                    <a href="%s" class="btn">Log In to SafeSpace</a>
                  </div>
                </div>
                <div class="footer">
                  This is an automated security email from SafeSpace.
                </div>
              </div>
            </body>
            </html>
            """.formatted(escapeHtml(fullName), escapeHtml(username), escapeHtml(newTempPassword), escapeHtml(appUrl));
    }

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace("\"", "&quot;")
                   .replace("'", "&#39;");
    }
}
