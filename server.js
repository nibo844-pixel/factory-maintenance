const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

let db;
let dbPath = path.join(__dirname, 'data', 'factory.db');

// Ensure data directory
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

async function initDB() {
    const SQL = await initSqlJs();

    if (fs.existsSync(dbPath)) {
        const buf = fs.readFileSync(dbPath);
        db = new SQL.Database(buf);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            role TEXT DEFAULT 'technician'
        );
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS maps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            image_data TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            map_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            code TEXT,
            type TEXT,
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
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS maintenance_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_id INTEGER NOT NULL,
            log_type TEXT NOT NULL DEFAULT 'maintenance',
            title TEXT NOT NULL,
            description TEXT,
            technician TEXT,
            work_date TEXT NOT NULL,
            duration_hours REAL,
            parts_used TEXT,
            parts_cost REAL DEFAULT 0,
            next_due TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT,
            quantity INTEGER DEFAULT 0,
            min_stock INTEGER DEFAULT 5,
            unit TEXT DEFAULT 'τεμ',
            price REAL DEFAULT 0,
            supplier TEXT,
            location TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);

    // Migration: add image_data column if missing
    try {
        db.run("ALTER TABLE maps ADD COLUMN image_data TEXT");
        console.log('  ✅ Added image_data column');
    } catch(e) {
        // Column already exists, ignore
    }

    // Create default admin
    const adminCheck = db.exec("SELECT COUNT(*) as c FROM users WHERE username = 'admin'");
    if (!adminCheck[0] || adminCheck[0].values[0][0] === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        db.run("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
            ['admin', hash, 'Διαχειριστής', 'admin']);
    }

    saveDB();
    console.log('  ✅ Database initialized');
}

function saveDB() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}

// Helper: run query and return results
function dbAll(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    } catch(e) {
        console.error('DB Error:', sql, e.message);
        return [];
    }
}

function dbGet(sql, params = []) {
    const results = dbAll(sql, params);
    return results.length > 0 ? results[0] : null;
}

function dbRun(sql, params = []) {
    try {
        db.run(sql, params);
        saveDB();
    } catch(e) {
        console.error('DB Run Error:', sql, e.message);
        throw e;
    }
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'factory-maintenance-cloud-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Attach user
app.use((req, res, next) => {
    if (req.session && req.session.userId) {
        req.user = dbGet('SELECT id, username, full_name, role FROM users WHERE id = ?', [req.session.userId]);
    }
    next();
});

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Απαιτείται σύνδεση' });
    next();
}
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Απαιτείται σύνδεση' });
        if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Δεν έχεις δικαίωμα' });
        next();
    };
}

// ===== AUTH =====
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Συμπλήρωσε username και password' });
    const user = dbGet('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Λάθος username ή password' });
    }
    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username, fullName: user.full_name, role: user.role });
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

app.post('/api/auth/change-password', requireAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!bcrypt.compareSync(oldPassword, user.password_hash)) return res.status(401).json({ error: 'Λάθος κωδικός' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Min 6 χαρακτήρες' });
    dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), req.session.userId]);
    res.json({ success: true });
});

