CREATE TABLE admins (
 id INTEGER PRIMARY KEY, login_id TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 full_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','super_admin','director')),
 phone_number TEXT, color_theme TEXT DEFAULT '#4a9eff', created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE users (
 id INTEGER PRIMARY KEY, login_id TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 full_name TEXT NOT NULL, department TEXT, position TEXT,
 created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL, account_type TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE tickets (
 id INTEGER PRIMARY KEY, problem_desc TEXT NOT NULL, location TEXT NOT NULL, employee_info TEXT NOT NULL,
 comment TEXT, urgency TEXT, tracking_token TEXT NOT NULL UNIQUE,
 status INTEGER NOT NULL DEFAULT 0 CHECK(status IN (0,1)), color_class TEXT,
 user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 executor_name TEXT, completed_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX tickets_status ON tickets(status,created_at);
CREATE TABLE ticket_comments (
 id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
 admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 comment_text TEXT NOT NULL, is_public INTEGER NOT NULL DEFAULT 1 CHECK(is_public IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ticket_comments_ticket ON ticket_comments(ticket_id);
CREATE TABLE tasks (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT,
 assigned_to INTEGER REFERENCES admins(id) ON DELETE SET NULL,
 created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
 completed_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
 priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed')),
 due_date TEXT, completed_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE task_comments (
 id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 comment_text TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX task_comments_task ON task_comments(task_id);
CREATE TABLE reports (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, report_data TEXT NOT NULL DEFAULT '{}',
 created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE inventory_computers (
 id INTEGER PRIMARY KEY, inventory_number TEXT NOT NULL UNIQUE, responsible TEXT, location TEXT, cpu TEXT, ram TEXT,
 storage TEXT, windows_version TEXT, ip_inet TEXT, ip_lan TEXT, mac TEXT, name TEXT, manufacturer TEXT
);
CREATE TABLE inventory_laptops (
 id INTEGER PRIMARY KEY, inventory_number TEXT NOT NULL UNIQUE, responsible TEXT, location TEXT, cpu TEXT, ram TEXT,
 storage TEXT, windows_version TEXT, ip_inet TEXT, ip_lan TEXT, mac TEXT, name TEXT, manufacturer TEXT
);
CREATE TABLE inventory_printers (
 id INTEGER PRIMARY KEY, inventory_number TEXT NOT NULL UNIQUE, model TEXT, cartridge TEXT, location TEXT, ip TEXT, comment TEXT
);
CREATE TABLE switches (
 id INTEGER PRIMARY KEY, inventory_number TEXT NOT NULL UNIQUE, model TEXT, manufacturer TEXT,
 ports_count INTEGER NOT NULL DEFAULT 0 CHECK(ports_count BETWEEN 0 AND 1024),
 ip TEXT, mac TEXT, location TEXT, connection_method TEXT, sn TEXT, comment TEXT
);
CREATE TABLE switch_ports (
 id INTEGER PRIMARY KEY, switch_id INTEGER NOT NULL REFERENCES switches(id) ON DELETE CASCADE,
 port_number INTEGER NOT NULL CHECK(port_number BETWEEN 1 AND 1024), port_label TEXT, destination TEXT,
 status TEXT NOT NULL DEFAULT 'free' CHECK(status IN ('free','active','dead','burnt','reserved')),
 speed TEXT, vlan TEXT, comment TEXT, UNIQUE(switch_id,port_number)
);
