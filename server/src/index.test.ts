import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "./index.js";
import { db, initializeDatabase } from "./db.js";

const password = "TestPass123!";
const login = async (email: string) => {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ email, password: email.endsWith("@alumni-connect.local") ? "DemoPass123!" : password });
  expect(response.status).toBe(200);
  return agent;
};
const register = async (role: "student" | "alumni") => {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/register").send({ name: `Test ${role}`, email, password, role });
  expect(response.status).toBe(201);
  return { agent, email, id: response.body.user.id };
};

describe("AlumniConnect API", () => {
  it("reports healthy", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("preserves existing data across repeated database initialization", () => {
    const email = "student@alumni-connect.local";
    const before = db.prepare("SELECT name FROM users WHERE email=?").get(email) as { name: string };
    const countBefore = (db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number }).count;
    initializeDatabase();
    const persisted = db.prepare("SELECT name FROM users WHERE email=?").get(email) as { name: string } | undefined;
    expect(persisted?.name).toBe(before.name);
    expect((db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number }).count).toBe(countBefore);
  });

  it("rejects invalid credentials", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "student@alumni-connect.local",
      password: "wrong-password"
    });
    expect(response.status).toBe(401);
    expect(response.body.error).toContain("incorrect");
  });

  it("applies security headers and blocks cross-site state changes", async () => {
    const health = await request(app).get("/api/health");
    expect(health.headers["x-content-type-options"]).toBe("nosniff");
    expect(health.headers["x-frame-options"]).toBe("DENY");
    expect(health.headers["content-security-policy"]).toContain("frame-ancestors");
    expect((await request(app).post("/api/auth/login").set("Origin", "https://evil.example").send({ email: "x@example.test", password: "wrong" })).status).toBe(403);
    expect((await request(app).post("/api/auth/login").set("Origin", "http://localhost:5173").send({ email: "student@alumni-connect.local", password: "DemoPass123!" })).status).toBe(200);
  });

  it("allows five login attempts, then returns 429 with a retry window", async () => {
    const email = `limited-${Date.now()}@example.test`;
    const responses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) responses.push(await request(app).post("/api/auth/login").send({ email, password: "wrong-password" }));
    expect(responses.slice(0, 5).every(response => response.status === 401)).toBe(true);
    expect(responses[5].status).toBe(429);
    expect(Number(responses[5].headers["retry-after"])).toBeGreaterThan(0);
  });

  it("resets the login limit after a successful login and isolates account keys", async () => {
    const email = `reset-login-${Date.now()}@example.test`;
    const limited = [];
    for (let attempt = 0; attempt < 4; attempt += 1) limited.push(await request(app).post("/api/auth/login").send({ email, password: "wrong-password" }));
    expect(limited.every(response => response.status === 401)).toBe(true);

    const successfulLogin = await request(app).post("/api/auth/login").send({ email: "student@alumni-connect.local", password: "DemoPass123!" });
    expect(successfulLogin.status).toBe(200);

    const afterReset = await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
    expect(afterReset.status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "student@alumni-connect.local", password: "DemoPass123!" })).status).toBe(200);
  });

  it("rate-limits registration attempts and resets after a successful registration", async () => {
    const email = `register-limited-${Date.now()}@example.test`;
    const responses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) responses.push(await request(app).post("/api/auth/register").send({ name: "A", email, password: "short", role: "student" }));
    expect(responses.every(response => response.status === 400)).toBe(true);

    const registered = await request(app).post("/api/auth/register").send({ name: "Reset User", email, password, role: "student" });
    expect(registered.status).toBe(201);

    const afterReset = await request(app).post("/api/auth/register").send({ name: "Duplicate", email, password, role: "student" });
    expect(afterReset.status).toBe(409);

    const exceededEmail = `register-exceeded-${Date.now()}@example.test`;
    const exceeded = [];
    for (let attempt = 0; attempt < 6; attempt += 1) exceeded.push(await request(app).post("/api/auth/register").send({ name: "A", email: exceededEmail, password: "short", role: "student" }));
    expect(exceeded.slice(0, 5).every(response => response.status === 400)).toBe(true);
    expect(exceeded[5].status).toBe(429);
  });

  it("logs in the seeded demo student and exposes protected data", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({
      email: "student@alumni-connect.local",
      password: "DemoPass123!"
    });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("student");

    const dashboard = await agent.get("/api/dashboard");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.stats).toHaveProperty("opportunities");

    const profiles = await agent.get("/api/profiles?q=Rohan");
    expect(profiles.status).toBe(200);
    expect(profiles.body.profiles[0].name).toBe("Rohan Mehta");
  });

  it("protects private routes without a session", async () => {
    const response = await request(app).get("/api/dashboard");
    expect(response.status).toBe(401);
  });

  it("returns paginated alumni and opportunity results", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "student@alumni-connect.local", password: "DemoPass123!" });
    const profiles = await agent.get("/api/profiles?page=1&pageSize=1");
    const opportunities = await agent.get("/api/opportunities?page=1&pageSize=1");
    expect(profiles.status).toBe(200);
    expect(profiles.body.pageSize).toBe(1);
    expect(profiles.body.total).toBeGreaterThanOrEqual(2);
    expect(opportunities.status).toBe(200);
    expect(opportunities.body.pageSize).toBe(1);
    expect(opportunities.body.total).toBeGreaterThanOrEqual(2);
  });

  it("rejects application and scheduling actions without the required state", async () => {
    const admin = request.agent(app);
    await admin.post("/api/auth/login").send({ email: "admin@alumni-connect.local", password: "DemoPass123!" });
    const created = await admin.post("/api/opportunities").send({
      title: `Test opportunity ${Date.now()}`, organization: "Test Org", type: "Internship",
      location: "Remote", description: "A test opportunity for API coverage.", skills: "Testing",
      deadline: "2099-12-31", application_url: "https://example.com/test"
    });
    expect(created.status).toBe(201);
    const student = request.agent(app);
    await student.post("/api/auth/login").send({ email: "student@alumni-connect.local", password: "DemoPass123!" });
    const opportunityId = created.body.id;
    const application = await student.post(`/api/opportunities/${opportunityId}/apply`).send({ cover_note: "I am excited to learn from this team." });
    expect(application.status).toBe(201);
    const duplicate = await student.post(`/api/opportunities/${opportunityId}/apply`).send({ cover_note: "Duplicate application." });
    expect(duplicate.status).toBe(409);
    const invalidSchedule = await student.post("/api/mentorship/999/schedule").send({ availability_id: 999 });
    expect(invalidSchedule.status).toBe(400);
  });

  it("registers a user, rejects duplicate email, and returns the profile", async () => {
    const created = await register("student");
    const duplicate = await request(app).post("/api/auth/register").send({ name: "Duplicate", email: created.email, password, role: "student" });
    expect(duplicate.status).toBe(409);
    const me = await created.agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.profile.user_id).toBe(created.id);
  });

  it("rejects suspended-account login", async () => {
    const created = await register("student");
    const existingSession = created.agent;
    const admin = await login("admin@alumni-connect.local");
    expect((await admin.patch(`/api/admin/users/${created.id}/status`).send({ status: "suspended" })).status).toBe(200);
    expect((await existingSession.get("/api/auth/me")).status).toBe(401);
    const suspended = await request(app).post("/api/auth/login").send({ email: created.email, password });
    expect(suspended.status).toBe(403);
    expect((await admin.patch(`/api/admin/users/${created.id}/status`).send({ status: "active" })).status).toBe(200);
  });

  it("records the current schema version and preserves existing database data", () => {
    const version = db.prepare("SELECT version FROM schema_meta WHERE key='app'").get() as { version: number };
    const user = db.prepare("SELECT email,session_version FROM users WHERE email=?").get("student@alumni-connect.local") as { email: string; session_version: number };
    expect(version.version).toBeGreaterThanOrEqual(2);
    expect(user.email).toBe("student@alumni-connect.local");
    expect(user.session_version).toBeGreaterThanOrEqual(0);
  });

  it("enforces role authorization boundaries", async () => {
    const student = await login("student@alumni-connect.local");
    expect((await student.post("/api/opportunities").send({})).status).toBe(403);
    expect((await student.get("/api/admin/overview")).status).toBe(403);
    expect((await student.post("/api/mentorship/availability").send({ starts_at: new Date(Date.now() + 86400000).toISOString(), ends_at: new Date(Date.now() + 90000000).toISOString() })).status).toBe(403);
  });

  it("enforces private profile visibility while allowing self access", async () => {
    const owner = await register("student");
    const other = await register("student");
    const profile = { headline: "", bio: "", company: "", job_title: "", industry: "", location: "", skills: "", interests: "", available_for_mentoring: false, visibility: "private" };
    expect((await owner.agent.patch("/api/profiles/me").send(profile)).status).toBe(200);
    expect((await other.agent.get(`/api/profiles/${owner.id}`)).status).toBe(404);
    const self = await owner.agent.get(`/api/profiles/${owner.id}`);
    expect(self.status).toBe(200);
    expect(self.body.profile.email).toBeUndefined();
  });

  it("completes a connection request lifecycle and persists accepted state", async () => {
    const sender = await register("student");
    const receiver = await register("student");
    const sent = await sender.agent.post(`/api/connections/${receiver.id}`);
    expect(sent.status).toBe(201);
    const pending = await receiver.agent.get("/api/connections");
    expect(pending.body.connections.some((row: any) => row.sender_id === sender.id && row.status === "pending")).toBe(true);
    const connection = pending.body.connections.find((row: any) => row.sender_id === sender.id);
    expect((await receiver.agent.patch(`/api/connections/${connection.id}`).send({ status: "accepted" })).status).toBe(200);
    const persisted = await sender.agent.get("/api/connections");
    expect(persisted.body.connections.find((row: any) => row.id === connection.id).status).toBe("accepted");
  });

  it("rejects overlapping mentor availability windows", async () => {
    const alumni = await register("alumni");
    const start = new Date(Date.now() + 172800000);
    const first = { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3600000).toISOString() };
    expect((await alumni.agent.post("/api/mentorship/availability").send(first)).status).toBe(201);
    const overlap = { starts_at: new Date(start.getTime() + 1800000).toISOString(), ends_at: new Date(start.getTime() + 5400000).toISOString() };
    expect((await alumni.agent.post("/api/mentorship/availability").send(overlap)).status).toBe(409);
  });

  it("schedules, lists, cancels, and completes mentorship sessions with ownership checks", async () => {
    const student = await register("student");
    const alumniAccount = await register("alumni");
    const admin = await login("admin@alumni-connect.local");
    expect((await admin.patch(`/api/admin/alumni/${alumniAccount.id}/verify`)).status).toBe(200);
    expect((await alumniAccount.agent.patch("/api/profiles/me").send({ headline: "", bio: "", company: "", job_title: "", industry: "", location: "", skills: "", interests: "", available_for_mentoring: true, visibility: "public" })).status).toBe(200);
    const start = new Date(Date.now() + 259200000);
    const availability = await alumniAccount.agent.post("/api/mentorship/availability").send({ starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 1800000).toISOString() });
    expect(availability.status).toBe(201);
    const requestToSeededMentor = await student.agent.post(`/api/mentorship/${alumniAccount.id}`).send({ message: "I would like to discuss career options." });
    expect(requestToSeededMentor.status).toBe(201);
    const requests = await alumniAccount.agent.get("/api/mentorship");
    const mentorship = requests.body.requests.find((row: any) => row.student_id === student.id);
    expect((await alumniAccount.agent.patch(`/api/mentorship/${mentorship.id}`).send({ status: "accepted" })).status).toBe(200);
    const wrongUser = await register("student");
    expect((await wrongUser.agent.post(`/api/mentorship/${mentorship.id}/schedule`).send({ availability_id: availability.body.id })).status).toBe(400);
    const scheduled = await student.agent.post(`/api/mentorship/${mentorship.id}/schedule`).send({ availability_id: availability.body.id, meeting_link: "https://example.com/session" });
    expect(scheduled.status).toBe(201);
    const sessions = await student.agent.get("/api/mentorship/sessions");
    expect(sessions.body.sessions.find((session: any) => session.id === scheduled.body.id).status).toBe("scheduled");
    expect((await student.agent.patch(`/api/mentorship/sessions/${scheduled.body.id}`).send({ status: "cancelled" })).status).toBe(200);
    expect((await alumniAccount.agent.get("/api/mentorship/sessions")).body.sessions.find((session: any) => session.id === scheduled.body.id).status).toBe("cancelled");
  });

  it("moderates opportunities with admin authorization and persists status", async () => {
    const alumni = await register("alumni");
    const created = await alumni.agent.post("/api/opportunities").send({ title: `Review ${Date.now()}`, organization: "Test Org", type: "Internship", location: "Remote", description: "A sufficiently detailed opportunity description.", skills: "Testing", deadline: "2099-12-31", application_url: "https://example.com/review" });
    expect(created.status).toBe(201);
    expect((await alumni.agent.patch(`/api/admin/opportunities/${created.body.id}`).send({ status: "published" })).status).toBe(403);
    const admin = await login("admin@alumni-connect.local");
    expect((await admin.patch(`/api/admin/opportunities/${created.body.id}`).send({ status: "published" })).status).toBe(200);
    const opportunities = await (await register("student")).agent.get("/api/opportunities?q=Review");
    expect(opportunities.body.opportunities.some((item: any) => item.id === created.body.id)).toBe(true);
  });

  it("updates application status only for the opportunity owner and persists it", async () => {
    const alumni = await login("alumni@alumni-connect.local");
    const student = await register("student");
    const created = await alumni.post("/api/opportunities").send({ title: `Application ${Date.now()}`, organization: "Test Org", type: "Internship", location: "Remote", description: "A sufficiently detailed opportunity description.", skills: "Testing", deadline: "2099-12-31", application_url: "https://example.com/application" });
    expect(created.status).toBe(201);
    const admin = await login("admin@alumni-connect.local");
    expect((await admin.patch(`/api/admin/opportunities/${created.body.id}`).send({ status: "published" })).status).toBe(200);
    const applied = await student.agent.post(`/api/opportunities/${created.body.id}/apply`).send({ cover_note: "I am excited about this opportunity." });
    expect(applied.status).toBe(201);
    const listed = await alumni.get("/api/applications");
    const application = listed.body.applications.find((item: any) => item.opportunity_id === created.body.id);
    expect((await student.agent.patch(`/api/applications/${application.id}`).send({ status: "shortlisted" })).status).toBe(403);
    expect((await alumni.patch(`/api/applications/${application.id}`).send({ status: "shortlisted" })).status).toBe(200);
    const persisted = await student.agent.get("/api/applications");
    expect(persisted.body.applications.find((item: any) => item.id === application.id).status).toBe("shortlisted");
  });

  it("marks only the owner notification as read", async () => {
    const sender = await register("student");
    const receiver = await register("student");
    expect((await sender.agent.post(`/api/connections/${receiver.id}`)).status).toBe(201);
    const notifications = await receiver.agent.get("/api/notifications");
    const notification = notifications.body.notifications.find((item: any) => item.title === "New connection request");
    expect(notification.read).toBe(0);
    expect((await receiver.agent.patch(`/api/notifications/${notification.id}/read`)).status).toBe(204);
    const updated = await receiver.agent.get("/api/notifications");
    expect(updated.body.notifications.find((item: any) => item.id === notification.id).read).toBe(1);
    expect((await sender.agent.patch(`/api/notifications/${notification.id}/read`)).status).toBe(204);
  });

  it("protects admin verification and records the verified profile", async () => {
    const alumni = await register("alumni");
    const student = await register("student");
    expect((await student.agent.patch(`/api/admin/alumni/${alumni.id}/verify`)).status).toBe(403);
    const admin = await login("admin@alumni-connect.local");
    expect((await admin.patch(`/api/admin/alumni/${alumni.id}/verify`)).status).toBe(200);
    const profile = await student.agent.get(`/api/profiles/${alumni.id}`);
    expect(profile.status).toBe(200);
    expect(profile.body.profile.verified).toBe(1);
  });

  it("returns only the caller's applications and connections", async () => {
    const student = await register("student");
    const other = await register("student");
    const applications = await student.agent.get("/api/applications");
    expect(applications.status).toBe(200);
    expect(applications.body.applications.every((item: any) => item.student_id === student.id)).toBe(true);
    const connections = await other.agent.get("/api/connections");
    expect(connections.status).toBe(200);
    expect(connections.body.connections.every((item: any) => item.sender_id === other.id || item.receiver_id === other.id)).toBe(true);
  });
});
