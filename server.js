const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

let db;
const dbPath = path.join(__dirname, 'data', 'factory.db');

if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

// ===== DB Helpers =====
function saveDB() {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
}

function dbAll(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.free();
        return results;
    } catch (e) { console.error('DB Error:', sql, e.message); return []; }
}

function dbGet(sql, params = []) {
    const r = dbAll(sql, params);
    return r.length > 0 ? r[0] : null;
}

function dbRun(sql, params = []) {
    db.run(sql, params);
    saveDB();
}

// ===== Init DB =====
async function initDB() {
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
        db = new SQL.Database(fs.readFileSync(dbPath));
    } else {
        db = new SQL.Database();
    }

    // Tables
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, full_name TEXT, role TEXT DEFAULT 'technician'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS maps (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        image_data TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT, map_id INTEGER NOT NULL, name TEXT NOT NULL,
        code TEXT, type TEXT, status TEXT DEFAULT 'operational', manufacturer TEXT,
        model TEXT, serial TEXT, install_date TEXT, notes TEXT,
        pos_x REAL NOT NULL, pos_y REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS maintenance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, equipment_id INTEGER NOT NULL,
        log_type TEXT NOT NULL DEFAULT 'maintenance', title TEXT NOT NULL,
        description TEXT, technician TEXT, work_date TEXT NOT NULL,
        duration_hours REAL, parts_used TEXT, parts_cost REAL DEFAULT 0,
        next_due TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        code TEXT, quantity INTEGER DEFAULT 0, min_stock INTEGER DEFAULT 5,
        unit TEXT DEFAULT 'τεμ', price REAL DEFAULT 0, supplier TEXT, location TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    // Seed data
    try {
        const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));

        // Upsert maps
        seed.maps.forEach(m => {
            const existing = dbGet('SELECT id FROM maps WHERE id = ?', [m.id]);
            if (existing) {
                dbRun('UPDATE maps SET name = ?, image_data = ? WHERE id = ?', [m.name, m.image_data, m.id]);
            } else {
                dbRun('INSERT INTO maps (id, name, image_data, sort_order) VALUES (?, ?, ?, ?)',
                    [m.id, m.name, m.image_data, 0]);
            }
        });

        // Insert equipment if empty
        const eqCount = (dbGet('SELECT COUNT(*) as c FROM equipment') || {}).c || 0;
        if (eqCount === 0) {
            seed.equipment.forEach(e => {
                dbRun('INSERT INTO equipment (id,map_id,name,code,type,status,manufacturer,model,serial,install_date,notes,pos_x,pos_y) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    [e.id, e.map_id, e.name, e.code || '', e.type || '', e.status || 'operational',
                     e.manufacturer || '', e.model || '', e.serial || '', e.install_date || '',
                     e.notes || '', e.pos_x || 0, e.pos_y || 0]);
            });
        }

        // Insert logs if empty
        const logCount = (dbGet('SELECT COUNT(*) as c FROM maintenance_log') || {}).c || 0;
        if (logCount === 0 && seed.logs && seed.logs.length) {
            seed.logs.forEach(l => {
                dbRun('INSERT INTO maintenance_log (equipment_id,log_type,title,description,technician,work_date,duration_hours,parts_used,parts_cost,next_due) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    [l.equipment_id, l.log_type, l.title, l.description || '', l.technician || '',
                     l.work_date, l.duration_hours || null, l.parts_used || '', l.parts_cost || 0, l.next_due || '']);
            });
        }

        saveDB();
        console.log('  ✅ Seed data ensured');
    } catch (e) {
        console.log('  ⚠️ Seed error:', e.message);
    }

    // Create admin if not exists
    const admin = dbGet("SELECT id FROM users WHERE username = 'admin'");
    if (!admin) {
        dbRun("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
            ['admin', bcrypt.hashSync('admin123', 10), 'Διαχειριστής', 'admin']);
    }

    saveDB();
    console.log('  ✅ Database initialized');
}

// ===== Middleware =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'factory-maintenance-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
    if (req.session && req.session.userId) {
        req.user = dbGet('SELECT id, username, full_name, role FROM users WHERE id = ?', [req.session.userId]);
    }
    next();
});

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
    const user = dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Λανθασμένο username ή κωδικός' });
    }
    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username, fullName: user.full_name, role: user.role });
});

app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    res.json({ id: req.user.id, username: req.user.username, fullName: req.user.full_name, role: req.user.role });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
        return res.status(400).json({ error: 'Λανθασμένος κωδικός' });
    }
    dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), req.user.id]);
    res.json({ success: true });
});

// ===== MAPS =====
app.get('/api/maps', requireAuth, (req, res) => {
    const maps = dbAll('SELECT id, name, sort_order, created_at FROM maps ORDER BY sort_order, id');
    res.json(maps);
});

