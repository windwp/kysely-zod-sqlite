-- Create TestUser table
CREATE TABLE IF NOT EXISTS TestUser (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    data TEXT,
    config TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create TestPost table
CREATE TABLE IF NOT EXISTS TestPost (
    id TEXT PRIMARY KEY,
    name TEXT,
    isPublished BOOLEAN DEFAULT FALSE,
    data TEXT,
    userId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES TestUser(id) ON DELETE CASCADE
);

-- Create TestNoId table
CREATE TABLE IF NOT EXISTS TestNoId (
    userId TEXT,
    postId TEXT,
    sample TEXT,
    UNIQUE(userId, postId)
);

-- Create TestOrder table
CREATE TABLE IF NOT EXISTS TestOrder (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price INTEGER
);

-- Create TestExtend table
CREATE TABLE IF NOT EXISTS TestExtend (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT
);
