const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        balance INTEGER DEFAULT 500,
        role TEXT DEFAULT 'user'
    )`);

    // Tasks table
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        points INTEGER
    )`);

    // Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price INTEGER
    )`);

    // Submissions table
    db.run(`CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        taskId INTEGER,
        taskTitle TEXT,
        proofImage TEXT,
        status TEXT DEFAULT 'Pending',
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(taskId) REFERENCES tasks(id)
    )`);

    // Purchases table
    db.run(`CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        productName TEXT,
        price INTEGER,
        contactPlatform TEXT,
        contactHandle TEXT,
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    // Transactions table
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        type TEXT,
        amount INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    // Daily claims table
    db.run(`CREATE TABLE IF NOT EXISTS daily_claims (
        userId INTEGER,
        claimDate TEXT,
        PRIMARY KEY(userId, claimDate),
        FOREIGN KEY(userId) REFERENCES users(id)
    )`);

    // Favorites table (New Feature)
    db.run(`CREATE TABLE IF NOT EXISTS favorites (
        userId INTEGER,
        productId INTEGER,
        PRIMARY KEY(userId, productId),
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(productId) REFERENCES products(id)
    )`);

    console.log('Database tables initialized.');
});

module.exports = db;
