import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import { db, initializeDatabase } from "./db.js";

initializeDatabase();
const app = express();
const JWT_SECRET = process.env.JWT_SECRET ?? "local-development-secret-change-me";
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

type AuthRequest = Request & { user?: { id: number; role: string; name: string; email: string } };
const auth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ error: "Please sign in to continue." });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthRequest["user"];
    next();
  } catch { return res.status(401).json({ error: "Your session has expired. Please sign in again." }); }
};
const role = (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "You do not have permission for this action." });
  next();
};
const safeUser = (user: Record<string, unknown>) => ({ id: user.id, email: user.email, name: user.name, role: user.role, status: user.status });
const profileFor = (userId: number) => db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId);
const notify = (userId: number, title: string, body: string) => db.prepare("INSERT INTO notifications (user_id,title,body) VALUES (?,?,?)").run(userId, title, body);
const parseSkills = (value: unknown) => String(value ?? "").split(",").map(s => s.trim()).filter(Boolean);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.post("/api/auth/register", (req, res) => {
  const parsed = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), role: z.enum(["student", "alumni"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a name, valid email, and password of at least 8 characters." });
  const { name, email, password, role: userRole } = parsed.data;
  try {
    const result = db.prepare("INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)").run(email.toLowerCase(), bcrypt.hashSync(password, 10), name, userRole);
    const id = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO profiles (user_id,headline,verified) VALUES (?,?,?)").run(id, userRole === "student" ? "New student member" : "Alumni profile awaiting verification", userRole === "student" ? 1 : 0);
    const token = jwt.sign({ id, email: email.toLowerCase(), name, role: userRole }, JWT_SECRET, { expiresIn: "2h" });
    res.cookie("session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7200000 });
    return res.status(201).json({ user: { id, email: email.toLowerCase(), name, role: userRole, status: "active" } });
  } catch (error) {
    if (String(error).includes("UNIQUE")) return res.status(409).json({ error: "An account with that email already exists." });
    return res.status(500).json({ error: "Unable to create your account right now." });
  }
});
app.post("/api/auth/login", (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(parsed.data.email.toLowerCase()) as Record<string, unknown> | undefined;
  if (!user || !bcrypt.compareSync(parsed.data.password, String(user.password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
  if (user.status === "suspended") return res.status(403).json({ error: "This account has been suspended. Contact an administrator." });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: "2h" });
  res.cookie("session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7200000 });
  return res.json({ user: safeUser(user) });
});
app.post("/api/auth/logout", (_req, res) => { res.clearCookie("session"); res.status(204).send(); });
app.get("/api/auth/me", auth, (req: AuthRequest, res) => res.json({ user: safeUser(req.user as unknown as Record<string, unknown>), profile: profileFor(req.user!.id) }));

app.get("/api/dashboard", auth, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const stats = {
    connections: (db.prepare("SELECT COUNT(*) as count FROM connection_requests WHERE (sender_id=? OR receiver_id=?) AND status='accepted'").get(userId, userId) as { count: number }).count,
    pendingRequests: (db.prepare("SELECT COUNT(*) as count FROM connection_requests WHERE receiver_id=? AND status='pending'").get(userId) as { count: number }).count,
    mentorships: (db.prepare("SELECT COUNT(*) as count FROM mentorship_requests WHERE student_id=? OR alumni_id=?").get(userId, userId) as { count: number }).count,
    opportunities: (db.prepare("SELECT COUNT(*) as count FROM opportunities WHERE status='published' AND deadline >= date('now')").get() as { count: number }).count
  };
  const activity = db.prepare("SELECT title, body, read, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 5").all(userId);
  res.json({ stats, activity, profile: profileFor(userId) });
});

app.get("/api/profiles", auth, (req, res) => {
  const query = String(req.query.q ?? "").trim();
  const industry = String(req.query.industry ?? "").trim();
  const available = req.query.available === "true";
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 12) || 12));
  const sort = req.query.sort === "recent" ? "u.created_at DESC" : "u.name ASC";
  let sql = `SELECT u.id,u.name,u.role,u.status,p.* FROM users u JOIN profiles p ON p.user_id=u.id
    WHERE u.role='alumni' AND u.status='active' AND p.visibility='public' AND p.verified=1`;
  const params: (string | number)[] = [];
  if (query) { sql += " AND (u.name LIKE ? OR p.company LIKE ? OR p.job_title LIKE ? OR p.skills LIKE ?)"; const q = `%${query}%`; params.push(q, q, q, q); }
  if (industry) { sql += " AND p.industry = ?"; params.push(industry); }
  if (available) sql += " AND p.available_for_mentoring=1";
  const total = (db.prepare(`SELECT COUNT(*) as count FROM (${sql})`).get(...params) as { count: number }).count;
  sql += ` ORDER BY ${sort} LIMIT ? OFFSET ?`;
  params.push(pageSize, (page - 1) * pageSize);
  res.json({ profiles: db.prepare(sql).all(...params).map((p: any) => ({ ...p, skills: parseSkills(p.skills), interests: parseSkills(p.interests) })), page, pageSize, total });
});
app.get("/api/profiles/:id", auth, (req: AuthRequest, res) => {
  const profile = db.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,p.* FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=?`).get(Number(req.params.id)) as any;
  if (!profile || (profile.visibility !== "public" && profile.id !== req.user!.id)) return res.status(404).json({ error: "Profile not found." });
  res.json({ profile: { ...profile, skills: parseSkills(profile.skills), interests: parseSkills(profile.interests) } });
});
app.patch("/api/profiles/me", auth, (req: AuthRequest, res) => {
  const parsed = z.object({ headline: z.string().max(100), bio: z.string().max(1000), company: z.string().max(100), job_title: z.string().max(100), industry: z.string().max(80), location: z.string().max(100), skills: z.string().max(500), interests: z.string().max(500), available_for_mentoring: z.boolean(), visibility: z.enum(["public", "connections", "private"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please check the profile fields and try again." });
  db.prepare(`UPDATE profiles SET headline=?,bio=?,company=?,job_title=?,industry=?,location=?,skills=?,interests=?,available_for_mentoring=?,visibility=? WHERE user_id=?`).run(parsed.data.headline, parsed.data.bio, parsed.data.company, parsed.data.job_title, parsed.data.industry, parsed.data.location, parsed.data.skills, parsed.data.interests, parsed.data.available_for_mentoring ? 1 : 0, parsed.data.visibility, req.user!.id);
  res.json({ profile: profileFor(req.user!.id) });
});

app.get("/api/connections", auth, (req: AuthRequest, res) => {
  const rows = db.prepare(`SELECT cr.*, s.name sender_name, r.name receiver_name,
    sp.headline sender_headline, rp.headline receiver_headline FROM connection_requests cr
    JOIN users s ON s.id=cr.sender_id JOIN users r ON r.id=cr.receiver_id
    LEFT JOIN profiles sp ON sp.user_id=s.id LEFT JOIN profiles rp ON rp.user_id=r.id
    WHERE cr.sender_id=? OR cr.receiver_id=? ORDER BY cr.created_at DESC`).all(req.user!.id, req.user!.id);
  res.json({ connections: rows });
});
app.post("/api/connections/:userId", auth, (req: AuthRequest, res) => {
  const target = Number(req.params.userId);
  if (target === req.user!.id || !db.prepare("SELECT id FROM users WHERE id=?").get(target)) return res.status(400).json({ error: "That connection is not available." });
  try { db.prepare("INSERT INTO connection_requests (sender_id,receiver_id) VALUES (?,?)").run(req.user!.id, target); notify(target, "New connection request", `${req.user!.name} would like to connect with you.`); res.status(201).json({ message: "Connection request sent." }); }
  catch { res.status(409).json({ error: "A connection request already exists." }); }
});
app.patch("/api/connections/:id", auth, (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(["accepted", "rejected", "cancelled"]) }).safeParse(req.body);
  const request = db.prepare("SELECT * FROM connection_requests WHERE id=?").get(Number(req.params.id)) as any;
  if (!parsed.success || !request || (request.receiver_id !== req.user!.id && request.sender_id !== req.user!.id)) return res.status(400).json({ error: "Invalid connection update." });
  if (parsed.data.status === "accepted" && request.receiver_id !== req.user!.id) return res.status(403).json({ error: "Only the recipient can accept a request." });
  db.prepare("UPDATE connection_requests SET status=? WHERE id=?").run(parsed.data.status, request.id);
  if (parsed.data.status === "accepted") notify(request.sender_id, "Connection accepted", `${req.user!.name} accepted your connection request.`);
  res.json({ message: "Connection updated." });
});

app.get("/api/opportunities", auth, (req, res) => {
  const q = String(req.query.q ?? "").trim(); const type = String(req.query.type ?? "").trim();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1); const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 12) || 12));
  let sql = `SELECT o.*,u.name creator_name FROM opportunities o JOIN users u ON u.id=o.creator_id WHERE o.status='published' AND o.deadline >= date('now')`; const params: string[] = [];
  if (q) { sql += " AND (o.title LIKE ? OR o.organization LIKE ? OR o.skills LIKE ?)"; const v = `%${q}%`; params.push(v, v, v); }
  if (type) { sql += " AND o.type=?"; params.push(type); }
  const total = (db.prepare(`SELECT COUNT(*) as count FROM (${sql})`).get(...params) as { count: number }).count;
  sql += " ORDER BY o.deadline ASC LIMIT ? OFFSET ?";
  res.json({ opportunities: db.prepare(sql).all(...params, pageSize, (page - 1) * pageSize), page, pageSize, total });
});
app.post("/api/opportunities", auth, role("alumni", "admin"), (req: AuthRequest, res) => {
  const parsed = z.object({ title: z.string().min(3), organization: z.string().min(2), type: z.enum(["Internship", "Full-time", "Part-time"]), location: z.string().min(2), description: z.string().min(20), skills: z.string(), deadline: z.string(), application_url: z.string().url() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Complete all opportunity fields with a valid application URL." });
  const status = req.user!.role === "admin" ? "published" : "draft";
  const result = db.prepare(`INSERT INTO opportunities (creator_id,title,organization,type,location,description,skills,deadline,application_url,status) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.user!.id, ...Object.values(parsed.data), status);
  if (status === "draft") notify(req.user!.id, "Opportunity submitted for review", "An administrator will review your opportunity before publishing.");
  res.status(201).json({ id: result.lastInsertRowid });
});