app.get('/api/maps/:id', requireAuth, (req, res) => {
    const map = dbGet('SELECT * FROM maps WHERE id = ?', [parseInt(req.params.id)]);
    if (!map) return res.status(404).json({ error: 'Not found' });
    res.json(map);
});

app.post('/api/maps', requireRole('admin'), (req, res) => {
    const { name, image_data } = req.body;
    dbRun('INSERT INTO maps (name, image_data, sort_order) VALUES (?, ?, 0)', [name || 'Νέος Χάρτη', image_data || '']);
    const map = dbGet('SELECT id, name, sort_order, created_at FROM maps ORDER BY id DESC LIMIT 1');
    res.json(map);
});

app.put('/api/maps/:id', requireRole('admin'), (req, res) => {
    const { name } = req.body;
    dbRun('UPDATE maps SET name = ? WHERE id = ?', [name, parseInt(req.params.id)]);
    res.json(dbGet('SELECT id, name, sort_order FROM maps WHERE id = ?', [parseInt(req.params.id)]));
});

app.put('/api/maps/:id/image', requireRole('admin'), (req, res) => {
    const { image_data } = req.body;
    dbRun('UPDATE maps SET image_data = ? WHERE id = ?', [image_data, parseInt(req.params.id)]);
    res.json({ success: true });
});

app.delete('/api/maps/:id', requireRole('admin'), (req, res) => {
    const mapId = parseInt(req.params.id);
    dbRun('DELETE FROM equipment WHERE map_id = ?', [mapId]);
    dbRun('DELETE FROM maps WHERE id = ?', [mapId]);
    res.json({ success: true });
});

// ===== EQUIPMENT =====
app.get('/api/equipment', requireAuth, (req, res) => {
    const mapId = req.query.map_id;
    if (mapId) {
        res.json(dbAll('SELECT * FROM equipment WHERE map_id = ? ORDER BY name', [parseInt(mapId)]));
    } else {
        res.json(dbAll('SELECT * FROM equipment ORDER BY name'));
    }
});

app.get('/api/equipment/:id', requireAuth, (req, res) => {
    const eq = dbGet('SELECT * FROM equipment WHERE id = ?', [parseInt(req.params.id)]);
    if (!eq) return res.status(404).json({ error: 'Not found' });
    res.json(eq);
});

app.post('/api/equipment', requireRole('admin', 'supervisor'), (req, res) => {
    const d = req.body;
    dbRun('INSERT INTO equipment (map_id,name,code,type,status,manufacturer,model,serial,install_date,notes,pos_x,pos_y) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [d.map_id, d.name, d.code || '', d.type || '', d.status || 'operational',
         d.manufacturer || '', d.model || '', d.serial || '', d.install_date || '',
         d.notes || '', d.pos_x || 0, d.pos_y || 0]);
    const eq = dbGet('SELECT * FROM equipment ORDER BY id DESC LIMIT 1');
    res.json(eq);
});

app.put('/api/equipment/:id', requireRole('admin', 'supervisor'), (req, res) => {
    const d = req.body;
    dbRun('UPDATE equipment SET name=?,code=?,type=?,status=?,manufacturer=?,model=?,serial=?,install_date=?,notes=?,updated_at=datetime(\'now\') WHERE id=?',
        [d.name, d.code || '', d.type || '', d.status || 'operational',
         d.manufacturer || '', d.model || '', d.serial || '', d.install_date || '',
         d.notes || '', parseInt(req.params.id)]);
    res.json(dbGet('SELECT * FROM equipment WHERE id = ?', [parseInt(req.params.id)]));
});

app.delete('/api/equipment/:id', requireRole('admin'), (req, res) => {
    const eqId = parseInt(req.params.id);
    dbRun('DELETE FROM maintenance_log WHERE equipment_id = ?', [eqId]);
    dbRun('DELETE FROM equipment WHERE id = ?', [eqId]);
    res.json({ success: true });
});

// ===== MAINTENANCE =====
app.get('/api/maintenance/:equipmentId', requireAuth, (req, res) => {
    res.json(dbAll('SELECT * FROM maintenance_log WHERE equipment_id = ? ORDER BY work_date DESC',
        [parseInt(req.params.equipmentId)]));
});

app.post('/api/maintenance', requireAuth, (req, res) => {
    const d = req.body;
    dbRun('INSERT INTO maintenance_log (equipment_id,log_type,title,description,technician,work_date,duration_hours,parts_used,parts_cost,next_due) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [d.equipment_id, d.log_type || 'maintenance', d.title, d.description || '',
         d.technician || '', d.work_date, d.duration_hours || null, d.parts_used || '',
         d.parts_cost || 0, d.next_due || '']);
    if (d.log_type === 'breakdown') {
        dbRun("UPDATE equipment SET status='breakdown' WHERE id=?", [parseInt(d.equipment_id)]);
    } else if (d.log_type === 'maintenance') {
        dbRun("UPDATE equipment SET status='operational' WHERE id=?", [parseInt(d.equipment_id)]);
    }
    res.json(dbGet('SELECT * FROM maintenance_log ORDER BY id DESC LIMIT 1'));
});

