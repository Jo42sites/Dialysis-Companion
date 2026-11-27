const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');

const app = express();
app.use(helmet());
app.use(cors({ origin: 'https://jo42sites.github.io' })); // Allows your GitHub page to talk to this server
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me';

// 1. Login Route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // DEMO ONLY: In real life, check the database here!
    if (username === 'admin' && password === 'password123') {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
        return res.json({ token });
    }
    res.status(401).json({ error: 'Invalid credentials' });
});

// 2. Admin Protected Route
app.get('/api/admin/users', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not admin' });
        res.json({ message: 'Welcome Admin! Here is the user list.' });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
