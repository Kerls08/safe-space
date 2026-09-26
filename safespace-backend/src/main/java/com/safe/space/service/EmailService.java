package com.safe.space.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
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
     * Send Professional Welcome & Initial Credentials (Institutional ID & Temporary Password) email asynchronously.
     * Mental health professionals (Psychometrician, Psychologist, Guidance Counselor) are provisioned by Admin
     * and must receive their official Institutional ID and temporary password to log in.
     */
    public void sendProfessionalWelcomeEmail(String toEmail, String fullName, String institutionalId, String username, String tempPassword, String designation) {
        if (!shouldSend(toEmail)) return;

        CompletableFuture.runAsync(() -> {
            try {
                String subject = "SafeSpace — Mental Health Professional Account Credentials | USTP Balubal";
                String htmlBody = buildProfessionalWelcomeHtml(fullName, institutionalId, username, tempPassword, designation);
                sendBrevoMail(toEmail, fullName, subject, htmlBody);
                log.info("Professional credentials email dispatched successfully to {} ({}) for Institutional ID {}",
                        toEmail, fullName, institutionalId);
            } catch (Exception e) {
                log.warn("Failed to send professional credentials email to {} ({}) for ID {}: {}",
                        username, toEmail, institutionalId, e.getMessage());
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

    private String resolveLoginPageUrl() {
        String base = appUrl != null && !appUrl.isBlank() ? appUrl.trim() : "http://localhost:5173";
        base = base.replaceAll("/(index|landing|login)\\.html$", "");
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/login.html";
    }

    private String buildProfessionalWelcomeHtml(String fullName, String institutionalId, String username, String tempPassword, String designation) {
        String cleanDept = (designation != null && !designation.isBlank()) ? designation.trim() : "Campus Mental Health Professional";
        
        String usernameHtml = "";
        if (username != null && !username.isBlank() && !username.equalsIgnoreCase(institutionalId)) {
            usernameHtml = """
                <div class="divider"></div>
                <div class="field">
                  <div class="label">System Username</div>
                  <div class="text-value">%s</div>
                </div>
                """.formatted(escapeHtml(username));
        }

        String loginPageUrl = resolveLoginPageUrl();
        String encodedId = URLEncoder.encode(institutionalId != null ? institutionalId.trim() : "", StandardCharsets.UTF_8);
        String directLoginLink = loginPageUrl + "?id=" + encodedId;

        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF7F2; margin: 0; padding: 28px 12px; color: #161F36; -webkit-font-smoothing: antialiased; }
                .container { max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(22, 31, 54, 0.05); border: 1px solid #E2DDD5; }
                .header { background: #161F36; color: #FFFFFF; padding: 32px 24px 26px; text-align: center; }
                .header-logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
                .header-sub { margin: 6px 0 0 0; color: #BACBD8; font-size: 12px; font-weight: 500; letter-spacing: 0.3px; }
                .role-badge { display: inline-block; background: rgba(186, 203, 216, 0.12); border: 1px solid rgba(186, 203, 216, 0.28); color: #BACBD8; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 4px 12px; border-radius: 20px; margin-top: 10px; }
                .content { padding: 32px 28px; }
                .greeting { font-size: 18px; font-weight: 700; color: #161F36; margin: 0 0 10px 0; }
                .intro { font-size: 14px; line-height: 1.6; color: #3D4D6E; margin: 0 0 20px 0; }
                .card-box { background: #FAF8F5; border: 1px solid #E2DDD5; border-radius: 10px; padding: 18px 20px; margin: 20px 0; }
                .field { padding: 6px 0; }
                .field:first-child { padding-top: 0; }
                .field:last-child { padding-bottom: 0; }
                .divider { height: 1px; background: #ECE6DB; margin: 8px 0; }
                .label { font-size: 11px; text-transform: uppercase; color: #6C7A92; font-weight: 700; letter-spacing: 0.6px; margin-bottom: 4px; }
                .id-value { font-family: 'Consolas', 'Courier New', monospace; font-size: 17px; font-weight: 700; color: #161F36; letter-spacing: 0.5px; }
                .text-value { font-size: 14px; font-weight: 600; color: #161F36; }
                .password-badge { display: inline-block; background: #FFFFFF; border: 1px solid #BACBD8; color: #161F36; padding: 7px 16px; border-radius: 6px; font-family: 'Consolas', 'Courier New', monospace; font-size: 16px; font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
                .designation-pill { display: inline-block; background: #E8EFF4; color: #161F36; border: 1px solid #BACBD8; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 6px; margin-top: 2px; }
                .notice { background: #F4F7FA; border: 1px solid #DCE4EC; border-left: 3px solid #161F36; border-radius: 6px; padding: 12px 16px; color: #3D4D6E; font-size: 13px; line-height: 1.5; margin: 20px 0; }
                .btn-container { text-align: center; margin: 28px 0 16px 0; }
                .btn { display: inline-block; background: #161F36; color: #FFFFFF !important; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(22, 31, 54, 0.15); }
                .steps-box { background: #FAF8F5; border: 1px solid #E2DDD5; border-radius: 8px; padding: 16px 20px; margin: 22px 0 0 0; font-size: 13px; line-height: 1.6; color: #3D4D6E; }
                .steps-box strong { color: #161F36; font-size: 13px; }
                .steps-box ol { margin: 8px 0 0 0; padding-left: 20px; }
                .steps-box li { margin-bottom: 5px; }
                .footer { background: #FAF8F5; padding: 20px; text-align: center; font-size: 12px; color: #6C7A92; border-top: 1px solid #E2DDD5; line-height: 1.5; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div class="header-logo">Safe<span style="color: #BACBD8;">Space</span></div>
                  <div class="header-sub">Campus Mental Health & Clinical Services Portal • USTP Balubal</div>
                  <div class="role-badge">Authorized Mental Health Professional</div>
                </div>
                <div class="content">
                  <h2 class="greeting">Dear %s,</h2>
                  <p class="intro">
                    An authorized campus mental health professional account has been provisioned for you on the <strong>SafeSpace</strong> system. 
                    Below are your official access credentials:
                  </p>

                  <div class="card-box">
                    <div class="field">
                      <div class="label">Institutional ID (Sign-In ID)</div>
                      <div class="id-value">%s</div>
                    </div>
                    %s
                    <div class="divider"></div>
                    <div class="field">
                      <div class="label">Clinical Designation / Office</div>
                      <div class="designation-pill">%s</div>
                    </div>
                    <div class="divider"></div>
                    <div class="field">
                      <div class="label">Initial Temporary Password</div>
                      <div><span class="password-badge">%s</span></div>
                    </div>
                  </div>

                  <div class="notice">
                    <strong style="color: #161F36;">First-Time Sign-In Requirement:</strong> For student record privacy and institutional security, you will be prompted to replace this temporary password with your permanent password upon your first sign-in.
                  </div>

                  <div class="btn-container">
                    <a href="%s" class="btn">Sign In to Professional Portal</a>
                  </div>

                  <div class="steps-box">
                    <strong>Quick Sign-In Instructions:</strong>
                    <ol>
                      <li>Open the SafeSpace sign-in portal via the button above.</li>
                      <li>Enter your <strong>Institutional ID</strong> (<code>%s</code>) and <strong>Temporary Password</strong>.</li>
                      <li>Set your new permanent password when prompted to access the Professional Dashboard.</li>
                    </ol>
                  </div>
                </div>
                <div class="footer">
                  <strong>Confidential Communication</strong> — SafeSpace System • USTP Balubal Guidance & Counseling Center.<br>
                  If you did not anticipate this notification, please contact the campus system administrator immediately.
                </div>
              </div>
            </body>
            </html>
            """.formatted(
                escapeHtml(fullName),
                escapeHtml(institutionalId),
                usernameHtml,
                escapeHtml(cleanDept),
                escapeHtml(tempPassword),
                escapeHtml(directLoginLink),
                escapeHtml(institutionalId)
        );
    }

    private String buildWelcomeHtml(String fullName, String username, String tempPassword) {
        String loginPageUrl = resolveLoginPageUrl();
        String encodedUser = URLEncoder.encode(username != null ? username.trim() : "", StandardCharsets.UTF_8);
        String directLoginLink = loginPageUrl + "?id=" + encodedUser;

        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF7F2; margin: 0; padding: 28px 12px; color: #161F36; -webkit-font-smoothing: antialiased; }
                .container { max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(22, 31, 54, 0.05); border: 1px solid #E2DDD5; }
                .header { background: #161F36; color: #FFFFFF; padding: 32px 24px 26px; text-align: center; }
                .header-logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
                .header-sub { margin: 6px 0 0 0; color: #BACBD8; font-size: 12px; font-weight: 500; letter-spacing: 0.3px; }
                .content { padding: 32px 28px; }
                .greeting { font-size: 18px; font-weight: 700; color: #161F36; margin: 0 0 10px 0; }
                .intro { font-size: 14px; line-height: 1.6; color: #3D4D6E; margin: 0 0 20px 0; }
                .card-box { background: #FAF8F5; border: 1px solid #E2DDD5; border-radius: 10px; padding: 18px 20px; margin: 20px 0; }
                .field { padding: 6px 0; }
                .field:first-child { padding-top: 0; }
                .field:last-child { padding-bottom: 0; }
                .divider { height: 1px; background: #ECE6DB; margin: 8px 0; }
                .label { font-size: 11px; text-transform: uppercase; color: #6C7A92; font-weight: 700; letter-spacing: 0.6px; margin-bottom: 4px; }
                .id-value { font-family: 'Consolas', 'Courier New', monospace; font-size: 17px; font-weight: 700; color: #161F36; letter-spacing: 0.5px; }
                .password-badge { display: inline-block; background: #FFFFFF; border: 1px solid #BACBD8; color: #161F36; padding: 7px 16px; border-radius: 6px; font-family: 'Consolas', 'Courier New', monospace; font-size: 16px; font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
                .notice { background: #F4F7FA; border: 1px solid #DCE4EC; border-left: 3px solid #161F36; border-radius: 6px; padding: 12px 16px; color: #3D4D6E; font-size: 13px; line-height: 1.5; margin: 20px 0; }
                .btn-container { text-align: center; margin: 28px 0 16px 0; }
                .btn { display: inline-block; background: #161F36; color: #FFFFFF !important; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(22, 31, 54, 0.15); }
                .footer { background: #FAF8F5; padding: 20px; text-align: center; font-size: 12px; color: #6C7A92; border-top: 1px solid #E2DDD5; line-height: 1.5; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div class="header-logo">Safe<span style="color: #BACBD8;">Space</span></div>
                  <div class="header-sub">Student Wellness &amp; Support Portal • USTP Balubal</div>
                </div>
                <div class="content">
                  <h2 class="greeting">Hello, %s! 👋</h2>
                  <p class="intro">
                    An account has been created for you on the <strong>SafeSpace</strong> platform by your institution administrator. Below are your login credentials:
                  </p>

                  <div class="card-box">
                    <div class="field">
                      <div class="label">Login ID / Username</div>
                      <div class="id-value">%s</div>
                    </div>
                    <div class="divider"></div>
                    <div class="field">
                      <div class="label">Default Password</div>
                      <div><span class="password-badge">%s</span></div>
                    </div>
                  </div>

                  <div class="notice">
                    <strong style="color: #161F36;">First-Time Sign-In Requirement:</strong> For your security, you will be prompted to change this temporary password upon your first sign-in.
                  </div>

                  <div class="btn-container">
                    <a href="%s" class="btn">Sign In to SafeSpace</a>
                  </div>
                </div>
                <div class="footer">
                  This email was sent automatically by SafeSpace System.<br>If you did not expect this email, please contact your university administrator.
                </div>
              </div>
            </body>
            </html>
            """.formatted(escapeHtml(fullName), escapeHtml(username), escapeHtml(tempPassword), escapeHtml(directLoginLink));
    }

    private String buildPasswordResetHtml(String fullName, String username, String newTempPassword) {
        String loginPageUrl = resolveLoginPageUrl();
        String encodedUser = URLEncoder.encode(username != null ? username.trim() : "", StandardCharsets.UTF_8);
        String directLoginLink = loginPageUrl + "?id=" + encodedUser;

        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF7F2; margin: 0; padding: 28px 12px; color: #161F36; -webkit-font-smoothing: antialiased; }
                .container { max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(22, 31, 54, 0.05); border: 1px solid #E2DDD5; }
                .header { background: #161F36; color: #FFFFFF; padding: 32px 24px 26px; text-align: center; }
                .header-logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
                .header-sub { margin: 6px 0 0 0; color: #BACBD8; font-size: 12px; font-weight: 500; letter-spacing: 0.3px; }
                .content { padding: 32px 28px; }
                .greeting { font-size: 18px; font-weight: 700; color: #161F36; margin: 0 0 10px 0; }
                .intro { font-size: 14px; line-height: 1.6; color: #3D4D6E; margin: 0 0 20px 0; }
                .card-box { background: #FAF8F5; border: 1px solid #E2DDD5; border-radius: 10px; padding: 18px 20px; margin: 20px 0; }
                .field { padding: 6px 0; }
                .field:first-child { padding-top: 0; }
                .field:last-child { padding-bottom: 0; }
                .divider { height: 1px; background: #ECE6DB; margin: 8px 0; }
                .label { font-size: 11px; text-transform: uppercase; color: #6C7A92; font-weight: 700; letter-spacing: 0.6px; margin-bottom: 4px; }
                .id-value { font-family: 'Consolas', 'Courier New', monospace; font-size: 17px; font-weight: 700; color: #161F36; letter-spacing: 0.5px; }
                .password-badge { display: inline-block; background: #FFFFFF; border: 1px solid #BACBD8; color: #161F36; padding: 7px 16px; border-radius: 6px; font-family: 'Consolas', 'Courier New', monospace; font-size: 16px; font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
                .notice { background: #F4F7FA; border: 1px solid #DCE4EC; border-left: 3px solid #161F36; border-radius: 6px; padding: 12px 16px; color: #3D4D6E; font-size: 13px; line-height: 1.5; margin: 20px 0; }
                .btn-container { text-align: center; margin: 28px 0 16px 0; }
                .btn { display: inline-block; background: #161F36; color: #FFFFFF !important; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(22, 31, 54, 0.15); }
                .footer { background: #FAF8F5; padding: 20px; text-align: center; font-size: 12px; color: #6C7A92; border-top: 1px solid #E2DDD5; line-height: 1.5; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div class="header-logo">Safe<span style="color: #BACBD8;">Space</span></div>
                  <div class="header-sub">Password Reset Notification • USTP Balubal</div>
                </div>
                <div class="content">
                  <h2 class="greeting">Hello, %s!</h2>
                  <p class="intro">
                    Your password for <strong>SafeSpace</strong> has been reset by an administrator. Below are your updated temporary credentials:
                  </p>

                  <div class="card-box">
                    <div class="field">
                      <div class="label">Username</div>
                      <div class="id-value">%s</div>
                    </div>
                    <div class="divider"></div>
                    <div class="field">
                      <div class="label">New Temporary Password</div>
                      <div><span class="password-badge">%s</span></div>
                    </div>
                  </div>

                  <div class="notice">
                    <strong style="color: #161F36;">Security Reminder:</strong> You must change this temporary password upon your next sign-in.
                  </div>

                  <div class="btn-container">
                    <a href="%s" class="btn">Sign In to SafeSpace</a>
                  </div>
                </div>
                <div class="footer">
                  This is an automated security email from SafeSpace System.
                </div>
              </div>
            </body>
            </html>
            """.formatted(escapeHtml(fullName), escapeHtml(username), escapeHtml(newTempPassword), escapeHtml(directLoginLink));
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

        String loginPageUrl = resolveLoginPageUrl();
        String encodedUser = URLEncoder.encode(username != null ? username.trim() : "", StandardCharsets.UTF_8);
        String directLoginLink = loginPageUrl + "?id=" + encodedUser;

        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF7F2; margin: 0; padding: 28px 12px; color: #161F36; -webkit-font-smoothing: antialiased; }
                .container { max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(22, 31, 54, 0.05); border: 1px solid #E2DDD5; }
                .header { background: #161F36; color: #FFFFFF; padding: 32px 24px 26px; text-align: center; }
                .header-logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
                .header-sub { margin: 6px 0 0 0; color: #BACBD8; font-size: 12px; font-weight: 500; letter-spacing: 0.3px; }
                .content { padding: 32px 28px; }
                .greeting { font-size: 18px; font-weight: 700; color: #161F36; margin: 0 0 10px 0; }
                .intro { font-size: 14px; line-height: 1.6; color: #3D4D6E; margin: 0 0 20px 0; }
                .card-box { background: #FAF8F5; border: 1px solid #E2DDD5; border-radius: 10px; padding: 18px 20px; margin: 20px 0; }
                .field { padding: 6px 0; }
                .field:first-child { padding-top: 0; }
                .field:last-child { padding-bottom: 0; }
                .divider { height: 1px; background: #ECE6DB; margin: 8px 0; }
                .label { font-size: 11px; text-transform: uppercase; color: #6C7A92; font-weight: 700; letter-spacing: 0.6px; margin-bottom: 4px; }
                .id-value { font-family: 'Consolas', 'Courier New', monospace; font-size: 17px; font-weight: 700; color: #161F36; letter-spacing: 0.5px; }
                .text-value { font-size: 14px; font-weight: 600; color: #161F36; }
                .status-badge { display: inline-block; background: #E8EFF4; color: #161F36; border: 1px solid #BACBD8; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 6px; margin-top: 2px; }
                .notice { background: #F4F7FA; border: 1px solid #DCE4EC; border-left: 3px solid #161F36; border-radius: 6px; padding: 14px 16px; margin: 18px 0; font-size: 13px; line-height: 1.5; color: #3D4D6E; }
                .notice-title { font-weight: 700; display: block; margin-bottom: 4px; color: #161F36; font-size: 13px; }
                .directory-box { background: #FAF8F5; border: 1px solid #E2DDD5; border-radius: 8px; padding: 16px 20px; margin: 20px 0; font-size: 13px; line-height: 1.6; color: #3D4D6E; }
                .directory-title { font-weight: 700; display: block; margin-bottom: 8px; color: #161F36; font-size: 13px; }
                .directory-item { margin-bottom: 5px; }
                .directory-item:last-child { margin-bottom: 0; }
                .btn-container { text-align: center; margin: 28px 0 16px 0; }
                .btn { display: inline-block; background: #161F36; color: #FFFFFF !important; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(22, 31, 54, 0.15); }
                .footer { background: #FAF8F5; padding: 20px; text-align: center; font-size: 12px; line-height: 1.5; color: #6C7A92; border-top: 1px solid #E2DDD5; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div class="header-logo">Safe<span style="color: #BACBD8;">Space</span></div>
                  <div class="header-sub">Student Wellness &amp; Mental Health Portal • USTP Balubal</div>
                </div>
                <div class="content">
                  <h2 class="greeting">Welcome to SafeSpace, %s! 👋</h2>
                  <p class="intro">
                    Your student account has been successfully registered. You now have full access to campus mental health resources, anonymous venting rooms, and confidential peer or professional counseling.
                  </p>

                  <div class="card-box">
                    <div class="field">
                      <div class="label">Institutional ID / Username</div>
                      <div class="id-value">%s</div>
                    </div>
                    <div class="divider"></div>
                    <div class="field">
                      <div class="label">Department &amp; Year Level</div>
                      <div class="text-value">%s</div>
                    </div>
                    <div class="divider"></div>
                    <div class="field">
                      <div class="label">Account Status</div>
                      <div><span class="status-badge">Active &amp; Verified</span></div>
                    </div>
                  </div>

                  <div class="notice">
                    <span class="notice-title">🔒 Confidentiality &amp; Privacy Protected</span>
                    Because you configured your private password during registration, your password is cryptographically encrypted and is never sent by email. Across public venting boards and peer chats, your real identity is completely safeguarded behind an anonymous pseudonym.
                  </div>

                  <div class="directory-box">
                    <span class="directory-title">Campus Support &amp; Emergency Directory</span>
                    <div class="directory-item"><strong>USTP Balubal Guidance Office:</strong> guidance.balubal@ustp.edu.ph</div>
                    <div class="directory-item"><strong>NCMH National Crisis Hotline:</strong> 1553 (Toll-Free Nationwide) | 0917-899-USAP (8727)</div>
                    <div class="directory-item"><strong>Hopeline Philippines:</strong> 0917-558-4673 | (02) 8804-4673</div>
                  </div>

                  <div class="btn-container">
                    <a href="%s" class="btn">Sign In to SafeSpace</a>
                  </div>
                </div>
                <div class="footer">
                  This is an automated notification confirming your registration on SafeSpace USTP Balubal.<br>
                  If you did not register for this account, please immediately inform the campus guidance center.
                </div>
              </div>
            </body>
            </html>
            """.formatted(escapeHtml(fullName), escapeHtml(username), escapeHtml(deptYearDisplay), escapeHtml(directLoginLink));
    }

    private String buildOtpEmailHtml(String fullName, String otpCode) {
        return """
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF7F2; margin: 0; padding: 28px 12px; color: #161F36; -webkit-font-smoothing: antialiased; }
                .container { max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(22, 31, 54, 0.05); border: 1px solid #E2DDD5; }
                .header { background: #161F36; color: #FFFFFF; padding: 32px 24px 26px; text-align: center; }
                .header-logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
                .header-sub { margin: 6px 0 0 0; color: #BACBD8; font-size: 12px; font-weight: 500; letter-spacing: 0.3px; }
                .content { padding: 32px 28px; text-align: center; }
                .greeting { font-size: 18px; font-weight: 700; color: #161F36; margin: 0 0 10px 0; }
                .desc { font-size: 14px; line-height: 1.6; color: #3D4D6E; margin: 0 0 20px 0; }
                .otp-box { background: #FAF8F5; border: 1px solid #BACBD8; border-radius: 10px; padding: 20px; margin: 22px 0; }
                .otp-label { font-size: 11px; text-transform: uppercase; color: #6C7A92; font-weight: 700; letter-spacing: 1px; margin-bottom: 6px; }
                .otp-code { font-family: 'Consolas', 'Courier New', monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #161F36; }
                .expiry-note { font-size: 12px; color: #6C7A92; margin-top: 6px; }
                .notice { background: #F4F7FA; border: 1px solid #DCE4EC; border-left: 3px solid #161F36; border-radius: 6px; padding: 14px 16px; margin: 20px 0; font-size: 13px; color: #3D4D6E; text-align: left; line-height: 1.5; }
                .footer { background: #FAF8F5; padding: 20px; text-align: center; font-size: 12px; line-height: 1.5; color: #6C7A92; border-top: 1px solid #E2DDD5; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div class="header-logo">Safe<span style="color: #BACBD8;">Space</span></div>
                  <div class="header-sub">Account Recovery Verification • USTP Balubal</div>
                </div>
                <div class="content">
                  <h2 class="greeting">Hello, %s! 👋</h2>
                  <div class="desc">
                    We received a request to recover your SafeSpace account. Enter the verification code below to proceed:
                  </div>

                  <div class="otp-box">
                    <div class="otp-label">Verification Code</div>
                    <div class="otp-code">%s</div>
                    <div class="expiry-note">Code expires in <strong>5 minutes</strong></div>
                  </div>

                  <div class="notice">
                    <strong style="color: #161F36;">Security Reminder:</strong> Never share this verification code with anyone. SafeSpace personnel will never ask for your code. If you did not request this, you can safely ignore this email.
                  </div>
                </div>
                <div class="footer">
                  SafeSpace USTP Balubal • Student Wellness &amp; Mental Health Portal<br>
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
