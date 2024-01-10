DROP TABLE IF EXISTS "test_posts";

DROP TABLE IF EXISTS "test_users";

CREATE TABLE
  "test_users" (
    "id" varchar(36) PRIMARY KEY,
    "name" varchar(100),
    "email" varchar(360) UNIQUE,
    "data" jsonb,
    "config" jsonb,
    "point" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  "test_posts" (
    "id" varchar(36) PRIMARY KEY,
    "name" varchar(100),
    "is_published" BOOLEAN DEFAULT FALSE,
    "data" TEXT,
    "kind" varchar(36),
    "user_id" varchar(36),
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("user_id") REFERENCES "test_users" ("id") ON DELETE CASCADE
  );

DROP TABLE IF EXISTS "test_noids";

CREATE TABLE
  "test_noids" (
    "user_id" varchar(36),
    "post_id" varchar(36),
    "sample" varchar(36),
    CONSTRAINT "test_noids_pkey" PRIMARY KEY ("user_id", "post_id")
  );

DROP TABLE IF EXISTS "test_orders";

CREATE TABLE
  "test_orders" (
    "id" serial PRIMARY KEY,
    "name" varchar(100),
    "price" INTEGER
  );

DROP TABLE IF EXISTS "TestExtend";

CREATE TABLE
  "TestExtend" (
    "id" serial PRIMARY KEY,
    "name" varchar(100),
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
