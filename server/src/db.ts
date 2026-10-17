import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";

const dataDir = path.resolve(process.env.DATABASE_PATH ?? "server/data/app.db", "..");
fs.mkdirSync(dataDir, { recursive: true });
export const db = new Database(process.env.DATABASE_PATH ?? "server/data/app.db");
db.pragma("foreign_keys = ON");

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student','alumni','admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      headline TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '',
      job_title TEXT NOT NULL DEFAULT '', industry TEXT NOT NULL DEFAULT '', graduation_year INTEGER,
      location TEXT NOT NULL DEFAULT '', skills TEXT NOT NULL DEFAULT '', interests TEXT NOT NULL DEFAULT '',
      available_for_mentoring INTEGER NOT NULL DEFAULT 0, verified INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'public', resume_url TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS connection_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(sender_id, receiver_id)
    );
    CREATE TABLE IF NOT EXISTS mentorship_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      alumni_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','accepted','rejected','cancelled')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS mentorship_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL REFERENCES mentorship_requests(id) ON DELETE CASCADE,
      starts_at TEXT NOT NULL, duration_minutes INTEGER NOT NULL DEFAULT 30,
      meeting_link TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled','completed','cancelled'))
    );
    CREATE TABLE IF NOT EXISTS mentor_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT, alumni_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','booked','cancelled'))
    );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, cover_note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','shortlisted','rejected','withdrawn')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(opportunity_id, student_id)
    );
    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, organization TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('Internship','Full-time','Part-time')),
      location TEXT NOT NULL, description TEXT NOT NULL, skills TEXT NOT NULL DEFAULT '',
      deadline TEXT NOT NULL, application_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft','published','closed','rejected')), demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, body TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status, deadline);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS idx_availability_alumni ON mentor_availability(alumni_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id, status);
  `);
  seed();
}

function seed() {
  const count = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (count.count > 0) return;
  const insertUser = db.prepare("INSERT INTO users (email,password_hash,name,role,status) VALUES (?,?,?,?,?)");
  const insertProfile = db.prepare(`INSERT INTO profiles
    (user_id,headline,bio,company,job_title,industry,graduation_year,location,skills,interests,available_for_mentoring,verified,visibility)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const hash = bcrypt.hashSync("DemoPass123!", 10);
  const users = [
    ["student@alumni-connect.local", "Ananya Sharma", "student"],
    ["alumni@alumni-connect.local", "Rohan Mehta", "alumni"],
    ["admin@alumni-connect.local", "Priya Nair", "admin"],
    ["alumni2@alumni-connect.local", "Karthik Rao", "alumni"],
    ["student2@alumni-connect.local", "Ishita Verma", "student"]
  ] as const;
  const ids: number[] = [];
  for (const [email, name, role] of users) {
    const result = insertUser.run(email, hash, name, role, role === "alumni" ? "active" : "active");
    ids.push(Number(result.lastInsertRowid));
  }
  insertProfile.run(ids[0], "Computer Science student", "Building accessible products and learning from people who have done it before.", "", "", "Technology", 2027, "Hyderabad, India", "React, TypeScript, UX research", "Product engineering, startups", 0, 1, "public");
  insertProfile.run(ids[1], "Senior Product Engineer at Microsoft", "I enjoy helping students turn curiosity into a practical career plan.", "Microsoft", "Senior Product Engineer", "Technology", 2018, "Bengaluru, India", "Product strategy, React, Cloud architecture", "Mentoring, developer tools", 1, 1, "public");
  insertProfile.run(ids[2], "Platform administrator", "Keeping the alumni community safe and useful.", "Vardhaman College of Engineering", "Program Coordinator", "Education", 2016, "Hyderabad, India", "Community operations, Moderation", "Student success", 0, 1, "public");
  insertProfile.run(ids[3], "Data & AI Lead at Deloitte", "I help early-career professionals navigate data careers.", "Deloitte", "Data & AI Lead", "Consulting", 2015, "Pune, India", "Python, SQL, Data science", "Data careers, Mock interviews", 1, 1, "public");
  insertProfile.run(ids[4], "Information Technology student", "Interested in cloud engineering and community learning.", "", "", "Technology", 2026, "Hyderabad, India", "Java, Azure, SQL", "Cloud engineering", 0, 1, "public");
  const insertOpportunity = db.prepare(`INSERT INTO opportunities
    (creator_id,title,organization,type,location,description,skills,deadline,application_url,status,demo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  insertOpportunity.run(ids[1], "Frontend Engineering Intern", "Community demo · BrightLabs", "Internship", "Remote / India", "Work with a product team to ship thoughtful, accessible web experiences. This is demonstration content for local development.", "React, TypeScript, Testing", "2026-11-30", "https://example.com/apply/frontend-intern", "published", 1);
  insertOpportunity.run(ids[3], "Graduate Data Analyst", "Community demo · Northstar", "Full-time", "Bengaluru, India", "Join a growing analytics team and learn from experienced practitioners. This listing is sample data, not a live verified opening.", "SQL, Python, Excel", "2026-12-15", "https://example.com/apply/data-analyst", "published", 1);
  const addNotification = db.prepare("INSERT INTO notifications (user_id,title,body) VALUES (?,?,?)");
  addNotification.run(ids[0], "Welcome to Alumni Connect", "Complete your profile to discover better matches.");
  addNotification.run(ids[1], "Your mentor profile is live", "Students can now request a conversation with you.");
}
