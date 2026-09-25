package com.safe.space.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

/**
 * Brevo REST API Email & SMS Dispatch Service.
 *
 * Handles asynchronous transactional delivery for:
 *   1. Account Welcome & Credential Provisioning
 *   2. Admin-initiated Password Reset Notifications
 *   3. Student Registration Confirmation (Email & Welcome SMS)
 *   4. Forgot Password 6-Digit OTP (Email & SMS)
 *
 * Connects via Brevo HTTP API v3 over standard HTTPS (Port 443).
 */
@Service
@Slf4j
public class EmailService {

    private static final String BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
    private static final String BREVO_SMS_API_URL = "https://api.brevo.com/v3/transactionalSMS/sms";

    private final HttpClient httpClient;

    @Value("${safespace.mail.from-address:acoymo.kerlsan08@gmail.com}")
    private String fromAddress;

    @Value("${safespace.mail.from-name:SafeSpace System}")
    private String fromName;

    @Value("${safespace.mail.app-url:http://localhost:5173}")
    private String appUrl;

    @Value("${safespace.mail.enabled:true}")
    private boolean mailEnabled;

    @Value("${safespace.mail.api-key:${BREVO_API_KEY:}}")
    private String apiKey;

    public EmailService() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    @PostConstruct
    public void init() {
        if (apiKey == null || apiKey.isBlank()) {
            apiKey = System.getProperty("BREVO_API_KEY");
            if (apiKey == null || apiKey.isBlank()) {
                apiKey = System.getenv("BREVO_API_KEY");
            }
        }
        if (apiKey != null && !apiKey.isBlank()) {
            log.info("✅ EmailService initialized with Brevo API key: {}...", apiKey.substring(0, Math.min(12, apiKey.length())));
        } else {
            log.warn("⚠️ EmailService initialized WITHOUT Brevo API key. Check safespace-backend/.env or BREVO_API_KEY.");
        }
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
                sendBrevoMail(toEmail, fullName, subject, htmlBody);
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
                sendBrevoMail(toEmail, fullName, subject, htmlBody);
            } catch (Exception e) {
                log.warn("Failed to send password reset email to {} ({}): {}", username, toEmail, e.getMessage());
            }
        });
    }

    /**
     * Send Self-Registration Confirmation notification email asynchronously.
     * Note: Plaintext passwords are NEVER sent since students configure their own password.
     */
    public void sendRegistrationConfirmationEmail(String toEmail, String fullName, String username, String department, String yearLevel) {
        if (!shouldSend(toEmail)) return;

        CompletableFuture.runAsync(() -> {
            try {
                String subject = "SafeSpace — Registration Confirmed | USTP Balubal";
                String htmlBody = buildRegistrationConfirmationHtml(fullName, username, department, yearLevel);
                sendBrevoMail(toEmail, fullName, subject, htmlBody);
            } catch (Exception e) {
                log.warn("Failed to send registration confirmation email to {} ({}): {}", username, toEmail, e.getMessage());
            }
        });
    }

    /**
     * Send 6-digit Password Reset OTP Code via Email asynchronously.
     */
    public void sendOtpEmail(String toEmail, String fullName, String otpCode) {
        if (!shouldSend(toEmail)) return;

        CompletableFuture.runAsync(() -> {
            try {
                String subject = "SafeSpace — Password Recovery Code: " + otpCode;
                String htmlBody = buildOtpEmailHtml(fullName, otpCode);
                sendBrevoMail(toEmail, fullName, subject, htmlBody);
            } catch (Exception e) {
                log.warn("Failed to send OTP email to {}: {}", toEmail, e.getMessage());
            }
        });
    }

    /**
     * Send Student Registration Welcome SMS notification asynchronously.
     */
    public void sendStudentRegistrationWelcomeSms(String rawPhoneNumber, String fullName, String username) {
        if (rawPhoneNumber == null || rawPhoneNumber.isBlank()) {
            log.warn("Student welcome SMS skipped: phone number is null/empty.");
            return;
        }

        String normalizedPhone = normalizePhilippinePhone(rawPhoneNumber);
        String maskedPhone = maskPhoneNumber(normalizedPhone);
        String firstName = (fullName != null && !fullName.isBlank()) ? fullName.trim().split("\\s+")[0] : "Student";

        String message = "SafeSpace: Welcome, " + firstName + "! Your account (" + username + ") is registered. Mental health & peer support is always here for you.";

        // Always log prominently to dev console for local testing / audit:
        log.info("===============================================================================");
        log.info("📢 [STUDENT WELCOME SMS - LOCAL / AUDIT LOG]");
        log.info("   Target Phone: {} (Raw: {})", maskedPhone, rawPhoneNumber);
        log.info("   Student: {} ({})", fullName, username);
        log.info("   Message: {}", message);
        log.info("===============================================================================");

        if (apiKey == null || apiKey.trim().isEmpty() || !mailEnabled) {
            log.info("Brevo API key not configured or mail disabled. Simulated welcome SMS logged above.");
            return;
        }

        CompletableFuture.runAsync(() -> {
            try {
                sendBrevoSmsMessage(normalizedPhone, message);
            } catch (Exception e) {
                log.warn("Brevo SMS delivery attempt for {} failed: {}. (Welcome SMS logged above for dev testing)", maskedPhone, e.getMessage());
            }
        });
    }

    /**
     * Send 6-digit Password Reset OTP Code via SMS asynchronously.
     * Attempts Brevo Transactional SMS if API key / credits are available.
     * Always provides a development console fallback log for seamless local testing.
     */
    public void sendOtpSms(String rawPhoneNumber, String otpCode) {
        if (rawPhoneNumber == null || rawPhoneNumber.isBlank()) {
            log.warn("SMS OTP dispatch skipped: phone number is null/empty.");
            return;
        }

        String normalizedPhone = normalizePhilippinePhone(rawPhoneNumber);
        String maskedPhone = maskPhoneNumber(normalizedPhone);

        // Always log prominently to dev console for local testing:
        log.info("===============================================================================");
        log.info("📢 [SMS OTP DISPATCH - LOCAL / AUDIT LOG]");
        log.info("   Target Phone: {} (Raw: {})", maskedPhone, rawPhoneNumber);
        log.info("   6-Digit OTP Code: >>> {} <<<", otpCode);
        log.info("   Message: SafeSpace verification code: {}. Valid for 5 minutes.", otpCode);
        log.info("===============================================================================");

        if (apiKey == null || apiKey.trim().isEmpty() || !mailEnabled) {
            log.info("Brevo API key not configured or mail disabled. Simulated SMS logged above.");
            return;
        }

        CompletableFuture.runAsync(() -> {
            try {
                String messageContent = "SafeSpace: Your password recovery code is " + otpCode + ". Valid for 5 minutes. Do not share this code.";
                sendBrevoSmsMessage(normalizedPhone, messageContent);
            } catch (Exception e) {
                log.warn("Brevo SMS delivery attempt for {} failed: {}. (OTP is logged above for dev testing)", maskedPhone, e.getMessage());
            }
        });
    }

    private void sendBrevoSmsMessage(String recipientPhone, String messageContent) throws Exception {
        String jsonBody = """
            {
              "type": "transactional",
              "unicodeEnabled": false,
              "sender": "SafeSpace",
              "recipient": "%s",
              "content": "%s"
            }
            """.formatted(
                escapeJson(recipientPhone),
                escapeJson(messageContent)
        );

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BREVO_SMS_API_URL))
                .header("accept", "application/json")
                .header("content-type", "application/json")
                .header("api-key", apiKey.trim())
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .timeout(Duration.ofSeconds(15))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            log.info("✅ SMS dispatched successfully to {} via Brevo (HTTP {}): {}", recipientPhone, response.statusCode(), response.body());
        } else {
            log.warn("⚠️ Brevo SMS API returned HTTP {}: {}. Dev audit log above can be used for testing.", response.statusCode(), response.body());
            if (response.body() != null && response.body().contains("No sms related addons")) {
                log.warn("👉 [BREVO NOTICE]: Brevo account does not have SMS credits enabled. To deliver real SMS to mobile phones, prepaid SMS credits must be purchased in Brevo (Usage and plan -> Addons -> SMS credits).");
            }
        }
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
        if (apiKey == null || apiKey.trim().isEmpty()) {
            log.warn("Email service skipped for {}: Brevo API key not configured (BREVO_API_KEY missing).", toEmail);
            return false;
        }
        return true;
    }

    private void sendBrevoMail(String toEmail, String recipientName, String subject, String htmlContent) throws Exception {
        String displayName = (recipientName != null && !recipientName.isBlank()) ? recipientName.trim() : toEmail;

        String jsonBody = """
            {
              "sender": {
                "name": "%s",
                "email": "%s"
              },
              "to": [
                {
                  "email": "%s",
                  "name": "%s"
                }
              ],
              "subject": "%s",
              "htmlContent": "%s"
            }
            """.formatted(
                escapeJson(fromName),
                escapeJson(fromAddress),
                escapeJson(toEmail.trim()),
                escapeJson(displayName),
                escapeJson(subject),
                escapeJson(htmlContent)
        );

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BREVO_API_URL))
                .header("accept", "application/json")
                .header("content-type", "application/json")
                .header("api-key", apiKey.trim())
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .timeout(Duration.ofSeconds(15))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            log.info("Email dispatched successfully to {} via Brevo REST API (HTTP {}): {}", toEmail, response.statusCode(), response.body());
        } else {
            log.error("Failed to dispatch email to {} via Brevo REST API. HTTP status: {}, response body: {}",
                    toEmail, response.statusCode(), response.body());
        }
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

    private String buildRegistrationConfirmationHtml(String fullName, String username, String department, String yearLevel) {
        String deptYearDisplay = "";
        if (department != null && !department.isBlank()) {
            deptYearDisplay += department.trim();
        }
        if (yearLevel != null && !yearLevel.isBlank()) {
            deptYearDisplay += (deptYearDisplay.isEmpty() ? "" : " • ") + yearLevel.trim();
        }
        if (deptYearDisplay.isEmpty()) {
            deptYearDisplay = "USTP Balubal Student";
        }

        String loginUrl = appUrl != null && !appUrl.isBlank() ? appUrl.trim() : "http://localhost:5173";
        if (!loginUrl.endsWith(".html")) {
            if (loginUrl.endsWith("/")) {
                loginUrl += "login.html";
            } else {
                loginUrl += "/login.html";
            }
        }

        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
                .header { background: linear-gradient(135deg, #1e5e3a 0%%, #2d7d46 50%%, #3f9b5c 100%%); color: #ffffff; padding: 36px 24px 30px; text-align: center; }
                .header-logo { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
                .header-sub { margin: 6px 0 0 0; opacity: 0.92; font-size: 13px; font-weight: 400; letter-spacing: 0.3px; }
                .content { padding: 32px 28px; }
                .greeting { font-size: 19px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
                .intro { font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 22px; }
                .card-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2d7d46; border-radius: 10px; padding: 18px 20px; margin: 20px 0; }
                .field { margin-bottom: 10px; }
                .field:last-child { margin-bottom: 0; }
                .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px; }
                .value { font-size: 15px; font-weight: 600; color: #0f172a; margin-top: 2px; }
                .badge-active { display: inline-block; background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 20px; }
                
                .security-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 15px 18px; margin: 18px 0; font-size: 13px; line-height: 1.5; color: #1e40af; }
                .security-title { font-weight: 700; display: block; margin-bottom: 4px; color: #1e3a8a; }
                
                .privacy-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 15px 18px; margin: 18px 0; font-size: 13px; line-height: 1.5; color: #166534; }
                .privacy-title { font-weight: 700; display: block; margin-bottom: 4px; color: #14532d; }
                
                .crisis-box { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; padding: 16px 18px; margin: 22px 0; font-size: 13px; color: #92400e; }
                .crisis-title { font-weight: 700; display: block; margin-bottom: 8px; color: #78350f; font-size: 14px; }
                .crisis-item { margin-bottom: 6px; line-height: 1.4; }
                .crisis-item:last-child { margin-bottom: 0; }
                
                .btn-container { text-align: center; margin: 30px 0 15px 0; }
                .btn { display: inline-block; background: #2d7d46; color: #ffffff !important; text-decoration: none; padding: 14px 34px; border-radius: 10px; font-weight: 700; font-size: 15px; }
                .footer { background: #f8fafc; padding: 22px; text-align: center; font-size: 12px; line-height: 1.5; color: #64748b; border-top: 1px solid #e2e8f0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div class="header-logo">SafeSpace</div>
                  <div class="header-sub">Student Wellness &amp; Mental Health Portal • USTP Balubal</div>
                </div>
                <div class="content">
                  <div class="greeting">Welcome to SafeSpace, %s! 👋</div>
                  <div class="intro">
                    Your student account has been successfully registered. You now have full access to our campus mental health resources, anonymous venting rooms, and confidential peer or professional counseling.
                  </div>
                  
                  <div class="card-box">
                    <div class="field">
                      <div class="label">Institutional ID / Username</div>
                      <div class="value">%s</div>
                    </div>
                    <div class="field" style="margin-top: 12px;">
                      <div class="label">Department &amp; Year Level</div>
                      <div class="value">%s</div>
                    </div>
                    <div class="field" style="margin-top: 12px;">
                      <div class="label">Account Status</div>
                      <div style="margin-top: 4px;"><span class="badge-active">● Active &amp; Verified</span></div>
                    </div>
                  </div>

                  <div class="security-box">
                    <span class="security-title">🔒 Password Security Notice</span>
                    Because you configured your own private password during registration, your password is cryptographically encrypted and is <strong>never</strong> transmitted by email or viewable by anyone. Please keep your login credentials private.
                  </div>

                  <div class="privacy-box">
                    <span class="privacy-title">🛡️ Confidentiality &amp; Anonymity Protected</span>
                    SafeSpace is your trusted sanctuary. When you participate in community discussions or seek peer support, your real identity is completely hidden behind an anonymous pseudonym.
                  </div>

                  <div class="crisis-box">
                    <span class="crisis-title">📞 24/7 Emergency Support Directory</span>
                    <div class="crisis-item"><strong>USTP Balubal Guidance Office:</strong> guidance.balubal@ustp.edu.ph</div>
                    <div class="crisis-item"><strong>NCMH Crisis Hotline:</strong> 1553 (Toll-Free Nationwide) | 0917-899-USAP (8727)</div>
                    <div class="crisis-item"><strong>Hopeline Philippines:</strong> 0917-558-4673 | (02) 8804-4673</div>
                  </div>

                  <div class="btn-container">
                    <a href="%s" class="btn">Log In to SafeSpace</a>
                  </div>
                </div>
                <div class="footer">
                  This is an automated notification confirming your registration on SafeSpace USTP Balubal.<br>
                  If you did not register for this account, please immediately inform the campus guidance center.
                </div>
              </div>
            </body>
            </html>
            """.formatted(escapeHtml(fullName), escapeHtml(username), escapeHtml(deptYearDisplay), escapeHtml(loginUrl));
    }

    private String buildOtpEmailHtml(String fullName, String otpCode) {
        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
                .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
                .header { background: linear-gradient(135deg, #1e5e3a 0%%, #2d7d46 100%%); color: #ffffff; padding: 32px 24px 26px; text-align: center; }
                .header-logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
                .header-sub { margin: 6px 0 0 0; opacity: 0.92; font-size: 13px; font-weight: 400; }
                .content { padding: 32px 28px; text-align: center; }
                .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
                .desc { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
                .otp-box { background: #f0fdf4; border: 2px dashed #86efac; border-radius: 12px; padding: 20px; margin: 24px 0; }
                .otp-label { font-size: 11px; text-transform: uppercase; color: #166534; font-weight: 700; letter-spacing: 1px; margin-bottom: 8px; }
                .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #166534; }
                .expiry-note { font-size: 12px; color: #64748b; margin-top: 8px; }
                .warning-box { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; padding: 14px 18px; margin: 20px 0; font-size: 13px; color: #92400e; text-align: left; line-height: 1.5; }
                .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; line-height: 1.5; color: #64748b; border-top: 1px solid #e2e8f0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div class="header-logo">SafeSpace</div>
                  <div class="header-sub">Account Recovery Verification • USTP Balubal</div>
                </div>
                <div class="content">
                  <div class="greeting">Hello, %s! 👋</div>
                  <div class="desc">
                    We received a request to reset the password for your SafeSpace account. Enter the verification code below to proceed with resetting your password:
                  </div>

                  <div class="otp-box">
                    <div class="otp-label">Verification Code</div>
                    <div class="otp-code">%s</div>
                    <div class="expiry-note">⏱️ Code expires in <strong>5 minutes</strong></div>
                  </div>

                  <div class="warning-box">
                    <strong>🔒 Security Reminder:</strong> Never share this verification code with anyone. SafeSpace counselors and administrators will never ask for your code or password. If you did not request a password reset, you can safely ignore this email.
                  </div>
                </div>
                <div class="footer">
                  SafeSpace USTP Balubal • Student Wellness &amp; Mental Health Initiative<br>
                  This is an automated security message.
                </div>
              </div>
            </body>
            </html>
            """.formatted(escapeHtml(fullName), escapeHtml(otpCode));
    }

    public static String normalizePhilippinePhone(String raw) {
        if (raw == null) return "";
        String digits = raw.replaceAll("[^0-9+]", "");
        if (digits.startsWith("+63")) {
            return digits;
        }
        if (digits.startsWith("63") && digits.length() >= 12) {
            return "+" + digits;
        }
        if (digits.startsWith("09") && digits.length() == 11) {
            return "+63" + digits.substring(1);
        }
        if (digits.startsWith("9") && digits.length() == 10) {
            return "+63" + digits;
        }
        return digits.startsWith("+") ? digits : "+" + digits;
    }

    public static String maskPhoneNumber(String phone) {
        if (phone == null || phone.isBlank()) return null;
        String clean = phone.trim();
        if (clean.length() < 7) return "***";
        int len = clean.length();
        return clean.substring(0, Math.min(4, len)) + "******" + clean.substring(Math.max(0, len - 3));
    }

    public static String maskEmail(String email) {
        if (email == null || email.isBlank() || !email.contains("@")) return null;
        String[] parts = email.trim().split("@", 2);
        String name = parts[0];
        String domain = parts[1];
        if (name.length() <= 2) {
            return name.charAt(0) + "***@" + domain;
        }
        return name.charAt(0) + "***" + name.charAt(name.length() - 1) + "@" + domain;
    }

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace("\"", "&quot;")
                   .replace("'", "&#39;");
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c <= 0x1F) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.toString();
    }
}
