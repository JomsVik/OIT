require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json());

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

app.post('/api/admins/login', async (req, res) => {
    const { login_id, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM admins WHERE login_id = $1', [login_id]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Администратор не найден' });
        }
        const admin = result.rows[0];
        
        if (admin.login_id.startsWith('DELETED_')) {
            return res.status(403).json({ error: 'Учетная запись удалена, вход запрещен' });
        }

        const valid = await bcrypt.compare(password, admin.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }
        res.json({
            success: true,
            id: admin.id,
            login_id: admin.login_id,
            full_name: admin.full_name,
            role: admin.role,
            color_theme: admin.color_theme || '#4a9eff'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/login', async (req, res) => {
    const { login_id, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE login_id = $1', [login_id]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        const user = result.rows[0];
        
        if (user.login_id.startsWith('DELETED_')) {
            return res.status(403).json({ error: 'Учетная запись удалена, вход запрещен' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }
        res.json({
            success: true,
            id: user.id,
            login_id: user.login_id,
            full_name: user.full_name,
            department: user.department,
            position: user.position
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// УПРАВЛЕНИЕ АДМИНАМИ
// ============================================================

app.post('/api/admins/create', async (req, res) => {
    const { login_id, password, full_name, role, phone_number, color_theme, created_by } = req.body;
    
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [created_by]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'director') {
        return res.status(403).json({ error: 'Только директор может создавать администраторов' });
    }
    
    try {
        const password_hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO admins (login_id, password_hash, full_name, role, phone_number, color_theme, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, login_id, full_name, role`,
            [login_id, password_hash, full_name, role, phone_number, color_theme || '#4a9eff', created_by]
        );
        res.json({ success: true, admin: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admins/:id/password', async (req, res) => {
    const { password, current_admin_id } = req.body;
    const adminId = req.params.id;
    
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [current_admin_id]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'director') {
        return res.status(403).json({ error: 'Только директор может менять пароли' });
    }
    
    try {
        const password_hash = await bcrypt.hash(password, 10);
        await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [password_hash, adminId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admins/:id', async (req, res) => {
    const { full_name, role, phone_number, color_theme, current_admin_id } = req.body;
    const adminId = req.params.id;
    
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [current_admin_id]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'director') {
        return res.status(403).json({ error: 'Только директор может редактировать' });
    }
    
    try {
        await pool.query(
            `UPDATE admins SET full_name = $1, role = $2, phone_number = $3, color_theme = $4 WHERE id = $5`,
            [full_name, role, phone_number, color_theme, adminId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admins/:id', async (req, res) => {
    const { current_admin_id } = req.body;
    const adminId = req.params.id;
    
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [current_admin_id]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'director') {
        return res.status(403).json({ error: 'Только директор может удалять' });
    }
    
    if (adminId == current_admin_id) {
        return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    
    try {
        await pool.query('DELETE FROM admins WHERE id = $1', [adminId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admins/all', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, login_id, full_name, role, phone_number, color_theme, created_at,
                    (SELECT full_name FROM admins a2 WHERE a2.id = a.created_by) as created_by_name
             FROM admins a ORDER BY id`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admins', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, login_id, full_name, role FROM admins ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ
// ============================================================

app.post('/api/users/create', async (req, res) => {
    const { login_id, password, full_name, department, position, created_by } = req.body;
    
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [created_by]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'director') {
        return res.status(403).json({ error: 'Только директор может создавать пользователей' });
    }
    
    try {
        const password_hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (login_id, password_hash, full_name, department, position, created_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, login_id, full_name`,
            [login_id, password_hash, full_name, department, position, created_by]
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/password', async (req, res) => {
    const { password, current_admin_id } = req.body;
    const userId = req.params.id;
    
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [current_admin_id]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'director') {
        return res.status(403).json({ error: 'Только директор может менять пароли' });
    }
    
    try {
        const password_hash = await bcrypt.hash(password, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { full_name, department, position, current_admin_id } = req.body;
    const userId = req.params.id;
    
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [current_admin_id]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'director') {
        return res.status(403).json({ error: 'Только директор может редактировать' });
    }
    
    try {
        await pool.query(
            `UPDATE users SET full_name = $1, department = $2, position = $3 WHERE id = $4`,
            [full_name, department, position, userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    const { current_admin_id } = req.body;
    const userId = req.params.id;
    
    const adminCheck = await pool.query('SELECT role FROM admins WHERE id = $1', [current_admin_id]);
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'director') {
        return res.status(403).json({ error: 'Только директор может удалять' });
    }
    
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/all', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.*, a.full_name as created_by_name
             FROM users u
             LEFT JOIN admins a ON u.created_by = a.id
             ORDER BY u.id`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/phones', async (req, res) => {
    try {
        const result = await pool.query('SELECT phone_number FROM admins ORDER BY id');
        res.json(result.rows.map(r => r.phone_number));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ЗАЯВКИ
// ============================================================

app.get('/api/tickets', async (req, res) => {
    const archived = req.query.archived === 'true';
    const isAdmin = req.query.admin === 'true';
    
    try {
        let query, params = [archived];
        
        if (isAdmin) {
            query = `
                SELECT t.*, 
                        array_agg(jsonb_build_object(
                            'id', c.id,
                            'comment_text', c.comment_text,
                            'admin_id', c.admin_id,
                            'admin_name', a.full_name,
                            'admin_role', a.role,
                            'user_id', c.user_id,
                            'user_name', u.full_name,
                            'created_at', c.created_at,
                            'is_public', c.is_public
                        )) FILTER (WHERE c.id IS NOT NULL) as comments
                 FROM tickets t
                 LEFT JOIN ticket_comments c ON t.id = c.ticket_id
                 LEFT JOIN admins a ON c.admin_id = a.id
                 LEFT JOIN users u ON c.user_id = u.id
                 WHERE t.status = $1
                 GROUP BY t.id
                 ORDER BY t.created_at DESC
            `;
        } else {
            query = `
                SELECT t.*, 
                        array_agg(jsonb_build_object(
                            'id', c.id,
                            'comment_text', c.comment_text,
                            'admin_id', c.admin_id,
                            'admin_name', a.full_name,
                            'admin_role', a.role,
                            'user_id', c.user_id,
                            'user_name', u.full_name,
                            'created_at', c.created_at,
                            'is_public', c.is_public
                        )) FILTER (WHERE c.id IS NOT NULL AND c.is_public = true) as comments
                 FROM tickets t
                 LEFT JOIN ticket_comments c ON t.id = c.ticket_id
                 LEFT JOIN admins a ON c.admin_id = a.id
                 LEFT JOIN users u ON c.user_id = u.id
                 WHERE t.status = $1
                 GROUP BY t.id
                 ORDER BY t.created_at DESC
            `;
        }
        
        const result = await pool.query(query, params);
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

app.post('/api/tickets', async (req, res) => {
    try {
        const { problem, location, employee, comment, urgency, user_id } = req.body;
        const trackingToken = String(Math.floor(100000 + Math.random() * 900000));

        const result = await pool.query(
            `INSERT INTO tickets (
                problem_desc, location, employee_info, comment, urgency,
                tracking_token, status, created_at, user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, false, NOW(), $7)
            RETURNING id, tracking_token, created_at`,
            [problem, location, employee, comment, urgency, trackingToken, user_id]
        );

        const ticketId = result.rows[0].id;
        const token = result.rows[0].tracking_token;
        const createdAt = result.rows[0].created_at;
        const colorClass = getColorClass(createdAt);

        await pool.query('UPDATE tickets SET color_class = $1 WHERE id = $2', [colorClass, ticketId]);

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
        const result = await pool.query(
            'UPDATE tickets SET status = FALSE, completed_at = NULL WHERE id = $1 RETURNING *',
            [req.params.id]
        );
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
    const { comment_text, admin_id, user_id, is_public } = req.body;
    const ticketId = req.params.id;
    
    if (!comment_text || comment_text.trim().length === 0) {
        return res.status(400).json({ error: 'Комментарий не может быть пустым' });
    }

    try {
        const ticketCheck = await pool.query('SELECT id FROM tickets WHERE id = $1', [ticketId]);
        if (ticketCheck.rows.length === 0) return res.status(404).json({ error: 'Заявка не найдена' });

        let userId = null, adminId = null;
        if (admin_id) adminId = admin_id;
        else if (user_id) userId = user_id;
        else return res.status(400).json({ error: 'Не указан автор комментария' });

        const publicStatus = is_public !== undefined ? is_public : true;

        const result = await pool.query(
            `INSERT INTO ticket_comments (ticket_id, admin_id, user_id, comment_text, is_public)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [ticketId, adminId, userId, comment_text.trim(), publicStatus]
        );

        res.json({ success: true, commentId: result.rows[0].id });
    } catch (err) {
        console.error('❌ Ошибка добавления комментария:', err);
        res.status(500).json({ error: 'Ошибка при добавлении комментария: ' + err.message });
    }
});

app.delete('/api/tickets/:id', async (req, res) => {
    const { admin_role } = req.query;
    if (admin_role !== 'super_admin' && admin_role !== 'director') {
        return res.status(403).json({ error: 'Только главный администратор или директор может удалять заявки' });
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

app.get('/api/ticket/track/:token', async (req, res) => {
    try {
        const token = req.params.token;
        const result = await pool.query(
            `SELECT t.*, 
                    array_agg(jsonb_build_object(
                        'id', c.id,
                        'comment_text', c.comment_text,
                        'admin_id', c.admin_id,
                        'admin_name', a.full_name,
                        'admin_role', a.role,
                        'user_id', c.user_id,
                        'user_name', u.full_name,
                        'created_at', c.created_at,
                        'is_public', c.is_public
                    )) FILTER (WHERE c.id IS NOT NULL AND c.is_public = true) as comments
             FROM tickets t
             LEFT JOIN ticket_comments c ON t.id = c.ticket_id
             LEFT JOIN admins a ON c.admin_id = a.id
             LEFT JOIN users u ON c.user_id = u.id
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
                        'admin_name', a.full_name,
                        'admin_role', a.role,
                        'user_id', c.user_id,
                        'user_name', u.full_name,
                        'created_at', c.created_at,
                        'is_public', c.is_public
                    )) FILTER (WHERE c.id IS NOT NULL AND c.is_public = true) as comments
             FROM tickets t
             LEFT JOIN ticket_comments c ON t.id = c.ticket_id
             LEFT JOIN admins a ON c.admin_id = a.id
             LEFT JOIN users u ON c.user_id = u.id
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
// ЗАДАЧИ
// ============================================================

app.get('/api/tasks', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, 
                   a1.full_name as assigned_to_name,
                   a2.full_name as created_by_name,
                   a3.full_name as completed_by_name,
                   a1.role as assigned_to_role,
                   a2.role as created_by_role
            FROM tasks t
            LEFT JOIN admins a1 ON t.assigned_to = a1.id
            LEFT JOIN admins a2 ON t.created_by = a2.id
            LEFT JOIN admins a3 ON t.completed_by = a3.id
            WHERE t.status != 'completed'
            ORDER BY 
                CASE t.status WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 END,
                t.created_at DESC
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
            SELECT t.*, 
                   a1.full_name as assigned_to_name,
                   a2.full_name as created_by_name,
                   a3.full_name as completed_by_name
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
    
    const adminCheck = await pool.query('SELECT id FROM admins WHERE id = $1', [created_by]);
    if (adminCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Только администраторы могут создавать задачи' });
    }
    
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
    if (adminCheck.rows.length === 0 || (adminCheck.rows[0].role !== 'super_admin' && adminCheck.rows[0].role !== 'director')) {
        return res.status(403).json({ error: 'Только главный администратор или директор может редактировать задачи' });
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
    if (admin_role !== 'super_admin' && admin_role !== 'director') {
        return res.status(403).json({ error: 'Только главный администратор или директор может удалять задачи' });
    }
    try {
        await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка удаления задачи:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// КОММЕНТАРИИ К ЗАДАЧАМ
// ============================================================

app.get('/api/tasks/:id/comments', async (req, res) => {
    const taskId = req.params.id;
    try {
        const result = await pool.query(
            `SELECT c.*, 
                    a.full_name as admin_name, 
                    a.role as admin_role,
                    u.full_name as user_name
             FROM task_comments c
             LEFT JOIN admins a ON c.admin_id = a.id
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.task_id = $1
             ORDER BY c.created_at ASC`,
            [taskId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка загрузки комментариев:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks/:id/comments', async (req, res) => {
    const taskId = req.params.id;
    const { comment_text, admin_id, user_id } = req.body;
    
    if (!comment_text || comment_text.trim().length === 0) {
        return res.status(400).json({ error: 'Комментарий не может быть пустым' });
    }

    try {
        const taskCheck = await pool.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        let userId = null;
        let adminId = null;
        if (admin_id) adminId = admin_id;
        else if (user_id) userId = user_id;
        else return res.status(400).json({ error: 'Не указан автор' });

        const result = await pool.query(
            `INSERT INTO task_comments (task_id, admin_id, user_id, comment_text)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [taskId, adminId, userId, comment_text.trim()]
        );
        res.json({ success: true, commentId: result.rows[0].id });
    } catch (err) {
        console.error('❌ Ошибка добавления комментария:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ОТЧЕТЫ
// ============================================================

app.get('/api/reports', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.*, a.full_name as created_by_name
             FROM reports r
             LEFT JOIN admins a ON r.created_by = a.id
             ORDER BY r.created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка загрузки отчетов:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reports', async (req, res) => {
    const { title, description, report_data, created_by } = req.body;
    if (!title || title.trim().length === 0) return res.status(400).json({ error: 'Название отчета обязательно' });
    try {
        const result = await pool.query(
            `INSERT INTO reports (title, description, report_data, created_by)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [title.trim(), description || null, report_data || '{}', created_by]
        );
        res.json({ success: true, report: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка создания отчета:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/reports/:id', async (req, res) => {
    const { title, description, report_data } = req.body;
    const reportId = req.params.id;
    try {
        const result = await pool.query(
            `UPDATE reports SET title = $1, description = $2, report_data = $3, updated_at = NOW()
             WHERE id = $4 RETURNING *`,
            [title || 'Отчет', description || null, report_data || '{}', reportId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Отчет не найден' });
        res.json({ success: true, report: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка обновления отчета:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/reports/:id', async (req, res) => {
    const reportId = req.params.id;
    const { admin_role } = req.query;
    if (admin_role !== 'super_admin' && admin_role !== 'director') {
        return res.status(403).json({ error: 'Только главный администратор или директор может удалять отчеты' });
    }
    try {
        await pool.query('DELETE FROM reports WHERE id = $1', [reportId]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка удаления отчета:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ИНВЕНТАРЬ
// ============================================================

app.get('/api/inventory/:type', async (req, res) => {
    const allowed = ['laptops', 'computers', 'printers'];
    if (!allowed.includes(req.params.type)) return res.status(400).json({ error: 'Invalid type' });
    try {
        const result = await pool.query(`SELECT * FROM inventory_${req.params.type} ORDER BY inventory_number`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/:type', async (req, res) => {
    const allowed = ['laptops', 'computers', 'printers'];
    if (!allowed.includes(req.params.type)) return res.status(400).json({ error: 'Invalid type' });
    try {
        const data = req.body;
        let query, values;
        if (req.params.type === 'laptops' || req.params.type === 'computers') {
            query = `INSERT INTO inventory_${req.params.type} (inventory_number, responsible, location, cpu, ram, storage, windows_version, ip_inet, ip_lan, mac, name, manufacturer)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`;
            values = [data.inventory_number, data.responsible, data.location, data.cpu, data.ram, data.storage, data.windows_version, data.ip_inet, data.ip_lan, data.mac, data.name, data.manufacturer];
        } else {
            query = `INSERT INTO inventory_printers (inventory_number, model, cartridge, location, ip, comment)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
            values = [data.inventory_number, data.model, data.cartridge, data.location, data.ip, data.comment];
        }
        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/inventory/:type/:id', async (req, res) => {
    const allowed = ['laptops', 'computers', 'printers'];
    if (!allowed.includes(req.params.type)) return res.status(400).json({ error: 'Invalid type' });
    try {
        const data = req.body;
        let query, values;
        if (req.params.type === 'laptops' || req.params.type === 'computers') {
            query = `UPDATE inventory_${req.params.type} SET 
                     inventory_number = $1, responsible = $2, location = $3, cpu = $4, ram = $5, storage = $6,
                     windows_version = $7, ip_inet = $8, ip_lan = $9, mac = $10, name = $11, manufacturer = $12
                     WHERE id = $13 RETURNING *`;
            values = [data.inventory_number, data.responsible, data.location, data.cpu, data.ram, data.storage, data.windows_version, data.ip_inet, data.ip_lan, data.mac, data.name, data.manufacturer, req.params.id];
        } else {
            query = `UPDATE inventory_printers SET 
                     inventory_number = $1, model = $2, cartridge = $3, location = $4, ip = $5, comment = $6
                     WHERE id = $7 RETURNING *`;
            values = [data.inventory_number, data.model, data.cartridge, data.location, data.ip, data.comment, req.params.id];
        }
        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inventory/:type/:id', async (req, res) => {
    const allowed = ['laptops', 'computers', 'printers'];
    if (!allowed.includes(req.params.type)) return res.status(400).json({ error: 'Invalid type' });
    try {
        await pool.query(`DELETE FROM inventory_${req.params.type} WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// КОММУТАТОРЫ
// ============================================================

app.get('/api/switches', async (req, res) => {
    try {
        const switchesRes = await pool.query('SELECT * FROM switches ORDER BY inventory_number');
        const switches = switchesRes.rows;

        for (const sw of switches) {
            const portsRes = await pool.query(
                'SELECT * FROM switch_ports WHERE switch_id = $1 ORDER BY port_number',
                [sw.id]
            );
            sw.ports = portsRes.rows;
        }

        res.json(switches);
    } catch (err) {
        console.error('❌ Ошибка загрузки коммутаторов:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/switches', async (req, res) => {
    const { inventory_number, model, manufacturer, ports_count, ip, mac, location, connection_method, sn, comment } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO switches (inventory_number, model, manufacturer, ports_count, ip, mac, location, connection_method, sn, comment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [inventory_number, model, manufacturer, ports_count || 0, ip, mac, location, connection_method, sn, comment]
        );
        res.json({ success: true, switch: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка создания коммутатора:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/switches/:id', async (req, res) => {
    const { inventory_number, model, manufacturer, ports_count, ip, mac, location, connection_method, sn, comment } = req.body;
    try {
        const result = await pool.query(
            `UPDATE switches SET inventory_number = $1, model = $2, manufacturer = $3, ports_count = $4,
             ip = $5, mac = $6, location = $7, connection_method = $8, sn = $9, comment = $10
             WHERE id = $11 RETURNING *`,
            [inventory_number, model, manufacturer, ports_count || 0, ip, mac, location, connection_method, sn, comment, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Коммутатор не найден' });
        res.json({ success: true, switch: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка обновления коммутатора:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/switches/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM switches WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка удаления коммутатора:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/switches/:id/ports', async (req, res) => {
    const { port_number, port_label, destination, status, speed, vlan, comment } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO switch_ports (switch_id, port_number, port_label, destination, status, speed, vlan, comment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [req.params.id, port_number, port_label, destination, status || 'free', speed, vlan, comment]
        );
        res.json({ success: true, port: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка добавления порта:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/switch-ports/:id', async (req, res) => {
    const { port_number, port_label, destination, status, speed, vlan, comment } = req.body;
    try {
        const result = await pool.query(
            `UPDATE switch_ports SET port_number = $1, port_label = $2, destination = $3, status = $4,
             speed = $5, vlan = $6, comment = $7 WHERE id = $8 RETURNING *`,
            [port_number, port_label, destination, status, speed, vlan, comment, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Порт не найден' });
        res.json({ success: true, port: result.rows[0] });
    } catch (err) {
        console.error('❌ Ошибка обновления порта:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/switch-ports/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM switch_ports WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка удаления порта:', err);
        res.status(500).json({ error: err.message });
    }
});

app.use(express.static(path.join(__dirname, 'publick')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server: http://localhost:${PORT}`);
    console.log('📋 Тестовые логины:');
    console.log('  👑 Директор: dmitry / 123456');
});