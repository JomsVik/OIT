require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json());

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function getClientIP(req) {
    const ip = req.headers['cf-connecting-ip'] ||
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip ||
               '0.0.0.0';
    return ip.replace(/^::ffff:/, '');
}

async function checkBlockedIP(req, res, next) {
    const ip = getClientIP(req);
    if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') {
        return next();
    }
    try {
        const result = await pool.query('SELECT reason FROM blocked_ips WHERE ip_address = $1', [ip]);
        if (result.rows.length > 0) {
            return res.status(403).json({ error: 'Ваш IP-адрес заблокирован. Причина: ' + result.rows[0].reason });
        }
        next();
    } catch (err) {
        console.error('❌ Ошибка проверки блокировки:', err);
        next();
    }
}

async function logIPStats(req, res, next) {
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') {
        return next();
    }
    try {
        await pool.query(
            `INSERT INTO ip_stats (ip_address, user_agents, last_seen, request_count)
             VALUES ($1, ARRAY[$2], NOW(), 1)
             ON CONFLICT (ip_address) 
             DO UPDATE SET 
                request_count = ip_stats.request_count + 1,
                last_seen = NOW(),
                user_agents = array_append(
                    CASE WHEN $2 = ANY(ip_stats.user_agents) THEN ip_stats.user_agents ELSE array_append(ip_stats.user_agents, $2) END, $2
                )
             WHERE ip_stats.ip_address = $1`,
            [ip, userAgent]
        );
    } catch (err) {
        console.error('❌ Ошибка логирования IP:', err);
    }
    next();
}

function getColorClass(createdAt) {
    const now = new Date();
    const created = new Date(createdAt);
    const diffHours = (now - created) / (1000 * 60 * 60);
    if (diffHours >= 24) return 'ticket-urgent-24h';
    if (diffHours >= 6) return 'ticket-urgent-6h';
    if (diffHours >= 3) return 'ticket-warning-3h';
    if (diffHours >= 1) return 'ticket-warning-1h';
    return 'ticket-normal';
}

// ============================================================
// АВТОРИЗАЦИЯ
// ============================================================

