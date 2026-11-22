CREATE TABLE login_attempts (
 login_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
);
