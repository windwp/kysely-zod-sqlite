DROP TABLE IF EXISTS "TestPost";

DROP TABLE IF EXISTS "TestUser";

CREATE TABLE
  "TestUser" (
    "id" varchar(36) PRIMARY KEY,
    "name" varchar(100),
    "email" varchar(360) UNIQUE,
    "data" json,
    "config" json,
    "point" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  "TestPost" (
    "id" varchar(36) PRIMARY KEY,
    "name" varchar(100),
    "isPublished" BOOLEAN DEFAULT FALSE,
    "data" TEXT,
    "userId" varchar(36),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "TestUser" ("id") ON DELETE CASCADE
  );

DROP TABLE IF EXISTS "TestNoId";

CREATE TABLE
  "TestNoId" (
    "userId" varchar(36),
    "postId" varchar(36),
    "sample" varchar(36),
    CONSTRAINT "TestNoId_pkey" PRIMARY KEY ("userId", "postId")
  );

DROP TABLE IF EXISTS "TestOrder";

CREATE TABLE
  "TestOrder" (
    "id" serial PRIMARY KEY,
    "name" varchar(100),
    "price" INTEGER
  );

DROP TABLE IF EXISTS "TestExtend";

CREATE TABLE
  "TestExtend" ("id" serial PRIMARY KEY, "name" varchar(100));
