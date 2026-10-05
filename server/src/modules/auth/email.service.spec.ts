import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EmailDeliveryError, EmailService, escapeHtml, frontendBaseUrl } from "./email.service";

describe("escapeHtml", () => {
  it("neutralises markup typed into a name field", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'o'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;o&#39;",
    );
  });
});

describe("frontendBaseUrl", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("uses FRONTEND_URL and strips trailing slashes", () => {
    process.env.FRONTEND_URL = "https://portal.example.com//";
    expect(frontendBaseUrl()).toBe("https://portal.example.com");
  });

  it("falls back to the first FRONTEND_URLS entry so links never read 'undefined/...'", () => {
    delete process.env.FRONTEND_URL;
    process.env.FRONTEND_URLS = "https://a.example.com, https://b.example.com";
    expect(frontendBaseUrl()).toBe("https://a.example.com");
  });
});

describe("EmailService", () => {
  const saved = { ...process.env };
  const service = new EmailService();

  beforeEach(() => {
    jest.spyOn((service as any).logger, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  it("describes failures without leaking configuration", () => {
    expect(service.describeFailure({ code: "EAUTH" })).toMatch(/rejected the sign-in/);
    expect(service.describeFailure({ responseCode: 535 })).toMatch(/rejected the sign-in/);
    expect(service.describeFailure({ code: "ECONNECTION" })).toMatch(/could not be reached/);
    expect(service.describeFailure({ code: "ETIMEDOUT" })).toMatch(/could not be reached/);
    expect(service.describeFailure({ responseCode: 550 })).toMatch(/recipient address was rejected/);
    expect(service.describeFailure({ responseCode: 421 })).toMatch(/limiting sending/);
    expect(service.describeFailure(new Error("Missing email configuration: SMTP_HOST, SMTP_PASS"))).toBe(
      "Email is not configured on the server",
    );
    expect(service.describeFailure(new Error("boom"))).toBe("Email delivery failed");
  });

  it("trySend reports a failure instead of throwing when email is not configured", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    await expect(service.trySend("a@b.test", "Hi", "<p>Hi</p>")).resolves.toEqual({
      sent: false,
      reason: "Email is not configured on the server",
    });
  });

  it("sendEmail still throws for flows where the user must know it failed", async () => {
    delete process.env.SMTP_HOST;
    await expect(service.sendEmail("a@b.test", "Hi", "<p>Hi</p>")).rejects.toBeInstanceOf(EmailDeliveryError);
  });
});
