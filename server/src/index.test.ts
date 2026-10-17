import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "./index.js";

describe("AlumniConnect API", () => {
  it("reports healthy", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("rejects invalid credentials", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "student@alumni-connect.local",
      password: "wrong-password"
    });
    expect(response.status).toBe(401);
    expect(response.body.error).toContain("incorrect");
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
});