app.get("/api/mentorship", auth, (req: AuthRequest, res) => {
  const rows = db.prepare(`SELECT mr.*, s.name student_name, a.name alumni_name, ap.company,ap.job_title
    FROM mentorship_requests mr JOIN users s ON s.id=mr.student_id JOIN users a ON a.id=mr.alumni_id
    LEFT JOIN profiles ap ON ap.user_id=a.id WHERE mr.student_id=? OR mr.alumni_id=? ORDER BY mr.created_at DESC`).all(req.user!.id, req.user!.id);
  res.json({ requests: rows });
});
app.post("/api/mentorship/:alumniId", auth, role("student"), (req: AuthRequest, res) => {
  const parsed = z.object({ message: z.string().min(10).max(500) }).safeParse(req.body);
  const alumniId = Number(req.params.alumniId);
  if (!parsed.success) return res.status(400).json({ error: "Tell the mentor a little about what you would like to discuss." });
  const mentor = db.prepare("SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=? AND u.role='alumni' AND p.available_for_mentoring=1 AND p.verified=1").get(alumniId);
  if (!mentor) return res.status(404).json({ error: "That mentor is not accepting requests right now." });
  try { db.prepare("INSERT INTO mentorship_requests (student_id,alumni_id,message) VALUES (?,?,?)").run(req.user!.id, alumniId, parsed.data.message); notify(alumniId, "New mentorship request", `${req.user!.name} would like your guidance.`); res.status(201).json({ message: "Mentorship request sent." }); }
  catch { res.status(409).json({ error: "You already have a mentorship request with this alumnus." }); }
});
app.patch("/api/mentorship/:id", auth, (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(["accepted", "rejected", "cancelled"]) }).safeParse(req.body);
  const request = db.prepare("SELECT * FROM mentorship_requests WHERE id=?").get(Number(req.params.id)) as any;
  if (!parsed.success || !request || (request.student_id !== req.user!.id && request.alumni_id !== req.user!.id)) return res.status(400).json({ error: "Invalid mentorship update." });
  if (parsed.data.status === "accepted" && request.alumni_id !== req.user!.id) return res.status(403).json({ error: "Only the alumni can accept a request." });
  db.prepare("UPDATE mentorship_requests SET status=? WHERE id=?").run(parsed.data.status, request.id);
  notify(request.student_id === req.user!.id ? request.alumni_id : request.student_id, "Mentorship request updated", `Your mentorship request was ${parsed.data.status}.`);
  res.json({ message: "Mentorship request updated." });
});
app.get("/api/mentorship/availability", auth, (req: AuthRequest, res) => {
  const alumniId = req.user!.role === "alumni" ? req.user!.id : Number(req.query.alumniId);
  if (!alumniId) return res.status(400).json({ error: "Choose an alumni mentor." });
  res.json({ availability: db.prepare("SELECT * FROM mentor_availability WHERE alumni_id=? AND status='open' AND starts_at > datetime('now') ORDER BY starts_at").all(alumniId) });
});
app.post("/api/mentorship/availability", auth, role("alumni"), (req: AuthRequest, res) => {
  const parsed = z.object({ starts_at: z.string().datetime(), ends_at: z.string().datetime() }).safeParse(req.body);
  if (!parsed.success || new Date(parsed.data.ends_at) <= new Date(parsed.data.starts_at)) return res.status(400).json({ error: "Provide a valid future availability window." });
  const overlap = db.prepare("SELECT id FROM mentor_availability WHERE alumni_id=? AND status='open' AND starts_at < ? AND ends_at > ?").get(req.user!.id, parsed.data.ends_at, parsed.data.starts_at);
  if (overlap) return res.status(409).json({ error: "That availability overlaps an existing time." });
  const result = db.prepare("INSERT INTO mentor_availability (alumni_id,starts_at,ends_at) VALUES (?,?,?)").run(req.user!.id, parsed.data.starts_at, parsed.data.ends_at);
  res.status(201).json({ id: result.lastInsertRowid });
});
app.post("/api/mentorship/:id/schedule", auth, role("student"), (req: AuthRequest, res) => {
  const parsed = z.object({ availability_id: z.number().int().positive(), meeting_link: z.string().url().optional() }).safeParse(req.body);
  const request = db.prepare("SELECT * FROM mentorship_requests WHERE id=? AND student_id=? AND status='accepted'").get(Number(req.params.id), req.user!.id) as any;
  const slot = parsed.success ? db.prepare("SELECT * FROM mentor_availability WHERE id=? AND status='open'").get(parsed.data.availability_id) as any : undefined;
  if (!parsed.success || !request || !slot || slot.alumni_id !== request.alumni_id) return res.status(400).json({ error: "Choose an available time for an accepted mentorship." });
  const session = db.transaction(() => {
    db.prepare("UPDATE mentor_availability SET status='booked' WHERE id=?").run(slot.id);
    return db.prepare("INSERT INTO mentorship_sessions (request_id,starts_at,duration_minutes,meeting_link) VALUES (?,?,?,?)").run(request.id, slot.starts_at, Math.max(15, Math.round((new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60000)), parsed.data.meeting_link ?? "");
  })();
  notify(request.alumni_id, "Mentorship session scheduled", `${req.user!.name} scheduled a session.`);
  res.status(201).json({ id: session.lastInsertRowid });
});
app.get("/api/mentorship/sessions", auth, (req: AuthRequest, res) => {
  res.json({ sessions: db.prepare(`SELECT ms.*,mr.student_id,mr.alumni_id,s.name student_name,a.name alumni_name
    FROM mentorship_sessions ms JOIN mentorship_requests mr ON mr.id=ms.request_id
    JOIN users s ON s.id=mr.student_id JOIN users a ON a.id=mr.alumni_id
    WHERE mr.student_id=? OR mr.alumni_id=? ORDER BY ms.starts_at`).all(req.user!.id, req.user!.id) });
});
app.patch("/api/mentorship/sessions/:id", auth, (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(["completed", "cancelled"]) }).safeParse(req.body);
  const session = db.prepare(`SELECT ms.*,mr.student_id,mr.alumni_id FROM mentorship_sessions ms JOIN mentorship_requests mr ON mr.id=ms.request_id WHERE ms.id=?`).get(Number(req.params.id)) as any;
  if (!parsed.success || !session || ![session.student_id, session.alumni_id].includes(req.user!.id)) return res.status(400).json({ error: "Invalid session update." });
  db.prepare("UPDATE mentorship_sessions SET status=? WHERE id=?").run(parsed.data.status, session.id);
  if (parsed.data.status === "cancelled") db.prepare("UPDATE mentor_availability SET status='open' WHERE alumni_id=? AND starts_at=?").run(session.alumni_id, session.starts_at);
  res.json({ message: "Session updated." });
});

