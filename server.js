const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories
['uploads', 'data'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'map-' + Date.now() + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only images allowed'));
    }
});

// Session config
app.use(session({
    secret: 'factory-maintenance-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Database
const db = new Database(path.join(__dirname, 'data', 'factory.db'));
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        role TEXT DEFAULT 'technician' CHECK(role IN ('admin','supervisor','technician')),
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        image_path TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        map_id INTEGER NOT NULL REFERENCES maps(id),
        name TEXT NOT NULL,
        code TEXT,
        type TEXT,
        area TEXT,
        status TEXT DEFAULT 'operational',
        manufacturer TEXT,
        model TEXT,
        serial TEXT,
        install_date TEXT,
        notes TEXT,
        pos_x REAL NOT NULL,
        pos_y REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id INTEGER NOT NULL REFERENCES equipment(id),
        log_type TEXT NOT NULL DEFAULT 'maintenance',
        title TEXT NOT NULL,
        description TEXT,
        technician TEXT,
        work_date TEXT NOT NULL,
        duration_hours REAL,
        parts_used TEXT,
        parts_cost REAL DEFAULT 0,
        labor_cost REAL DEFAULT 0,
        status TEXT DEFAULT 'completed',
        next_due TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT,
        category TEXT,
        quantity INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 5,
        unit TEXT DEFAULT 'τεμ',
        price REAL DEFAULT 0,
        supplier TEXT,
        location TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );
`);

// ===== CREATE DEFAULT ADMIN IF NO USERS EXIST =====
function initUsers() {
    const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (count === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        db.prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)")
            .run('admin', hash, 'Διαχειριστής', 'admin');
        console.log('  ✅ Default admin created → username: admin | password: admin123');
        console.log('  ⚠️  CHANGE THE PASSWORD AFTER FIRST LOGIN!');
    }
}
initUsers();

// ===== AUTH MIDDLEWARE =====
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Απαιτείται σύνδεση' });
    }
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Απαιτείται σύνδεση' });
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
        if (!user || !roles.includes(user.role)) {
            return res.status(403).json({ error: 'Δεν έχετε δικαίωμα για αυτή την ενέργεια' });
        }
        req.user = user;
        next();
    };
}

// Attach current user to requests
app.use((req, res, next) => {
    if (req.session.userId) {
        const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(req.session.userId);
        if (user) req.user = user;
    }
    next();
});

// Serve static files
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== AUTH ROUTES =====
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Συμπλήρωσε username και password' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Λάθος username ή password' });
    }

    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username, fullName: user.full_name, role: user.role });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(req.session.userId);
    res.json(user);
});

// Change own password
app.post('/api/auth/change-password', requireAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
        return res.status(401).json({ error: 'Ο τρέχων κωδικός είναι λάθος' });
    }
    if (newPassword.length < 6) return res.status(400).json({ error: 'Νέος κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες' });
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.session.userId);
    res.json({ success: true });
});

// ===== USER MANAGEMENT (ADMIN ONLY) =====
app.get('/api/users', requireRole('admin'), (req, res) => {
    const users = db.prepare('SELECT id, username, full_name, role, created_at FROM users ORDER BY username').all();
    res.json(users);
});

app.post('/api/users', requireRole('admin'), (req, res) => {
    const { username, password, fullName, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Συμπλήρωσε username και password' });
    if (password.length < 6) return res.status(400).json({ error: 'Κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες' });

    try {
        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare(
            "INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)"
        ).run(username.toLowerCase(), hash, fullName || '', role || 'technician');
        res.json(db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(result.lastInsertRowid));
    } catch(err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Αυτό το username υπάρχει ήδη' });
        throw err;
    }
});

app.put('/api/users/:id', requireRole('admin'), (req, res) => {
    const { fullName, role, password } = req.body;
    const userId = parseInt(req.params.id);

    // Don't allow editing your own role or deleting yourself
    if (userId === req.session.userId && role && role !== 'admin') {
        return res.status(400).json({ error: 'Δεν μπορείς να αλλάξεις τον δικό σου ρόλο' });
    }

    let updates = [];
    let params = [];
    if (fullName !== undefined) { updates.push('full_name = ?'); params.push(fullName); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (password) {
        if (password.length < 6) return res.status(400).json({ error: 'Κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες' });
        updates.push('password_hash = ?');
        params.push(bcrypt.hashSync(password, 10));
    }
    if (updates.length === 0) return res.json(db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(userId));

    params.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json(db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(userId));
});

app.delete('/api/users/:id', requireRole('admin'), (req, res) => {
    const userId = parseInt(req.params.id);
    if (userId === req.session.userId) {
        return res.status(400).json({ error: 'Δεν μπορείς να διαγράψεις τον εαυτό σου' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ success: true });
});

// ===== MAPS API =====
app.get('/api/maps', requireAuth, (req, res) => {
    const maps = db.prepare('SELECT * FROM maps ORDER BY sort_order').all();
    res.json(maps);
});

app.post('/api/maps', requireRole('admin'), upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as max FROM maps').get().max;
    const result = db.prepare(
        'INSERT INTO maps (name, image_path, sort_order) VALUES (?, ?, ?)'
    ).run(req.body.name || 'Χάρτης ' + (maxOrder + 1), req.file.filename, maxOrder + 1);
    res.json(db.prepare('SELECT * FROM maps WHERE id = ?').get(result.lastInsertRowid));
});

app.delete('/api/maps/:id', requireRole('admin'), (req, res) => {
    const map = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id);
    if (map && fs.existsSync(path.join(__dirname, 'uploads', map.image_path))) {
        fs.unlinkSync(path.join(__dirname, 'uploads', map.image_path));
    }
    db.prepare('DELETE FROM equipment WHERE map_id = ?').run(req.params.id);
    db.prepare('DELETE FROM maps WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ===== EQUIPMENT API =====
app.get('/api/equipment', requireAuth, (req, res) => {
    let sql = 'SELECT * FROM equipment';
    const params = [];
    if (req.query.map_id) { sql += ' WHERE map_id = ?'; params.push(req.query.map_id); }
    sql += ' ORDER BY name';
    res.json(db.prepare(sql).all(...params));
});

app.post('/api/equipment', requireAuth, (req, res) => {
    const d = req.body;
    const result = db.prepare(`
        INSERT INTO equipment (map_id, name, code, type, area, status, manufacturer, model, serial, install_date, notes, pos_x, pos_y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(d.map_id, d.name, d.code || '', d.type || '', d.area || '', d.status || 'operational',
        d.manufacturer || '', d.model || '', d.serial || '', d.install_date || '', d.notes || '', d.pos_x, d.pos_y);
    res.json(db.prepare('SELECT * FROM equipment WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/equipment/:id', requireAuth, (req, res) => {
    const d = req.body;
    db.prepare(`
        UPDATE equipment SET name=?, code=?, type=?, area=?, status=?, manufacturer=?, model=?, serial=?, install_date=?, notes=?, pos_x=?, pos_y=?, updated_at=datetime('now')
        WHERE id=?
    `).run(d.name, d.code || '', d.type || '', d.area || '', d.status || 'operational',
        d.manufacturer || '', d.model || '', d.serial || '', d.install_date || '', d.notes || '',
        d.pos_x || 0, d.pos_y || 0, req.params.id);
    res.json(db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id));
});

app.patch('/api/equipment/:id/status', requireAuth, (req, res) => {
    db.prepare("UPDATE equipment SET status=?, updated_at=datetime('now') WHERE id=?").run(req.body.status, req.params.id);
    res.json(db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id));
});

// DELETE equipment - ADMIN ONLY with confirmation token
app.delete('/api/equipment/:id', requireRole('admin'), (req, res) => {
    const eqId = req.params.id;
    // Require confirm=true in body/query as safety measure
    if (req.query.confirm !== 'true') {
        return res.status(400).json({ error: 'Απαιτείται επιβεβαίωση. Στείλε confirm=true.' });
    }
    const logsCount = db.prepare('SELECT COUNT(*) as c FROM maintenance_log WHERE equipment_id = ?').get(eqId).c;
    if (logsCount > 0 && req.query.force !== 'true') {
        return res.status(400).json({ 
            error: `Αυτό το μηχάνημα έχει ${logsCount} καταχωρήσεις ιστορικού.`,
            needsForce: true,
            message: 'Χρησιμοποίησε force=true για πλήρη διαγραφή με ιστορικό'
        });
    }
    db.prepare('DELETE FROM maintenance_log WHERE equipment_id = ?').run(eqId);
    db.prepare('DELETE FROM equipment WHERE id = ?').run(eqId);
    res.json({ success: true, deletedLogs: logsCount });
});

// ===== MAINTENANCE LOG API =====
app.get('/api/maintenance/:equipmentId', requireAuth, (req, res) => {
    res.json(db.prepare(
        'SELECT * FROM maintenance_log WHERE equipment_id = ? ORDER BY work_date DESC'
    ).all(req.params.equipmentId));
});

app.post('/api/maintenance', requireAuth, (req, res) => {
    const d = req.body;
    const result = db.prepare(`
        INSERT INTO maintenance_log (equipment_id, log_type, title, description, technician, work_date, duration_hours, parts_used, parts_cost, labor_cost, status, next_due)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(d.equipment_id, d.log_type || 'maintenance', d.title, d.description || '',
        d.technician || '', d.work_date, d.duration_hours || null, d.parts_used || '',
        d.parts_cost || 0, d.labor_cost || 0, d.status || 'completed', d.next_due || '');

    if (d.log_type === 'breakdown') {
        db.prepare("UPDATE equipment SET status='breakdown' WHERE id=?").run(d.equipment_id);
    } else if (d.log_type === 'maintenance') {
        db.prepare("UPDATE equipment SET status='operational' WHERE id=?").run(d.equipment_id);
    }

    res.json(db.prepare('SELECT * FROM maintenance_log WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/maintenance/:id', requireAuth, (req, res) => {
    const d = req.body;
    db.prepare(`
        UPDATE maintenance_log SET title=?, description=?, technician=?, work_date=?, duration_hours=?, parts_used=?, parts_cost=?, labor_cost=?, status=?, next_due=?
        WHERE id=?
    `).run(d.title, d.description || '', d.technician || '', d.work_date,
        d.duration_hours || null, d.parts_used || '', d.parts_cost || 0, d.labor_cost || 0,
        d.status || 'completed', d.next_due || '', req.params.id);
    res.json(db.prepare('SELECT * FROM maintenance_log WHERE id = ?').get(req.params.id));
});

// Delete log - supervisor and above only
app.delete('/api/maintenance/:id', requireRole('supervisor', 'admin'), (req, res) => {
    db.prepare('DELETE FROM maintenance_log WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ===== INVENTORY API =====
app.get('/api/inventory', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM inventory ORDER BY name').all());
});

app.post('/api/inventory', requireAuth, (req, res) => {
    const d = req.body;
    const result = db.prepare(`
        INSERT INTO inventory (name, code, category, quantity, min_stock, unit, price, supplier, location)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(d.name, d.code || '', d.category || '', d.quantity || 0, d.min_stock || 5,
        d.unit || 'τεμ', d.price || 0, d.supplier || '', d.location || '');
    res.json(db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/inventory/:id', requireAuth, (req, res) => {
    const d = req.body;
    db.prepare(`
        UPDATE inventory SET name=?, code=?, category=?, quantity=?, min_stock=?, unit=?, price=?, supplier=?, location=?
        WHERE id=?
    `).run(d.name, d.code || '', d.category || '', d.quantity || 0, d.min_stock || 5,
        d.unit || 'τεμ', d.price || 0, d.supplier || '', d.location || '', req.params.id);
    res.json(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id));
});

app.patch('/api/inventory/:id/stock', requireAuth, (req, res) => {
    db.prepare('UPDATE inventory SET quantity = MAX(0, quantity + ?) WHERE id = ?').run(req.body.delta, req.params.id);
    res.json(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id));
});

// Delete inventory - supervisor and above
app.delete('/api/inventory/:id', requireRole('supervisor', 'admin'), (req, res) => {
    db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ===== STATS API =====
app.get('/api/stats', requireAuth, (req, res) => {
    const totalEquipment = db.prepare('SELECT COUNT(*) as count FROM equipment').get().count;
    const operational = db.prepare("SELECT COUNT(*) as count FROM equipment WHERE status='operational'").get().count;
    const breakdown = db.prepare("SELECT COUNT(*) as count FROM equipment WHERE status='breakdown'").get().count;
    const monthLogs = db.prepare(`
        SELECT COUNT(*) as count FROM maintenance_log WHERE work_date >= date('now', '-30 days')
    `).get().count;
    const lowStock = db.prepare('SELECT * FROM inventory WHERE quantity <= min_stock ORDER BY quantity ASC').all();
    const recentLogs = db.prepare(`
        SELECT ml.*, e.name as equipment_name FROM maintenance_log ml JOIN equipment e ON ml.equipment_id = e.id
        ORDER BY ml.created_at DESC LIMIT 10
    `).all();
    const problemEquipment = db.prepare(`
        SELECT e.id, e.name, e.code, COUNT(ml.id) as breakdown_count
        FROM equipment e JOIN maintenance_log ml ON e.id = ml.equipment_id
        WHERE ml.log_type = 'breakdown' GROUP BY e.id ORDER BY breakdown_count DESC LIMIT 5
    `).all();
    const upcomingMaintenance = db.prepare(`
        SELECT ml.*, e.name as equipment_name FROM maintenance_log ml JOIN equipment e ON ml.equipment_id = e.id
        WHERE ml.next_due IS NOT NULL AND ml.next_due != '' AND ml.next_due >= date('now')
        AND ml.status != 'completed' ORDER BY ml.next_due ASC LIMIT 5
    `).all();

    res.json({ totalEquipment, operational, breakdown, monthLogs, lowStock, recentLogs, problemEquipment, upcomingMaintenance });
});

// Search
app.get('/api/search', requireAuth, (req, res) => {
    const q = '%' + (req.query.q || '') + '%';
    const equipment = db.prepare(`
        SELECT * FROM equipment WHERE name LIKE ? OR code LIKE ? OR type LIKE ? OR manufacturer LIKE ?
    `).all(q, q, q, q);
    const logs = db.prepare(`
        SELECT ml.*, e.name as equipment_name FROM maintenance_log ml JOIN equipment e ON ml.equipment_id = e.id
        WHERE ml.title LIKE ? OR ml.description LIKE ? OR ml.technician LIKE ? OR ml.parts_used LIKE ?
    `).all(q, q, q, q);
    res.json({ equipment, logs });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  🏭 Factory Maintenance Server (Secure)');
    console.log('  ─────────────────────────────────────────');
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log('');
    console.log('  Default login:');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    console.log('  ⚠️  CHANGE PASSWORD after first login!');
    console.log('');
});
