const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'sunix-super-secret-key';

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- AUTH ROUTES ---

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = username.toLowerCase() === 'owner' ? 'owner' : 'user';

    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, 
        [username, hashedPassword, role], 
        function(err) {
            if (err) return res.status(400).json({ error: 'Username already exists' });
            res.json({ message: 'User registered successfully' });
        }
    );
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'User not found' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY);
        res.json({ token, user: { username: user.username, role: user.role, balance: user.balance } });
    });
});

app.get('/api/me', authenticateToken, (req, res) => {
    db.get(`SELECT username, role, balance FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(user);
    });
});

// --- USER ROUTES ---

app.get('/api/balance', authenticateToken, (req, res) => {
    db.get(`SELECT balance FROM users WHERE id = ?`, [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ balance: row.balance });
    });
});

app.post('/api/claim-daily', authenticateToken, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.run(`INSERT INTO daily_claims (userId, claimDate) VALUES (?, ?)`, [req.user.id, today], function(err) {
        if (err) return res.status(400).json({ error: 'Already claimed today' });

        db.run(`UPDATE users SET balance = balance + 100 WHERE id = ?`, [req.user.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`INSERT INTO transactions (userId, type, amount) VALUES (?, '🎁 هدية يومية', 100)`);
            res.json({ message: 'Claimed 100 points' });
        });
    });
});

app.post('/api/transfer', authenticateToken, (req, res) => {
    const { recipientName, amount } = req.body;
    if (recipientName === req.user.username) return res.status(400).json({ error: 'Cannot transfer to yourself' });

    db.get(`SELECT id FROM users WHERE username = ?`, [recipientName], (err, receiver) => {
        if (err || !receiver) return res.status(400).json({ error: 'Recipient not found' });

        db.get(`SELECT balance FROM users WHERE id = ?`, [req.user.id], (err, sender) => {
            if (sender.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

            db.serialize(() => {
                db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [amount, req.user.id]);
                db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, receiver.id]);
                db.run(`INSERT INTO transactions (userId, type, amount) VALUES (?, ?, ?)`, [req.user.id, `💸 تحويل إلى ${recipientName}`, amount]);
                db.run(`INSERT INTO transactions (userId, type, amount) VALUES (?, ?, ?)`, [receiver.id, `📩 استلام من ${req.user.username}`, amount]);
                res.json({ message: 'Transfer successful' });
            });
        });
    });
});

app.get('/api/transactions', authenticateToken, (req, res) => {
    db.all(`SELECT type, amount, createdAt FROM transactions WHERE userId = ? ORDER BY createdAt DESC`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- TASKS & PRODUCTS ---

app.get('/api/tasks', authenticateToken, (req, res) => {
    db.all(`SELECT t.*, (SELECT status FROM submissions WHERE taskId = t.id AND userId = ?) as status FROM tasks t`, [req.user.id], (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/tasks/submit', authenticateToken, (req, res) => {
    const { taskId, taskTitle, proofImage } = req.body;
    db.run(`INSERT INTO submissions (userId, taskId, taskTitle, proofImage) VALUES (?, ?, ?, ?)`, 
        [req.user.id, taskId, taskTitle, proofImage], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Submission sent' });
        }
    );
});

app.get('/api/products', authenticateToken, (req, res) => {
    db.all(`SELECT p.*, (SELECT 1 FROM favorites WHERE userId = ? AND productId = p.id) as isFavorite FROM products p`, [req.user.id], (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/products/buy', authenticateToken, (req, res) => {
    const { productId, price, productName, contactPlatform, contactHandle } = req.body;
    db.get(`SELECT balance FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (user.balance < price) return res.status(400).json({ error: 'Insufficient balance' });

        db.serialize(() => {
            db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [price, req.user.id]);
            db.run(`INSERT INTO purchases (userId, productName, price, contactPlatform, contactHandle) VALUES (?, ?, ?, ?, ?)`, 
                [req.user.id, productName, price, contactPlatform, contactHandle]);
            db.run(`INSERT INTO transactions (userId, type, amount) VALUES (?, ?, ?)`, [req.user.id, `🛍️ شراء: ${productName}`, price]);
            res.json({ message: 'Purchase successful' });
        });
    });
});

// --- FAVORITES (New Feature) ---

app.post('/api/favorites/toggle', authenticateToken, (req, res) => {
    const { productId } = req.body;
    db.get(`SELECT 1 FROM favorites WHERE userId = ? AND productId = ?`, [req.user.id, productId], (err, exists) => {
        if (exists) {
            db.run(`DELETE FROM favorites WHERE userId = ? AND productId = ?`, [req.user.id, productId], () => res.json({ status: 'removed' }));
        } else {
            db.run(`INSERT INTO favorites (userId, productId) VALUES (?, ?)`, [req.user.id, productId], () => res.json({ status: 'added' }));
        }
    });
});

app.get('/api/favorites', authenticateToken, (req, res) => {
    db.all(`SELECT p.* FROM products p JOIN favorites f ON p.id = f.productId WHERE f.userId = ?`, [req.user.id], (err, rows) => {
        res.json(rows);
    });
});

// --- OWNER ROUTES ---

app.post('/api/owner/tasks', authenticateToken, (req, res) => {
    if (req.user.role !== 'owner') return res.sendStatus(403);
    const { title, points } = req.body;
    db.run(`INSERT INTO tasks (title, points) VALUES (?, ?)`, [title, points], () => res.json({ message: 'Task added' }));
});

app.post('/api/owner/products', authenticateToken, (req, res) => {
    if (req.user.role !== 'owner') return res.sendStatus(403);
    const { name, price } = req.body;
    db.run(`INSERT INTO products (name, price) VALUES (?, ?)`, [name, price], () => res.json({ message: 'Product added' }));
});

app.get('/api/owner/submissions', authenticateToken, (req, res) => {
    if (req.user.role !== 'owner') return res.sendStatus(403);
    db.all(`SELECT s.*, u.username FROM submissions s JOIN users u ON s.userId = u.id WHERE s.status = 'Pending'`, (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/owner/review-submission', authenticateToken, (req, res) => {
    if (req.user.role !== 'owner') return res.sendStatus(403);
    const { submissionId, status, userId, points, taskTitle } = req.body;
    db.serialize(() => {
        db.run(`UPDATE submissions SET status = ? WHERE id = ?`, [status, submissionId]);
        if (status === 'Approved') {
            db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [points, userId]);
            db.run(`INSERT INTO transactions (userId, type, amount) VALUES (?, ?, ?)`, [userId, `💰 مكافأة مهمة: ${taskTitle}`, points]);
        }
        res.json({ message: 'Submission reviewed' });
    });
});

app.get('/api/owner/purchases', authenticateToken, (req, res) => {
    if (req.user.role !== 'owner') return res.sendStatus(403);
    db.all(`SELECT p.*, u.username FROM purchases p JOIN users u ON p.userId = u.id`, (err, rows) => {
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