// ===== USERS =====
app.get('/api/users', requireRole('admin'), (req, res) => {
    res.json(dbAll('SELECT id, username, full_name, role FROM users ORDER BY username'));
});
app.post('/api/users', requireRole('admin'), (req, res) => {
    const { username, password, fullName, role } = req.body;
    if (!username || !password || password.length < 6) return res.status(400).json({ error: 'Username + password min 6' });
    try {
        dbRun("INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)",
            [username.toLowerCase(), bcrypt.hashSync(password, 10), fullName || '', role || 'technician']);
        const user = dbGet('SELECT id, username, full_name, role FROM users WHERE username = ?', [username.toLowerCase()]);
        res.json(user);
    } catch(e) { res.status(409).json({ error: 'Username υπάρχει' }); }
});
app.delete('/api/users/:id', requireRole('admin'), (req, res) => {
    if (parseInt(req.params.id) === req.session.userId) return res.status(400).json({ error: 'Cannot delete yourself' });
    dbRun('DELETE FROM users WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
});

// ===== MAPS =====
app.get('/api/maps', requireAuth, (req, res) => {
    res.json(dbAll('SELECT id, name, sort_order, created_at FROM maps ORDER BY sort_order'));
});
app.get('/api/maps/:id/image', requireAuth, (req, res) => {
    const map = dbGet('SELECT image_data FROM maps WHERE id = ?', [parseInt(req.params.id)]);
    if (!map || !map.image_data) return res.status(404).json({ error: 'Not found' });
    res.json({ imageData: map.image_data });
});
app.post('/api/maps', requireRole('admin'), (req, res) => {
    try {
        const { name, imageData } = req.body;
        if (!imageData) return res.status(400).json({ error: 'No image' });
        const maxOrder = dbGet('SELECT COALESCE(MAX(sort_order),0) as m FROM maps');
        dbRun('INSERT INTO maps (name, image_data, sort_order) VALUES (?,?,?)', [name || 'Χάρτης', imageData, (maxOrder?.m || 0) + 1]);
        const map = dbGet('SELECT id, name FROM maps ORDER BY id DESC LIMIT 1');
        res.json(map);
    } catch(e) {
        console.error('Map creation error:', e.message);
        res.status(500).json({ error: 'Σφάλμα: ' + e.message });
    }
});
app.delete('/api/maps/:id', requireRole('admin'), (req, res) => {
    const mapId = parseInt(req.params.id);
    dbRun('DELETE FROM maintenance_log WHERE equipment_id IN (SELECT id FROM equipment WHERE map_id = ?)', [mapId]);
    dbRun('DELETE FROM equipment WHERE map_id = ?', [mapId]);
    dbRun('DELETE FROM maps WHERE id = ?', [mapId]);
    res.json({ success: true });
});

// ===== EQUIPMENT =====
app.get('/api/equipment', requireAuth, (req, res) => {
    if (req.query.map_id) {
        res.json(dbAll('SELECT * FROM equipment WHERE map_id = ? ORDER BY name', [parseInt(req.query.map_id)]));
    } else {
        res.json(dbAll('SELECT * FROM equipment ORDER BY name'));
    }
});
app.post('/api/equipment', requireAuth, (req, res) => {
    const d = req.body;
    dbRun('INSERT INTO equipment (map_id,name,code,type,status,manufacturer,model,serial,install_date,notes,pos_x,pos_y) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [d.map_id, d.name, d.code||'', d.type||'', d.status||'operational', d.manufacturer||'', d.model||'', d.serial||'', d.install_date||'', d.notes||'', d.pos_x, d.pos_y]);
    const eq = dbGet('SELECT * FROM equipment ORDER BY id DESC LIMIT 1');
    res.json(eq);
});
app.put('/api/equipment/:id', requireAuth, (req, res) => {
    const d = req.body;
    dbRun("UPDATE equipment SET name=?,code=?,type=?,status=?,manufacturer=?,model=?,serial=?,install_date=?,notes=?,pos_x=?,pos_y=?,updated_at=datetime('now') WHERE id=?",
        [d.name, d.code||'', d.type||'', d.status||'operational', d.manufacturer||'', d.model||'', d.serial||'', d.install_date||'', d.notes||'', d.pos_x||0, d.pos_y||0, parseInt(req.params.id)]);
    res.json(dbGet('SELECT * FROM equipment WHERE id = ?', [parseInt(req.params.id)]));
});
app.patch('/api/equipment/:id/status', requireAuth, (req, res) => {
    dbRun("UPDATE equipment SET status=?,updated_at=datetime('now') WHERE id=?", [req.body.status, parseInt(req.params.id)]);
    res.json(dbGet('SELECT * FROM equipment WHERE id = ?', [parseInt(req.params.id)]));
});
app.delete('/api/equipment/:id', requireRole('admin'), (req, res) => {
    if (req.query.confirm !== 'true') return res.status(400).json({ error: 'Confirm required' });
    const eqId = parseInt(req.params.id);
    dbRun('DELETE FROM maintenance_log WHERE equipment_id = ?', [eqId]);
    dbRun('DELETE FROM equipment WHERE id = ?', [eqId]);
    res.json({ success: true });
});

// ===== MAINTENANCE =====
app.get('/api/maintenance/:equipmentId', requireAuth, (req, res) => {
    res.json(dbAll('SELECT * FROM maintenance_log WHERE equipment_id = ? ORDER BY work_date DESC', [parseInt(req.params.equipmentId)]));
});
app.post('/api/maintenance', requireAuth, (req, res) => {
    const d = req.body;
    dbRun('INSERT INTO maintenance_log (equipment_id,log_type,title,description,technician,work_date,duration_hours,parts_used,parts_cost,next_due) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [d.equipment_id, d.log_type||'maintenance', d.title, d.description||'', d.technician||'', d.work_date, d.duration_hours||null, d.parts_used||'', d.parts_cost||0, d.next_due||'']);
    if (d.log_type==='breakdown') dbRun("UPDATE equipment SET status='breakdown' WHERE id=?", [parseInt(d.equipment_id)]);
    else if (d.log_type==='maintenance') dbRun("UPDATE equipment SET status='operational' WHERE id=?", [parseInt(d.equipment_id)]);
    const log = dbGet('SELECT * FROM maintenance_log ORDER BY id DESC LIMIT 1');
    res.json(log);
});
app.put('/api/maintenance/:id', requireAuth, (req, res) => {
    const d = req.body;
    dbRun('UPDATE maintenance_log SET title=?,description=?,technician=?,work_date=?,duration_hours=?,parts_used=?,parts_cost=?,next_due=? WHERE id=?',
        [d.title, d.description||'', d.technician||'', d.work_date, d.duration_hours||null, d.parts_used||'', d.parts_cost||0, d.next_due||'', parseInt(req.params.id)]);
    res.json(dbGet('SELECT * FROM maintenance_log WHERE id = ?', [parseInt(req.params.id)]));
});
app.delete('/api/maintenance/:id', requireRole('supervisor','admin'), (req, res) => {
    dbRun('DELETE FROM maintenance_log WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
});

// ===== INVENTORY =====
app.get('/api/inventory', requireAuth, (req, res) => {
    res.json(dbAll('SELECT * FROM inventory ORDER BY name'));
});
app.post('/api/inventory', requireAuth, (req, res) => {
    const d = req.body;
    dbRun('INSERT INTO inventory (name,code,quantity,min_stock,unit,price,supplier,location) VALUES (?,?,?,?,?,?,?,?)',
        [d.name, d.code||'', d.quantity||0, d.min_stock||5, d.unit||'τεμ', d.price||0, d.supplier||'', d.location||'']);
    const inv = dbGet('SELECT * FROM inventory ORDER BY id DESC LIMIT 1');
    res.json(inv);
});
app.put('/api/inventory/:id', requireAuth, (req, res) => {
    const d = req.body;
    dbRun('UPDATE inventory SET name=?,code=?,quantity=?,min_stock=?,unit=?,price=?,supplier=?,location=? WHERE id=?',
        [d.name, d.code||'', d.quantity||0, d.min_stock||5, d.unit||'τεμ', d.price||0, d.supplier||'', d.location||'', parseInt(req.params.id)]);
    res.json(dbGet('SELECT * FROM inventory WHERE id = ?', [parseInt(req.params.id)]));
});
app.patch('/api/inventory/:id/stock', requireAuth, (req, res) => {
    dbRun('UPDATE inventory SET quantity = MAX(0, quantity + ?) WHERE id = ?', [req.body.delta, parseInt(req.params.id)]);
    res.json(dbGet('SELECT * FROM inventory WHERE id = ?', [parseInt(req.params.id)]));
});
app.delete('/api/inventory/:id', requireRole('supervisor','admin'), (req, res) => {
    dbRun('DELETE FROM inventory WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
});

// ===== STATS =====
app.get('/api/stats', requireAuth, (req, res) => {
    const total = dbGet('SELECT COUNT(*) as c FROM equipment')?.c || 0;
    const ok = dbGet("SELECT COUNT(*) as c FROM equipment WHERE status='operational'")?.c || 0;
    const bd = dbGet("SELECT COUNT(*) as c FROM equipment WHERE status='breakdown'")?.c || 0;
    const ls = dbAll('SELECT * FROM inventory WHERE quantity <= min_stock');
    const rl = dbAll('SELECT ml.*,e.name as equipment_name FROM maintenance_log ml JOIN equipment e ON ml.equipment_id=e.id ORDER BY ml.created_at DESC LIMIT 10');
    const pb = dbAll("SELECT e.id,e.name,COUNT(ml.id) as cnt FROM equipment e JOIN maintenance_log ml ON e.id=ml.equipment_id WHERE ml.log_type='breakdown' GROUP BY e.id ORDER BY cnt DESC LIMIT 5");
    res.json({ totalEquipment:total, operational:ok, breakdown:bd, lowStock:ls, recentLogs:rl, problemEquipment:pb });
});

// ===== START =====
initDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('  🏭 Factory Maintenance Server');
        console.log('  ─────────────────────────────');
        console.log(`  URL: https://factory-maintenance.onrender.com`);
        console.log(`  Local: http://localhost:${PORT}`);
        console.log('');
        console.log('  Login: admin / admin123');
        console.log('');
    });
}).catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
});