app.get("/api/applications", auth, (req: AuthRequest, res) => {
  const rows = req.user!.role === "student"
    ? db.prepare(`SELECT ap.*,o.title,o.organization,o.deadline FROM applications ap JOIN opportunities o ON o.id=ap.opportunity_id WHERE ap.student_id=? ORDER BY ap.created_at DESC`).all(req.user!.id)
    : db.prepare(`SELECT ap.*,o.title,o.organization,u.name student_name,u.email student_email FROM applications ap JOIN opportunities o ON o.id=ap.opportunity_id JOIN users u ON u.id=ap.student_id WHERE o.creator_id=? ORDER BY ap.created_at DESC`).all(req.user!.id);
  res.json({ applications: rows });
});
app.post("/api/opportunities/:id/apply", auth, role("student"), (req: AuthRequest, res) => {
  const parsed = z.object({ cover_note: z.string().max(2000).default("") }).safeParse(req.body);
  const opportunity = db.prepare("SELECT id,title,creator_id FROM opportunities WHERE id=? AND status='published' AND deadline >= date('now')").get(Number(req.params.id)) as any;
  if (!parsed.success || !opportunity) return res.status(404).json({ error: "This opportunity is no longer accepting applications." });
  try { db.prepare("INSERT INTO applications (opportunity_id,student_id,cover_note) VALUES (?,?,?)").run(opportunity.id, req.user!.id, parsed.data.cover_note); notify(opportunity.creator_id, "New opportunity application", `${req.user!.name} applied for ${opportunity.title}.`); res.status(201).json({ message: "Application submitted." }); }
  catch { res.status(409).json({ error: "You have already applied to this opportunity." }); }
});
app.patch("/api/applications/:id", auth, role("alumni", "admin"), (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(["reviewing", "shortlisted", "rejected"]) }).safeParse(req.body);
  const application = db.prepare("SELECT ap.*,o.creator_id FROM applications ap JOIN opportunities o ON o.id=ap.opportunity_id WHERE ap.id=?").get(Number(req.params.id)) as any;
  if (!parsed.success || !application || (req.user!.role !== "admin" && application.creator_id !== req.user!.id)) return res.status(403).json({ error: "You cannot update this application." });
  db.prepare("UPDATE applications SET status=? WHERE id=?").run(parsed.data.status, application.id);
  notify(application.student_id, "Application status updated", `Your application is now ${parsed.data.status}.`);
  res.json({ message: "Application updated." });
});

