DROP TABLE IF EXISTS test_users;
CREATE TABLE test_users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    data TEXT,
    config TEXT,
    point INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS test_posts;
CREATE TABLE test_posts (
    id TEXT PRIMARY KEY,
    name TEXT,
    is_published BOOLEAN DEFAULT FALSE,
    data TEXT,
    user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES test_users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS test_noids;
CREATE TABLE test_noids (
    user_id TEXT,
    post_id TEXT,
    sample TEXT,
    UNIQUE(user_id, post_id)
);

DROP TABLE IF EXISTS test_orders;
CREATE TABLE test_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price INTEGER
);

DROP TABLE IF EXISTS TestExtend;
CREATE TABLE TestExtend (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);