app.put('/api/maintenance/:id', requireAuth, (req, res) => {
    const d = req.body;
    dbRun('UPDATE maintenance_log SET title=?,description=?,technician=?,work_date=?,duration_hours=?,parts_used=?,parts_cost=?,next_due=? WHERE id=?',
        [d.title, d.description || '', d.technician || '', d.work_date,
         d.duration_hours || null, d.parts_used || '', d.parts_cost || 0,
         d.next_due || '', parseInt(req.params.id)]);
    res.json(dbGet('SELECT * FROM maintenance_log WHERE id = ?', [parseInt(req.params.id)]));
});

app.delete('/api/maintenance/:id', requireRole('supervisor', 'admin'), (req, res) => {
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
        [d.name, d.code || '', d.quantity || 0, d.min_stock || 5, d.unit || 'τεμ',
         d.price || 0, d.supplier || '', d.location || '']);
    res.json(dbGet('SELECT * FROM inventory ORDER BY id DESC LIMIT 1'));
});

app.put('/api/inventory/:id', requireAuth, (req, res) => {
    const d = req.body;
    dbRun('UPDATE inventory SET name=?,code=?,quantity=?,min_stock=?,unit=?,price=?,supplier=?,location=? WHERE id=?',
        [d.name, d.code || '', d.quantity || 0, d.min_stock || 5, d.unit || 'τεμ',
         d.price || 0, d.supplier || '', d.location || '', parseInt(req.params.id)]);
    res.json(dbGet('SELECT * FROM inventory WHERE id = ?', [parseInt(req.params.id)]));
});

app.patch('/api/inventory/:id/stock', requireAuth, (req, res) => {
    dbRun('UPDATE inventory SET quantity = MAX(0, quantity + ?) WHERE id = ?',
        [req.body.delta, parseInt(req.params.id)]);
    res.json(dbGet('SELECT * FROM inventory WHERE id = ?', [parseInt(req.params.id)]));
});

app.delete('/api/inventory/:id', requireRole('supervisor', 'admin'), (req, res) => {
    dbRun('DELETE FROM inventory WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
});

// ===== USERS =====
app.get('/api/users', requireRole('admin'), (req, res) => {
    res.json(dbAll('SELECT id, username, full_name, role FROM users ORDER BY id'));
});

app.post('/api/users', requireRole('admin'), (req, res) => {
    const { username, password, fullName, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username + password required' });
    try {
        dbRun('INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
            [username.toLowerCase(), bcrypt.hashSync(password, 10), fullName || '', role || 'technician']);
        res.json(dbGet('SELECT id, username, full_name, role FROM users ORDER BY id DESC LIMIT 1'));
    } catch (e) {
        res.status(400).json({ error: 'Το username υπάρχει ήδη' });
    }
});

app.delete('/api/users/:id', requireRole('admin'), (req, res) => {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Δεν μπορείς να διαγράψεις τον εαυτό σου' });
    dbRun('DELETE FROM users WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
});

// ===== STATS =====
app.get('/api/stats', requireAuth, (req, res) => {
    const total = (dbGet('SELECT COUNT(*) as c FROM equipment') || {}).c || 0;
    const ok = (dbGet("SELECT COUNT(*) as c FROM equipment WHERE status='operational'") || {}).c || 0;
    const bd = (dbGet("SELECT COUNT(*) as c FROM equipment WHERE status='breakdown'") || {}).c || 0;
    const ls = dbAll('SELECT * FROM inventory WHERE quantity <= min_stock');
    const rl = dbAll('SELECT ml.*,e.name as equipment_name FROM maintenance_log ml LEFT JOIN equipment e ON ml.equipment_id=e.id ORDER BY ml.created_at DESC LIMIT 10');
    const pb = dbAll("SELECT e.id,e.name,COUNT(ml.id) as cnt FROM equipment e JOIN maintenance_log ml ON e.id=ml.equipment_id WHERE ml.log_type='breakdown' GROUP BY e.id ORDER BY cnt DESC LIMIT 5");
    res.json({ totalEquipment: total, operational: ok, breakdown: bd, lowStock: ls, recentLogs: rl, problemEquipment: pb });
});

// ===== START =====
initDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('  🏭 Factory Maintenance Server');
        console.log('  ─────────────────────────────');
        console.log(`  Local: http://localhost:${PORT}`);
        console.log('  Login: admin / admin123');
    });
}).catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
});