app.get("/api/notifications", auth, (req: AuthRequest, res) => res.json({ notifications: db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(req.user!.id) }));
app.patch("/api/notifications/:id/read", auth, (req: AuthRequest, res) => { db.prepare("UPDATE notifications SET read=1 WHERE id=? AND user_id=?").run(Number(req.params.id), req.user!.id); res.status(204).send(); });
app.get("/api/admin/overview", auth, role("admin"), (_req, res) => res.json({
  users: db.prepare("SELECT role, COUNT(*) as count FROM users GROUP BY role").all(),
  pendingAlumni: db.prepare("SELECT u.id,u.name,u.email,p.company,p.job_title FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.role='alumni' AND p.verified=0").all(),
  pendingOpportunities: db.prepare("SELECT o.*,u.name creator_name FROM opportunities o JOIN users u ON u.id=o.creator_id WHERE o.status='draft' ORDER BY o.created_at").all(),
  accounts: db.prepare("SELECT u.id,u.name,u.email,u.role,u.status FROM users u ORDER BY u.created_at DESC LIMIT 100").all(),
  audit: db.prepare("SELECT a.*,u.name actor_name FROM audit_logs a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 20").all()
}));
app.patch("/api/admin/alumni/:id/verify", auth, role("admin"), (req: AuthRequest, res) => {
  const id = Number(req.params.id); db.prepare("UPDATE profiles SET verified=1 WHERE user_id=?").run(id); db.prepare("INSERT INTO audit_logs (actor_id,action,entity,entity_id) VALUES (?,?,?,?)").run(req.user!.id, "verified alumni", "user", id); notify(id, "Your alumni profile is verified", "You can now offer mentorship and publish opportunities."); res.json({ message: "Alumni verified." });
});
app.patch("/api/admin/opportunities/:id", auth, role("admin"), (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(["published", "rejected", "closed"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid moderation status." });
  const opportunity = db.prepare("SELECT * FROM opportunities WHERE id=?").get(Number(req.params.id)) as any;
  if (!opportunity) return res.status(404).json({ error: "Opportunity not found." });
  db.prepare("UPDATE opportunities SET status=? WHERE id=?").run(parsed.data.status, opportunity.id);
  db.prepare("INSERT INTO audit_logs (actor_id,action,entity,entity_id) VALUES (?,?,?,?)").run(req.user!.id, `${parsed.data.status} opportunity`, "opportunity", opportunity.id);
  notify(opportunity.creator_id, "Opportunity moderation update", `Your opportunity was ${parsed.data.status}.`);
  res.json({ message: "Opportunity moderated." });
});
app.patch("/api/admin/users/:id/status", auth, role("admin"), (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(["active", "suspended"]) }).safeParse(req.body);
  const id = Number(req.params.id);
  if (!parsed.success || id === req.user!.id || !db.prepare("SELECT id FROM users WHERE id=?").get(id)) return res.status(400).json({ error: "Invalid account status update." });
  db.prepare("UPDATE users SET status=? WHERE id=?").run(parsed.data.status, id);
  db.prepare("INSERT INTO audit_logs (actor_id,action,entity,entity_id) VALUES (?,?,?,?)").run(req.user!.id, `${parsed.data.status} account`, "user", id);
  res.json({ message: "Account status updated." });
});

const clientDist = path.resolve("client/dist");
if (fs.existsSync(clientDist)) { app.use(express.static(clientDist)); app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html"))); }
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => { console.error(error); res.status(500).json({ error: "Unexpected server error." }); });
if (process.env.NODE_ENV !== "test") app.listen(Number(process.env.PORT ?? 4000), () => console.log("Alumni Connect API listening on http://localhost:4000"));
export default app;