app.post('/api/login', async (req, res) => {
    const { login_id } = req.body;
    try {
        const result = await pool.query('SELECT id, login_id, role FROM admins WHERE login_id = $1', [login_id]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        const user = result.rows[0];
        res.json({ success: true, role: user.role || 'admin', userId: user.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// IP
// ============================================================

app.get('/api/ip', (req, res) => {
    res.json({ ip: getClientIP(req) });
});

// ============================================================
// ТЕЛЕФОНЫ
// ============================================================

app.get('/api/phones', async (req, res) => {
    try {
        const result = await pool.query('SELECT phone_number FROM admins ORDER BY id');
        res.json(result.rows.map(r => r.phone_number));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// АДМИНЫ
// ============================================================

app.get('/api/admins', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, login_id, role FROM admins ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ЗАЯВКИ
// ============================================================

app.get('/api/tickets', async (req, res) => {
    const archived = req.query.archived === 'true';
    try {
        const result = await pool.query(
            `SELECT t.*, 
                    array_agg(jsonb_build_object(
                        'id', c.id,
                        'comment_text', c.comment_text,
                        'admin_id', c.admin_id,
                        'created_at', c.created_at
                    )) FILTER (WHERE c.id IS NOT NULL) as comments
             FROM tickets t
             LEFT JOIN ticket_comments c ON t.id = c.ticket_id
             WHERE t.status = $1
             GROUP BY t.id
             ORDER BY t.created_at DESC`,
            [archived]
        );
        const tickets = result.rows.map(t => {
            if (!t.color_class) t.color_class = getColorClass(t.created_at);
            return t;
        });
        res.json(tickets);
    } catch (err) {
        console.error('❌ Ошибка загрузки заявок:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets', checkBlockedIP, logIPStats, async (req, res) => {
    try {
        const { problem, location, employee, comment, urgency } = req.body;
        const ip = getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        // Генерируем токен: 2 буквы + 2 цифры
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const letter1 = letters.charAt(Math.floor(Math.random() * letters.length));
        const letter2 = letters.charAt(Math.floor(Math.random() * letters.length));
        const num1 = Math.floor(Math.random() * 10);
        const num2 = Math.floor(Math.random() * 10);
        const trackingToken = letter1 + letter2 + num1 + num2;
        
        console.log('📝 Новая заявка:');
        console.log('  👤 Сотрудник:', employee);
        console.log('  🔑 Токен:', trackingToken);
        console.log('  🌐 IP:', ip);
        
        const result = await pool.query(
            `INSERT INTO tickets (
                problem_desc, location, employee_info, comment, urgency, 
                ip_address, user_agent, tracking_token, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())
            RETURNING id, tracking_token`,
            [problem, location, employee, comment, urgency, ip, userAgent, trackingToken]
        );
        
        const ticketId = result.rows[0].id;
        const token = result.rows[0].tracking_token;
        const colorClass = getColorClass(new Date());
        await pool.query('UPDATE tickets SET color_class = $1 WHERE id = $2', [colorClass, ticketId]);
        
        console.log(`✅ Заявка #${ticketId} создана, токен: ${token}`);
        res.json({ success: true, ticketId, trackingToken: token, color: colorClass });
    } catch (err) {
        console.error('❌ Ошибка создания заявки:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tickets/:id/complete', async (req, res) => {
    const { executor_name } = req.body;
    try {
        const current = await pool.query('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
        if (current.rows.length === 0) return res.status(404).json({ error: 'Заявка не найдена' });
        if (current.rows[0].status === true) return res.status(400).json({ error: 'Заявка уже выполнена' });
        
        const colorClass = getColorClass(current.rows[0].created_at);
        await pool.query(
            'UPDATE tickets SET status = TRUE, executor_name = $1, completed_at = NOW(), color_class = $2 WHERE id = $3',
            [executor_name, colorClass, req.params.id]
        );
        res.json({ success: true, color: colorClass });
    } catch (err) {
        console.error('❌ Ошибка завершения заявки:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tickets/:id/restore', async (req, res) => {
    try {
        const result = await pool.query('UPDATE tickets SET status = FALSE, completed_at = NULL WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Заявка не найдена' });
        const ticket = result.rows[0];
        const colorClass = getColorClass(ticket.created_at);
        await pool.query('UPDATE tickets SET color_class = $1 WHERE id = $2', [colorClass, ticket.id]);
        res.json({ success: true, ticket });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets/:id/comments', async (req, res) => {
    const { comment_text, admin_id } = req.body;
    const ticketId = req.params.id;
    if (!comment_text || comment_text.trim().length === 0) {
        return res.status(400).json({ error: 'Комментарий не может быть пустым' });
    }
    if (!admin_id) return res.status(400).json({ error: 'ID администратора обязателен' });

    try {
        const tableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ticket_comments')`);
        if (!tableCheck.rows[0].exists) {
            await pool.query(`CREATE TABLE ticket_comments (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
                admin_id INTEGER REFERENCES admins(id),
                comment_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )`);
        }
        const ticketCheck = await pool.query('SELECT id FROM tickets WHERE id = $1', [ticketId]);
        if (ticketCheck.rows.length === 0) return res.status(404).json({ error: 'Заявка не найдена' });
        const adminCheck = await pool.query('SELECT id FROM admins WHERE id = $1', [admin_id]);
        if (adminCheck.rows.length === 0) return res.status(404).json({ error: 'Администратор не найден' });

        const result = await pool.query(
            `INSERT INTO ticket_comments (ticket_id, admin_id, comment_text)
             VALUES ($1, $2, $3) RETURNING id, comment_text, admin_id, created_at`,
            [ticketId, admin_id, comment_text.trim()]
        );
        res.json({ success: true, comment: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка добавления комментария:', err);
        res.status(500).json({ error: 'Ошибка при добавлении комментария: ' + err.message });
    }
});

app.delete('/api/tickets/:id', async (req, res) => {
    const { admin_role } = req.query;
    if (admin_role !== 'super_admin') {
        return res.status(403).json({ error: 'Только главный администратор может удалять заявки' });
    }
    try {
        await pool.query('DELETE FROM ticket_comments WHERE ticket_id = $1', [req.params.id]);
        await pool.query('DELETE FROM tickets WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка удаления:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ОТСЛЕЖИВАНИЕ ПО ТОКЕНУ
// ============================================================

app.get('/api/ticket/track/:token', async (req, res) => {
    try {
        const token = req.params.token.toUpperCase();
        const result = await pool.query(
            `SELECT t.*, 
                    array_agg(jsonb_build_object(
                        'id', c.id,
                        'comment_text', c.comment_text,
                        'admin_id', c.admin_id,
                        'created_at', c.created_at
                    )) FILTER (WHERE c.id IS NOT NULL) as comments
             FROM tickets t
             LEFT JOIN ticket_comments c ON t.id = c.ticket_id
             WHERE t.tracking_token = $1
             GROUP BY t.id`,
            [token]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Заявка не найдена' });
        const ticket = result.rows[0];
        if (!ticket.color_class) ticket.color_class = getColorClass(ticket.created_at);
        res.json(ticket);
    } catch (err) {
        console.error('❌ Ошибка получения заявки по токену:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets/track', async (req, res) => {
    try {
        const { tokens } = req.body;
        if (!tokens || tokens.length === 0) return res.json([]);
        
        const result = await pool.query(
            `SELECT t.*, 
                    array_agg(jsonb_build_object(
                        'id', c.id,
                        'comment_text', c.comment_text,
                        'admin_id', c.admin_id,
                        'created_at', c.created_at
                    )) FILTER (WHERE c.id IS NOT NULL) as comments
             FROM tickets t
             LEFT JOIN ticket_comments c ON t.id = c.ticket_id
             WHERE t.tracking_token = ANY($1)
             GROUP BY t.id
             ORDER BY t.created_at DESC`,
            [tokens]
        );
        const tickets = result.rows.map(t => {
            if (!t.color_class) t.color_class = getColorClass(t.created_at);
            return t;
        });
        res.json(tickets);
    } catch (err) {
        console.error('❌ Ошибка получения заявок по токенам:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// IP СТАТИСТИКА
// ============================================================

app.get('/api/ip-stats', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ip_address, COUNT(*) as total_requests, array_agg(DISTINCT user_agent) as user_agents,
             MIN(created_at) as first_request, MAX(created_at) as last_request
             FROM tickets WHERE ip_address IS NOT NULL AND ip_address NOT IN ('127.0.0.1', '::1', '0.0.0.0')
             GROUP BY ip_address ORDER BY total_requests DESC LIMIT 100`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка получения статистики IP:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/block-ip', async (req, res) => {
    const { ip_address, reason, admin_id } = req.body;
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [admin_id]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'super_admin') {
        return res.status(403).json({ error: 'Только главный администратор может блокировать IP' });
    }
    if (!ip_address || ip_address.trim().length === 0) {
        return res.status(400).json({ error: 'IP-адрес обязателен' });
    }
    try {
        await pool.query(
            `INSERT INTO blocked_ips (ip_address, reason, blocked_by)
             VALUES ($1, $2, $3) ON CONFLICT (ip_address) DO UPDATE SET reason = $2, blocked_at = NOW(), blocked_by = $3`,
            [ip_address.trim(), reason || 'Без причины', admin_id]
        );
        res.json({ success: true, message: `IP ${ip_address} заблокирован` });
    } catch (err) {
        console.error('❌ Ошибка блокировки IP:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/block-ip/:ip', async (req, res) => {
    const { admin_id } = req.body;
    const ip_address = req.params.ip;
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [admin_id]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'super_admin') {
        return res.status(403).json({ error: 'Только главный администратор может разблокировать IP' });
    }
    try {
        await pool.query('DELETE FROM blocked_ips WHERE ip_address = $1', [ip_address]);
        res.json({ success: true, message: `IP ${ip_address} разблокирован` });
    } catch (err) {
        console.error('❌ Ошибка разблокировки IP:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/blocked-ips', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, a.login_id as blocked_by_name
            FROM blocked_ips b LEFT JOIN admins a ON b.blocked_by = a.id
            ORDER BY b.blocked_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка получения списка блокировок:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ЗАДАЧИ
// ============================================================

app.get('/api/tasks', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, a1.login_id as assigned_to_name, a2.login_id as created_by_name, a3.login_id as completed_by_name
            FROM tasks t
            LEFT JOIN admins a1 ON t.assigned_to = a1.id
            LEFT JOIN admins a2 ON t.created_by = a2.id
            LEFT JOIN admins a3 ON t.completed_by = a3.id
            WHERE t.status != 'completed'
            ORDER BY CASE t.status WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 END, t.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка загрузки задач:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tasks/archive', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, a1.login_id as assigned_to_name, a2.login_id as created_by_name, a3.login_id as completed_by_name
            FROM tasks t
            LEFT JOIN admins a1 ON t.assigned_to = a1.id
            LEFT JOIN admins a2 ON t.created_by = a2.id
            LEFT JOIN admins a3 ON t.completed_by = a3.id
            WHERE t.status = 'completed'
            ORDER BY t.completed_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка загрузки архива задач:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks', async (req, res) => {
    const { title, description, assigned_to, priority, due_date, created_by } = req.body;
    if (!title || title.trim().length === 0) return res.status(400).json({ error: 'Название задачи обязательно' });
    try {
        const result = await pool.query(
            `INSERT INTO tasks (title, description, assigned_to, created_by, priority, due_date)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [title.trim(), description || null, assigned_to || null, created_by, priority || 'medium', due_date || null]
        );
        res.json({ success: true, task: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка создания задачи:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/:id', async (req, res) => {
    const { title, description, assigned_to, priority, due_date, admin_id } = req.body;
    const taskId = req.params.id;
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [admin_id]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'super_admin') {
        return res.status(403).json({ error: 'Только главный администратор может редактировать задачи' });
    }
    if (!title || title.trim().length === 0) return res.status(400).json({ error: 'Название задачи обязательно' });
    try {
        const result = await pool.query(
            `UPDATE tasks SET title = $1, description = $2, assigned_to = $3, priority = $4, due_date = $5 WHERE id = $6 RETURNING *`,
            [title.trim(), description || null, assigned_to || null, priority || 'medium', due_date || null, taskId]
        );
        res.json({ success: true, task: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка редактирования задачи:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/:id/status', async (req, res) => {
    const { status, admin_id } = req.body;
    const taskId = req.params.id;
    if (!status) return res.status(400).json({ error: 'Статус обязателен' });
    try {
        let query = 'UPDATE tasks SET status = $1';
        const values = [status];
        let paramIndex = 2;
        if (status === 'completed') {
            query += `, completed_at = NOW(), completed_by = $${paramIndex}`;
            values.push(admin_id || null);
            paramIndex++;
        } else {
            query += ', completed_at = NULL, completed_by = NULL';
        }
        query += ` WHERE id = $${paramIndex} RETURNING *`;
        values.push(taskId);
        const result = await pool.query(query, values);
        res.json({ success: true, task: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка обновления статуса задачи:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tasks/:id', async (req, res) => {
    const { admin_role } = req.query;
    if (admin_role !== 'super_admin') return res.status(403).json({ error: 'Только главный администратор может удалять задачи' });
    try {
        await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка удаления задачи:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ИНВЕНТАРЬ
// ============================================================

// Ноутбуки
app.get('/api/inventory/laptops', async (req, res) => {
    try { const result = await pool.query('SELECT * FROM inventory_laptops ORDER BY inventory_number'); res.json(result.rows); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/inventory/laptops', async (req, res) => {
    try {
        const data = req.body;
        const result = await pool.query(
            `INSERT INTO inventory_laptops (inventory_number, responsible, location, cpu, ram, storage, windows_version, ip_inet, ip_lan, mac, name, manufacturer)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [data.inventory_number, data.responsible, data.location, data.cpu, data.ram, data.storage, data.windows_version, data.ip_inet, data.ip_lan, data.mac, data.name, data.manufacturer]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/inventory/laptops/:id', async (req, res) => {
    try {
        const data = req.body;
        const result = await pool.query(
            `UPDATE inventory_laptops SET inventory_number = $1, responsible = $2, location = $3, cpu = $4, ram = $5, storage = $6, windows_version = $7, ip_inet = $8, ip_lan = $9, mac = $10, name = $11, manufacturer = $12 WHERE id = $13 RETURNING *`,
            [data.inventory_number, data.responsible, data.location, data.cpu, data.ram, data.storage, data.windows_version, data.ip_inet, data.ip_lan, data.mac, data.name, data.manufacturer, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/inventory/laptops/:id', async (req, res) => {
    try { await pool.query('DELETE FROM inventory_laptops WHERE id = $1', [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

// Компьютеры
app.get('/api/inventory/computers', async (req, res) => {
    try { const result = await pool.query('SELECT * FROM inventory_computers ORDER BY inventory_number'); res.json(result.rows); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/inventory/computers', async (req, res) => {
    try {
        const data = req.body;
        const result = await pool.query(
            `INSERT INTO inventory_computers (inventory_number, responsible, location, cpu, ram, storage, windows_version, ip_inet, ip_lan, mac, name, manufacturer)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [data.inventory_number, data.responsible, data.location, data.cpu, data.ram, data.storage, data.windows_version, data.ip_inet, data.ip_lan, data.mac, data.name, data.manufacturer]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/inventory/computers/:id', async (req, res) => {
    try {
        const data = req.body;
        const result = await pool.query(
            `UPDATE inventory_computers SET inventory_number = $1, responsible = $2, location = $3, cpu = $4, ram = $5, storage = $6, windows_version = $7, ip_inet = $8, ip_lan = $9, mac = $10, name = $11, manufacturer = $12 WHERE id = $13 RETURNING *`,
            [data.inventory_number, data.responsible, data.location, data.cpu, data.ram, data.storage, data.windows_version, data.ip_inet, data.ip_lan, data.mac, data.name, data.manufacturer, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/inventory/computers/:id', async (req, res) => {
    try { await pool.query('DELETE FROM inventory_computers WHERE id = $1', [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

// Принтеры
app.get('/api/inventory/printers', async (req, res) => {
    try { const result = await pool.query('SELECT * FROM inventory_printers ORDER BY inventory_number'); res.json(result.rows); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/inventory/printers', async (req, res) => {
    try {
        const data = req.body;
        const result = await pool.query(
            `INSERT INTO inventory_printers (inventory_number, model, cartridge, location, ip, comment)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [data.inventory_number, data.model, data.cartridge, data.location, data.ip, data.comment]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/inventory/printers/:id', async (req, res) => {
    try {
        const data = req.body;
        const result = await pool.query(
            `UPDATE inventory_printers SET inventory_number = $1, model = $2, cartridge = $3, location = $4, ip = $5, comment = $6 WHERE id = $7 RETURNING *`,
            [data.inventory_number, data.model, data.cartridge, data.location, data.ip, data.comment, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/inventory/printers/:id', async (req, res) => {
    try { await pool.query('DELETE FROM inventory_printers WHERE id = $1', [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// СТАТИЧЕСКИЕ ФАЙЛЫ
// ============================================================

app.use(express.static(path.join(__dirname, 'publick')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server: http://localhost:${PORT}`);
    console.log('📋 Тестовые ID: admin, user1, user2');
    console.log('🔑 Токен: 2 буквы + 2 цифры (например: AB12)');
});