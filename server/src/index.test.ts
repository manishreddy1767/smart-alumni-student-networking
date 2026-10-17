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
});
