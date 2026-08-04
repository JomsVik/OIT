const app = {
    currentUser: null,
    currentUserType: null,

    sortState: {
        tickets: { field: 'created_at', order: 'desc' },
        ticketsArchived: { field: 'created_at', order: 'desc' },
        tasks: { field: 'created_at', order: 'desc' },
        tasksArchived: { field: 'completed_at', order: 'desc' }
    },

    searchState: {
        tickets: '',
        ticketsArchived: '',
        tasks: '',
        tasksArchived: '',
        inventory: ''
    },

    searchTimeout: null,
    autoRefreshInterval: null,
    isAutoRefreshEnabled: true,

    // ============================================================
    // ВХОД
    // ============================================================

    switchLoginTab(tab) {
        document.querySelectorAll('.login-tab').forEach(t => {
            t.classList.remove('active');
            t.style.background = 'transparent';
            t.style.color = '#4a5568';
        });
        const activeTab = document.querySelector(`.login-tab[data-tab="${tab}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.style.background = '#4a9eff';
            activeTab.style.color = '#fff';
        }
        document.getElementById('login-user-form').style.display = tab === 'user' ? 'block' : 'none';
        document.getElementById('login-admin-form').style.display = tab === 'admin' ? 'block' : 'none';
    },

    async userLogin() {
        const login = document.getElementById('user-login-input').value.trim();
        const password = document.getElementById('user-pass-input').value.trim();
        if (!login || !password) { alert('Введите логин и пароль'); return; }

        try {
            const res = await fetch('/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login_id: login, password })
            });
            if (res.ok) {
                const data = await res.json();
                this.currentUser = data;
                this.currentUserType = 'user';
                this.showScreen('screen-track-tickets');
                this.loadTrackedTickets();
            } else {
                const error = await res.json();
                alert('Ошибка: ' + (error.error || 'Неверный логин или пароль'));
            }
        } catch (err) { alert('Ошибка: ' + err.message); }
    },

    async adminLogin() {
        const login = document.getElementById('admin-login-input').value.trim();
        const password = document.getElementById('admin-pass-input').value.trim();
        if (!login || !password) { alert('Введите логин и пароль'); return; }

        try {
            const res = await fetch('/api/admins/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login_id: login, password })
            });
            if (res.ok) {
                const data = await res.json();
                this.currentUser = data;
                this.currentUserType = 'admin';

                const roleDisplay = document.getElementById('admin-role-indicator');
                roleDisplay.style.borderColor = data.color_theme || '#4a9eff';
                roleDisplay.style.boxShadow = `0 0 30px ${data.color_theme || '#4a9eff'}44`;

                let roleText = '👤 Администратор';
                if (data.role === 'director') {
                    roleText = `👑 Директор (${data.full_name})`;
                    roleDisplay.className = 'admin-role director';
                } else if (data.role === 'super_admin') {
                    roleText = `🛠️ Гл. Администратор (${data.full_name})`;
                    roleDisplay.className = 'admin-role super';
                } else {
                    roleText = `👤 Администратор (${data.full_name})`;
                    roleDisplay.className = 'admin-role';
                }
                roleDisplay.textContent = roleText;

                // Показываем вкладки только для директора
                const isDirector = data.role === 'director';
                document.querySelectorAll('.nav-btn[data-tab="users"]').forEach(el => el.style.display = isDirector ? 'inline-block' : 'none');
                document.querySelectorAll('.nav-btn[data-tab="admins"]').forEach(el => el.style.display = isDirector ? 'inline-block' : 'none');

                this.showScreen('screen-admin');
                this.switchTab('active');
            } else {
                const error = await res.json();
                alert('Ошибка: ' + (error.error || 'Неверный логин или пароль'));
            }
        } catch (err) { alert('Ошибка: ' + err.message); }
    },

    logout() {
        this.currentUser = null;
        this.currentUserType = null;
        this.showScreen('screen-login');
        this.stopAutoRefresh();
    },

    // ============================================================
    // НАВИГАЦИЯ
    // ============================================================

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(id);
        if (screen) screen.classList.add('active');

        if (id === 'screen-ticket' || id === 'screen-login' || id === 'screen-track-tickets' || id === 'screen-find-ticket') {
            document.documentElement.setAttribute('data-theme', 'light');
            this.stopAutoRefresh();
        } else if (id === 'screen-admin') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (this.isAutoRefreshEnabled) this.startAutoRefresh();
        } else {
            this.stopAutoRefresh();
        }

        if (id === 'screen-track-tickets') this.loadTrackedTickets();
    },

    // ============================================================
    // АВТООБНОВЛЕНИЕ
    // ============================================================

    startAutoRefresh() {
        if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
        this.autoRefreshInterval = setInterval(() => {
            const adminScreen = document.getElementById('screen-admin');
            if (!adminScreen || !adminScreen.classList.contains('active')) return;
            if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
            if (document.querySelector('.modal.active')) return;

            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            if (activeTab && !['reports', 'ip-stats', 'users', 'admins'].includes(activeTab.dataset.tab)) {
                const scrollY = window.scrollY;
                this.switchTab(activeTab.dataset.tab);
                setTimeout(() => window.scrollTo(0, scrollY), 50);
            }
        }, 30000);
    },

    stopAutoRefresh() {
        if (this.autoRefreshInterval) { clearInterval(this.autoRefreshInterval); this.autoRefreshInterval = null; }
    },

    toggleAutoRefresh() {
        const btn = document.getElementById('btn-auto-refresh');
        this.isAutoRefreshEnabled = !this.isAutoRefreshEnabled;
        if (this.isAutoRefreshEnabled) {
            this.startAutoRefresh();
            if (btn) { btn.textContent = '🔄 Авто (вкл)'; btn.style.background = '#4a9eff'; btn.style.color = '#fff'; }
        } else {
            this.stopAutoRefresh();
            if (btn) { btn.textContent = '⏸️ Авто (выкл)'; btn.style.background = '#fc8181'; btn.style.color = '#fff'; }
        }
    },

    refreshCurrentTab() {
        const activeTab = document.querySelector('.nav-btn.active[data-tab]');
        if (activeTab) {
            const scrollY = window.scrollY;
            this.switchTab(activeTab.dataset.tab);
            setTimeout(() => window.scrollTo(0, scrollY), 100);
        }
    },

    // ============================================================
    // ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
    // ============================================================

    switchTab(tab) {
        document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
        const targetBtn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
        if (targetBtn) targetBtn.classList.add('active');

        const containers = ['tickets-container', 'archived-container', 'tasks-container', 'tasks-archive-container', 'ip-container', 'inventory-container', 'reports-container', 'users-container', 'admins-container'];
        containers.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

        const map = {
            'active': () => { document.getElementById('tickets-container').style.display = 'block'; this.loadTickets(false); },
            'archived': () => { document.getElementById('archived-container').style.display = 'block'; this.loadTickets(true); },
            'tasks': () => { document.getElementById('tasks-container').style.display = 'block'; this.loadTasks(false); },
            'tasks-archive': () => { document.getElementById('tasks-archive-container').style.display = 'block'; this.loadTasks(true); },
            'ip-stats': () => { document.getElementById('ip-container').style.display = 'block'; this.loadIPStats(); },
            'inventory': () => { document.getElementById('inventory-container').style.display = 'block'; this.loadInventory(); },
            'reports': () => { document.getElementById('reports-container').style.display = 'block'; this.loadReports(); },
            'users': () => { document.getElementById('users-container').style.display = 'block'; this.loadUsers(); },
            'admins': () => { document.getElementById('admins-container').style.display = 'block'; this.loadAdminsList(); }
        };
        if (map[tab]) map[tab]();
    },

    // ============================================================
    // ВСПОМОГАТЕЛЬНЫЕ
    // ============================================================

    getTicketTimeClass(createdAt) {
        const now = new Date();
        const created = new Date(createdAt);
        const diffHours = (now - created) / (1000 * 60 * 60);
        if (diffHours >= 24) return 'ticket-urgent-24h';
        if (diffHours >= 6) return 'ticket-urgent-6h';
        if (diffHours >= 3) return 'ticket-warning-3h';
        if (diffHours >= 1) return 'ticket-warning-1h';
        return 'ticket-normal';
    },

    formatCommentAuthor(comment) {
        if (comment.admin_id) {
            const roleMap = { 'director': '👑 Директор', 'super_admin': '🛠️ Гл. Админ', 'admin': '👤 Админ' };
            return `${roleMap[comment.admin_role] || '👤 Админ'} ${comment.admin_name}`;
        } else if (comment.user_id) {
            return `👤 Пользователь ${comment.user_name || 'Без имени'}`;
        }
        return '👤 Неизвестный';
    },

    formatUserAgent(ua) {
        if (!ua) return 'Неизвестно';
        let result = [];
        if (ua.includes('Windows NT 10.0')) result.push('Windows 10/11');
        else if (ua.includes('Windows NT 6.1')) result.push('Windows 7');
        else if (ua.includes('Mac OS X')) result.push('macOS');
        else if (ua.includes('Linux') && !ua.includes('Android')) result.push('Linux');
        else if (ua.includes('Android')) result.push('Android');
        else if (ua.includes('iPhone') || ua.includes('iPad')) result.push('iOS');
        else result.push('Unknown OS');
        if (ua.includes('Chrome') && !ua.includes('Edg')) result.push('Chrome');
        else if (ua.includes('Firefox')) result.push('Firefox');
        else if (ua.includes('Safari') && !ua.includes('Chrome')) result.push('Safari');
        else if (ua.includes('Edg')) result.push('Edge');
        else result.push('Unknown Browser');
        if (ua.includes('Mobile')) result.push('📱');
        else result.push('💻');
        return result.join(' ');
    },

    sortData(data, field, order) {
        return [...data].sort((a, b) => {
            let va = a[field] || '', vb = b[field] || '';
            if (!isNaN(va) && !isNaN(vb)) { va = parseFloat(va); vb = parseFloat(vb); }
            else if (field.includes('_at')) { va = new Date(va); vb = new Date(vb); }
            else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
            if (va < vb) return order === 'asc' ? -1 : 1;
            if (va > vb) return order === 'asc' ? 1 : -1;
            return 0;
        });
    },

    searchData(data, query, fields) {
        if (!query || query.trim() === '') return data;
        const q = query.toLowerCase().trim();
        return data.filter(item => fields.some(f => {
            const val = item[f];
            if (!val) return false;
            return String(val).toLowerCase().includes(q);
        }));
    },

    handleSearch(key, value, type, archived) {
        this.searchState[key] = value;
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            if (type === 'tickets') this.updateTicketsList(archived);
            else if (type === 'tasks') this.updateTasksList(archived);
            else if (type === 'inventory') this.updateInventoryList();
        }, 300);
    },

    handleSearchEnter(e, key, type, archived) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (this.searchTimeout) clearTimeout(this.searchTimeout);
            this.searchState[key] = e.target.value;
            if (type === 'tickets') this.updateTicketsList(archived);
            else if (type === 'tasks') this.updateTasksList(archived);
            else if (type === 'inventory') this.updateInventoryList();
        }
    },

    clearSearch(key, type, archived) {
        const input = document.getElementById(`search-${key}`);
        if (input) { input.value = ''; this.searchState[key] = ''; input.focus(); }
        if (type === 'tickets') this.updateTicketsList(archived);
        else if (type === 'tasks') this.updateTasksList(archived);
        else if (type === 'inventory') this.updateInventoryList();
    },

    scrollUp() {
        const currentScroll = window.scrollY;
        window.scrollTo({ top: Math.max(0, currentScroll - 300), behavior: 'smooth' });
    },

    scrollDown() {
        const currentScroll = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: Math.min(maxScroll, currentScroll + 300), behavior: 'smooth' });
    },

    initNavArrows() {
        const up = document.querySelector('.nav-arrow-up');
        const down = document.querySelector('.nav-arrow-down');
        if (!up || !down) return;
        const update = () => {
            const scrollY = window.scrollY;
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            up.classList.toggle('hidden', scrollY <= 50);
            down.classList.toggle('hidden', scrollY >= maxScroll - 50);
        };
        window.addEventListener('scroll', update);
        window.addEventListener('resize', update);
        setTimeout(update, 100);
    },

    // ============================================================
    // ЗАЯВКИ
    // ============================================================

    async updateTicketsList(archived) {
        const container = document.getElementById(archived ? 'archived-container' : 'tickets-container');
        if (!container) return;
        try {
            const res = await fetch(`/api/tickets?archived=${archived}&admin=true`);
            let tickets = await res.json();
            const searchKey = archived ? 'ticketsArchived' : 'tickets';
            const searchQuery = this.searchState[searchKey] || '';
            const searchFields = ['employee_info', 'problem_desc', 'location', 'comment', 'urgency', 'executor_name'];
            let filtered = this.searchData(tickets, searchQuery, searchFields);
            const sortKey = archived ? 'ticketsArchived' : 'tickets';
            const sort = this.sortState[sortKey];
            const sorted = this.sortData(filtered, sort.field, sort.order);

            if (!sorted.length) {
                container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:40px;">${searchQuery ? 'По вашему запросу ничего не найдено' : (archived ? 'Нет выполненных заявок' : 'Нет активных заявок')}</p>`;
                return;
            }

            const isSuperAdmin = this.currentUser && (this.currentUser.role === 'super_admin' || this.currentUser.role === 'director');

            container.innerHTML = sorted.map(t => {
                const timeClass = t.color_class || this.getTicketTimeClass(t.created_at);
                const comments = t.comments || [];

                let commentsHtml = '';
                if (comments.length) {
                    commentsHtml = `
                        <div class="ticket-comments">
                            <details>
                                <summary>💬 Комментарии (${comments.length})</summary>
                                ${comments.map(c => {
                                    const isPrivate = c.is_public === false;
                                    let borderColor = '#4a9eff', bgColor = 'rgba(74,158,255,0.05)', icon = '🌐', badge = 'Публичный';
                                    if (c.admin_id) {
                                        if (isPrivate) { borderColor = '#ffaa33'; bgColor = 'rgba(255,170,51,0.1)'; icon = '🔒'; badge = 'Приватный'; }
                                    } else if (c.user_id) {
                                        borderColor = '#33dd88'; bgColor = 'rgba(51,221,136,0.05)'; icon = '👤'; badge = 'Пользователь';
                                    }
                                    return `
                                        <div style="border-left:4px solid ${borderColor};background:${bgColor};padding:10px 14px;border-radius:6px;margin:6px 0;">
                                            <div style="font-size:13px;">${icon} ${c.comment_text} <span style="font-size:9px;padding:1px 10px;border-radius:12px;background:${borderColor}22;color:${borderColor};border:1px solid ${borderColor}55;">${badge}</span></div>
                                            <div style="font-size:11px;color:var(--text-muted);">${this.formatCommentAuthor(c)} • ${new Date(c.created_at).toLocaleString('ru-RU')}</div>
                                        </div>
                                    `;
                                }).join('')}
                            </details>
                        </div>
                    `;
                }

                let deviceHtml = '';
                if (t.ip_address || t.user_agent) {
                    const formattedUA = this.formatUserAgent(t.user_agent);
                    const isLocalhost = t.ip_address === '::1' || t.ip_address === '127.0.0.1';
                    deviceHtml = `
                        <div class="ticket-device-info">
                            ${t.ip_address && !isLocalhost ? `<span class="device-ip">🌐 <span class="ip-address">${t.ip_address}</span></span>` : ''}
                            ${t.user_agent ? `<span class="device-ua" title="${t.user_agent}">📱 ${formattedUA}</span>` : ''}
                        </div>
                    `;
                }

                return `
                    <div class="ticket-card ${timeClass}">
                        <div class="ticket-header">
                            <strong>${t.employee_info}</strong> — <span class="location">${t.location}</span>
                            <span class="ticket-id">#${t.id}</span>
                        </div>
                        <div class="ticket-desc">${t.problem_desc}</div>
                        ${t.comment ? `<div class="ticket-comment">«${t.comment}»</div>` : ''}
                        ${commentsHtml}${deviceHtml}
                        <div class="meta">
                            ⏱️ Срочность: <b>${t.urgency}</b> | 📅 ${new Date(t.created_at).toLocaleString('ru-RU')}
                            ${t.completed_at ? ` | ✅ ${new Date(t.completed_at).toLocaleString('ru-RU')}` : ''}
                        </div>
                        ${archived
                            ? `<div class="done">✅ Выполнил: ${t.executor_name}</div>
                               <div class="ticket-actions">
                                   <button class="btn-restore" onclick="app.restoreTicket(${t.id})">↩️ Вернуть</button>
                                   ${isSuperAdmin ? `<button class="btn-delete" onclick="app.deleteTicket(${t.id})">🗑️ Удалить</button>` : ''}
                               </div>`
                            : `<div class="ticket-actions">
                                <button class="btn-complete" onclick="app.completeTicket(${t.id})">✅ Выполнить</button>
                                <button class="btn-comment" onclick="app.showCommentModal(${t.id})">💬 Комментарий</button>
                               </div>`
                        }
                    </div>
                `;
            }).join('');
        } catch (err) {
            container.innerHTML = `<p style="color:var(--danger);text-align:center;">Ошибка: ${err.message}</p>`;
        }
    },

    async loadTickets(archived) {
        const container = document.getElementById(archived ? 'archived-container' : 'tickets-container');
        if (!container) return;
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка...</p>';

        try {
            const res = await fetch(`/api/tickets?archived=${archived}&admin=true`);
            let tickets = await res.json();
            const searchKey = archived ? 'ticketsArchived' : 'tickets';
            const searchQuery = this.searchState[searchKey] || '';
            const searchFields = ['employee_info', 'problem_desc', 'location', 'comment', 'urgency', 'executor_name'];
            let filtered = this.searchData(tickets, searchQuery, searchFields);
            const sortKey = archived ? 'ticketsArchived' : 'tickets';
            const sort = this.sortState[sortKey];
            const sorted = this.sortData(filtered, sort.field, sort.order);
            const isSuperAdmin = this.currentUser && (this.currentUser.role === 'super_admin' || this.currentUser.role === 'director');

            let html = `
                <div class="controls-bar" id="controls-bar-tickets">
                    <div class="search-wrapper">
                        <input type="text" id="search-${searchKey}" placeholder="🔍 Поиск..." value="${searchQuery}" 
                               oninput="app.handleSearch('${searchKey}', this.value, 'tickets', ${archived})"
                               onkeydown="app.handleSearchEnter(event, '${searchKey}', 'tickets', ${archived})" autofocus>
                        ${searchQuery ? `<button class="clear-search" onclick="app.clearSearch('${searchKey}', 'tickets', ${archived})">✕</button>` : ''}
                    </div>
                    <div class="sort-wrapper">
                        <span>Сортировка:</span>
                        <select onchange="app.sortState['${sortKey}'] = {field: this.value.split('-')[0], order: this.value.split('-')[1]}; app.loadTickets(${archived})">
                            <option value="created_at-desc" ${sort.field === 'created_at' && sort.order === 'desc' ? 'selected' : ''}>По дате (новые)</option>
                            <option value="created_at-asc" ${sort.field === 'created_at' && sort.order === 'asc' ? 'selected' : ''}>По дате (старые)</option>
                            <option value="urgency-desc" ${sort.field === 'urgency' && sort.order === 'desc' ? 'selected' : ''}>По срочности (высокая)</option>
                            <option value="urgency-asc" ${sort.field === 'urgency' && sort.order === 'asc' ? 'selected' : ''}>По срочности (низкая)</option>
                            <option value="employee_info-asc" ${sort.field === 'employee_info' && sort.order === 'asc' ? 'selected' : ''}>По сотруднику (А-Я)</option>
                            <option value="employee_info-desc" ${sort.field === 'employee_info' && sort.order === 'desc' ? 'selected' : ''}>По сотруднику (Я-А)</option>
                        </select>
                    </div>
                    <div class="results-count">Найдено: ${sorted.length}</div>
                </div>
                <div id="tickets-list-container">
            `;

            if (!sorted.length) {
                html += `<p style="text-align:center;color:var(--text-muted);padding:40px;">${searchQuery ? 'Ничего не найдено' : (archived ? 'Нет выполненных' : 'Нет активных')}</p>`;
            } else {
                html += sorted.map(t => {
                    const timeClass = t.color_class || this.getTicketTimeClass(t.created_at);
                    const comments = t.comments || [];
                    let commentsHtml = '';
                    if (comments.length) {
                        commentsHtml = `
                            <div class="ticket-comments">
                                <details>
                                    <summary>💬 Комментарии (${comments.length})</summary>
                                    ${comments.map(c => {
                                        const isPrivate = c.is_public === false;
                                        let borderColor = '#4a9eff', bgColor = 'rgba(74,158,255,0.05)', icon = '🌐', badge = 'Публичный';
                                        if (c.admin_id) {
                                            if (isPrivate) { borderColor = '#ffaa33'; bgColor = 'rgba(255,170,51,0.1)'; icon = '🔒'; badge = 'Приватный'; }
                                        } else if (c.user_id) {
                                            borderColor = '#33dd88'; bgColor = 'rgba(51,221,136,0.05)'; icon = '👤'; badge = 'Пользователь';
                                        }
                                        return `
                                            <div style="border-left:4px solid ${borderColor};background:${bgColor};padding:10px 14px;border-radius:6px;margin:6px 0;">
                                                <div style="font-size:13px;">${icon} ${c.comment_text} <span style="font-size:9px;padding:1px 10px;border-radius:12px;background:${borderColor}22;color:${borderColor};border:1px solid ${borderColor}55;">${badge}</span></div>
                                                <div style="font-size:11px;color:var(--text-muted);">${this.formatCommentAuthor(c)} • ${new Date(c.created_at).toLocaleString('ru-RU')}</div>
                                            </div>
                                        `;
                                    }).join('')}
                                </details>
                            </div>
                        `;
                    }

                    let deviceHtml = '';
                    if (t.ip_address || t.user_agent) {
                        const formattedUA = this.formatUserAgent(t.user_agent);
                        const isLocalhost = t.ip_address === '::1' || t.ip_address === '127.0.0.1';
                        deviceHtml = `
                            <div class="ticket-device-info">
                                ${t.ip_address && !isLocalhost ? `<span class="device-ip">🌐 <span class="ip-address">${t.ip_address}</span></span>` : ''}
                                ${t.user_agent ? `<span class="device-ua" title="${t.user_agent}">📱 ${formattedUA}</span>` : ''}
                            </div>
                        `;
                    }

                    return `
                        <div class="ticket-card ${timeClass}">
                            <div class="ticket-header">
                                <strong>${t.employee_info}</strong> — <span class="location">${t.location}</span>
                                <span class="ticket-id">#${t.id}</span>
                            </div>
                            <div class="ticket-desc">${t.problem_desc}</div>
                            ${t.comment ? `<div class="ticket-comment">«${t.comment}»</div>` : ''}
                            ${commentsHtml}${deviceHtml}
                            <div class="meta">
                                ⏱️ Срочность: <b>${t.urgency}</b> | 📅 ${new Date(t.created_at).toLocaleString('ru-RU')}
                                ${t.completed_at ? ` | ✅ ${new Date(t.completed_at).toLocaleString('ru-RU')}` : ''}
                            </div>
                            ${archived
                                ? `<div class="done">✅ Выполнил: ${t.executor_name}</div>
                                   <div class="ticket-actions">
                                       <button class="btn-restore" onclick="app.restoreTicket(${t.id})">↩️ Вернуть</button>
                                       ${isSuperAdmin ? `<button class="btn-delete" onclick="app.deleteTicket(${t.id})">🗑️ Удалить</button>` : ''}
                                   </div>`
                                : `<div class="ticket-actions">
                                    <button class="btn-complete" onclick="app.completeTicket(${t.id})">✅ Выполнить</button>
                                    <button class="btn-comment" onclick="app.showCommentModal(${t.id})">💬 Комментарий</button>
                                   </div>`
                            }
                        </div>
                    `;
                }).join('');
            }
            html += `</div>`;
            container.innerHTML = html;

            const searchInput = document.getElementById(`search-${searchKey}`);
            if (searchInput) { searchInput.focus(); const len = searchInput.value.length; searchInput.setSelectionRange(len, len); }
        } catch (err) {
            container.innerHTML = `<p style="color:var(--danger);text-align:center;">Ошибка: ${err.message}</p>`;
        }
    },

    async restoreTicket(id) {
        if (!confirm('Вернуть заявку?')) return;
        try {
            const res = await fetch(`/api/tickets/${id}/restore`, { method: 'PUT' });
            if (!res.ok) { const error = await res.json(); throw new Error(error.error); }
            this.loadTickets(true);
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            if (activeTab && activeTab.dataset.tab === 'active') this.loadTickets(false);
            alert('✅ Возвращено');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    showCommentModal(ticketId) {
        if (!this.currentUser) { alert('Ошибка: не авторизован'); this.showScreen('screen-login'); return; }
        const modal = document.getElementById('comment-modal');
        if (!modal) return;
        document.getElementById('comment-ticket-id').value = ticketId;
        document.getElementById('comment-textarea').value = '';
        modal.style.display = 'flex';
        modal.classList.add('active');
    },

    closeCommentModal() {
        const modal = document.getElementById('comment-modal');
        if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); }
    },

    async submitComment() {
        const ticketId = document.getElementById('comment-ticket-id')?.value;
        const text = document.getElementById('comment-textarea')?.value.trim();
        const isPublic = document.getElementById('comment-visibility')?.value === 'true';
        if (!text) { alert('Введите текст'); return; }
        if (!this.currentUser) { alert('Не авторизован'); return; }

        try {
            const res = await fetch(`/api/tickets/${ticketId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment_text: text, admin_id: this.currentUser.id, is_public: isPublic })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            this.closeCommentModal();
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            if (activeTab) this.switchTab(activeTab.dataset.tab);
            alert('✅ Комментарий добавлен');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async completeTicket(id) {
        const executor = prompt('Кто выполнил?');
        if (!executor || !executor.trim()) return;
        try {
            const res = await fetch(`/api/tickets/${id}/complete`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ executor_name: executor.trim() })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            if (activeTab) this.switchTab(activeTab.dataset.tab);
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async deleteTicket(id) {
        if (!confirm('Удалить навсегда?')) return;
        try {
            const res = await fetch(`/api/tickets/${id}?admin_role=${this.currentUser?.role}`, { method: 'DELETE' });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            this.loadTickets(true);
            alert('✅ Удалено');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    // ============================================================
    // ОТПРАВКА ЗАЯВКИ (только для авторизованных пользователей)
    // ============================================================

    async submitTicket(e) {
    e.preventDefault();
    
    if (!this.currentUser || this.currentUserType !== 'user') {
        alert('❌ Для создания заявки необходимо войти как пользователь');
        this.showScreen('screen-login');
        return;
    }

    const form = e.target;
    const data = {
        problem: document.querySelector('[name="problem"]')?.value || '',
        location: document.querySelector('[name="location"]')?.value || '',
        employee: this.currentUser.full_name || 'Пользователь', // Берем из аккаунта
        comment: document.querySelector('[name="comment"]')?.value || '',
        urgency: document.querySelector('[name="urgency"]')?.value || 'Средняя',
        user_id: this.currentUser.id
    };

    const btn = form.querySelector('.btn-round');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }

    try {
        const res = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const response = await res.json();
        if (!res.ok) throw new Error(response.error || 'Ошибка');

        this.saveTicketToken(response.trackingToken);
        form.reset();
        alert(`✅ Заявка #${response.ticketId} создана!\n🔑 Токен: ${response.trackingToken}`);
        if (confirm('Перейти к моим заявкам?')) {
            this.showScreen('screen-track-tickets');
            this.loadTrackedTickets();
        }
    } catch (e) { alert('Ошибка: ' + e.message); } finally {
        if (btn) { btn.textContent = 'Отправить'; btn.disabled = false; }
    }
},

    // ============================================================
    // ТРЕКИНГ
    // ============================================================

    saveTicketToken(token) {
        try {
            let tokens = JSON.parse(localStorage.getItem('trackingTickets') || '[]');
            if (!tokens.includes(token)) { tokens.push(token); localStorage.setItem('trackingTickets', JSON.stringify(tokens)); }
            return tokens;
        } catch (e) { return []; }
    },

    getSavedTokens() {
        try { return JSON.parse(localStorage.getItem('trackingTickets') || '[]'); } catch (e) { return []; }
    },

    removeTicketToken(token) {
        try {
            let tokens = JSON.parse(localStorage.getItem('trackingTickets') || '[]');
            tokens = tokens.filter(t => t !== token);
            localStorage.setItem('trackingTickets', JSON.stringify(tokens));
            return tokens;
        } catch (e) { return []; }
    },

    logoutFromTracks() { this.showScreen('screen-login'); },

    async loadTrackedTickets() {
        const container = document.getElementById('screen-track-tickets-content');
        if (!container) return;
        const tokens = this.getSavedTokens();

        if (!tokens.length) {
            container.innerHTML = `<div class="track-empty"><p style="color:#718096;">📭 Нет заявок</p><button class="btn-create-ticket" onclick="app.showScreen('screen-ticket')">📝 Создать</button></div>`;
            return;
        }

        try {
            const res = await fetch('/api/tickets/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tokens })
            });
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            const tickets = await res.json();

            if (!tickets.length) {
                container.innerHTML = `<div class="track-empty"><p style="color:#718096;">📭 Заявки не найдены</p></div>`;
                return;
            }

            const statusLabels = { 'false': '⏳ Ожидает', 'true': '✅ Выполнена' };

            container.innerHTML = tickets.map(t => {
                const timeClass = t.color_class || this.getTicketTimeClass(t.created_at);
                const comments = t.comments || [];
                let commentsHtml = comments.length ? `
                    <div class="track-comments"><details>
                        <summary>💬 Комментарии (${comments.length})</summary>
                        ${comments.map(c => `
                            <div class="comment-item ${c.admin_id ? 'admin-comment' : 'user-comment'}">
                                <div class="comment-text">${c.comment_text}</div>
                                <div class="comment-meta">${this.formatCommentAuthor(c)} • ${new Date(c.created_at).toLocaleString('ru-RU')}</div>
                            </div>
                        `).join('')}
                    </details></div>
                ` : '';

                const commentForm = `
                    <div class="track-comment-form" style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <input type="text" id="track-comment-${t.id}" placeholder="Ваш комментарий..." style="flex:3;min-width:200px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                            <button onclick="app.addUserCommentToTrack(${t.id})" style="padding:8px 20px;background:#4a9eff;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">💬 Отправить</button>
                        </div>
                        <div style="font-size:11px;color:#718096;margin-top:4px;">👤 ${this.currentUser?.full_name || 'Пользователь'}</div>
                    </div>
                `;

                return `
                    <div class="track-card ${timeClass}">
                        <div class="track-card-header">
                            <span class="track-id">#${t.id}</span>
                            <span class="track-status ${t.status ? 'completed' : 'pending'}">${statusLabels[t.status]}</span>
                            <button class="track-remove" onclick="app.removeTrackedTicket('${t.tracking_token}')">✕</button>
                        </div>
                        <div class="track-problem">${t.problem_desc}</div>
                        <div class="track-meta">
                            <span>📍 ${t.location}</span>
                            <span>👤 ${t.employee_info}</span>
                            <span>⏱️ ${t.urgency}</span>
                            <span>📅 ${new Date(t.created_at).toLocaleString('ru-RU')}</span>
                            ${t.executor_name ? `<span>✅ ${t.executor_name}</span>` : ''}
                        </div>
                        ${commentsHtml}
                        ${!t.status ? commentForm : '<div style="color:#718096;font-size:13px;margin-top:12px;">✅ Заявка выполнена</div>'}
                        <div class="track-card-footer">
                            <span class="track-token">🔑 ${t.tracking_token}</span>
                            <button class="track-copy" onclick="app.copyToken('${t.tracking_token}')">📋 Копировать</button>
                            <button class="track-refresh" onclick="app.loadTrackedTickets()">🔄 Обновить</button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            container.innerHTML = `<div class="track-empty"><p style="color:#ff3355;">❌ ${e.message}</p><button onclick="app.loadTrackedTickets()">🔄 Попробовать</button></div>`;
        }
    },

    async addUserCommentToTrack(ticketId) {
        const text = document.getElementById(`track-comment-${ticketId}`)?.value.trim();
        if (!text) { alert('Введите текст'); return; }
        
        if (!this.currentUser) {
            alert('Ошибка: вы не авторизованы');
            this.showScreen('screen-login');
            return;
        }

        try {
            const res = await fetch(`/api/tickets/${ticketId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment_text: text, user_id: this.currentUser.id, is_public: true })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            document.getElementById(`track-comment-${ticketId}`).value = '';
            this.loadTrackedTickets();
            alert('✅ Комментарий добавлен');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    removeTrackedTicket(token) {
        if (!confirm('Убрать из отслеживания?')) return;
        this.removeTicketToken(token);
        this.loadTrackedTickets();
    },

    copyToken(token) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(token).then(() => alert('✅ Скопировано')).catch(() => this.fallbackCopy(token));
        } else { this.fallbackCopy(token); }
    },

    fallbackCopy(token) {
        const ta = document.createElement('textarea');
        ta.value = token;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); alert('✅ Скопировано'); } catch (e) { alert('❌ Токен: ' + token); }
        document.body.removeChild(ta);
    },

    async findTicketByToken() {
        const input = document.getElementById('find-ticket-input');
        const result = document.getElementById('find-result');
        const token = input.value.trim();
        if (!token) { result.innerHTML = '<p style="color:#ffaa33;">⚠️ Введите номер</p>'; return; }
        result.innerHTML = '<p style="color:#718096;">⏳ Поиск...</p>';

        try {
            const res = await fetch(`/api/ticket/track/${token}`);
            if (res.status === 404) {
                result.innerHTML = `<div class="find-not-found"><p style="color:#718096;">❌ Заявка ${token} не найдена</p></div>`;
                return;
            }
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            const ticket = await res.json();
            const statusLabels = { 'false': '⏳ Ожидает', 'true': '✅ Выполнена' };
            const comments = ticket.comments || [];

            result.innerHTML = `
                <div class="find-result-card">
                    <div class="find-result-header">
                        <span class="find-id">#${ticket.id}</span>
                        <span class="find-status ${ticket.status ? 'completed' : 'pending'}">${statusLabels[ticket.status]}</span>
                    </div>
                    <div class="find-problem">${ticket.problem_desc}</div>
                    <div class="find-meta">
                        <span>📍 ${ticket.location}</span>
                        <span>👤 ${ticket.employee_info}</span>
                        <span>⏱️ ${ticket.urgency}</span>
                        <span>📅 ${new Date(ticket.created_at).toLocaleString('ru-RU')}</span>
                        ${ticket.executor_name ? `<span>✅ ${ticket.executor_name}</span>` : ''}
                    </div>
                    ${comments.length ? `
                        <div class="find-comments"><details>
                            <summary>💬 Комментарии (${comments.length})</summary>
                            ${comments.map(c => `
                                <div class="comment-item ${c.admin_id ? 'admin-comment' : 'user-comment'}">
                                    <div class="comment-text">${c.comment_text}</div>
                                    <div class="comment-meta">${this.formatCommentAuthor(c)} • ${new Date(c.created_at).toLocaleString('ru-RU')}</div>
                                </div>
                            `).join('')}
                        </details></div>
                    ` : ''}
                    <div class="find-result-footer">
                        <span class="find-token">🔑 ${ticket.tracking_token}</span>
                        <button class="find-copy" onclick="app.copyToken('${ticket.tracking_token}')">📋 Копировать</button>
                        <button class="find-track" onclick="app.addTokenToTracking('${ticket.tracking_token}')">➕ Добавить</button>
                    </div>
                </div>
            `;
        } catch (e) {
            result.innerHTML = `<p style="color:#ff3355;">❌ ${e.message}</p>`;
        }
    },

    addTokenToTracking(token) {
        this.saveTicketToken(token);
        alert(`✅ Заявка ${token} добавлена`);
        if (confirm('Перейти к моим заявкам?')) {
            this.showScreen('screen-track-tickets');
            this.loadTrackedTickets();
        }
    },

    // ============================================================
    // ЗАДАЧИ
    // ============================================================

    async updateTasksList(archived) {
        const container = document.getElementById(archived ? 'tasks-archive-container' : 'tasks-container');
        if (!container) return;
        try {
            const url = archived ? '/api/tasks/archive' : '/api/tasks';
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            let tasks = await res.json();
            const searchKey = archived ? 'tasksArchived' : 'tasks';
            const searchQuery = this.searchState[searchKey] || '';
            const searchFields = ['title', 'description', 'assigned_to_name', 'created_by_name', 'completed_by_name', 'priority', 'status'];
            let filtered = this.searchData(tasks, searchQuery, searchFields);
            const sortKey = archived ? 'tasksArchived' : 'tasks';
            const sort = this.sortState[sortKey];
            const sorted = this.sortData(filtered, sort.field, sort.order);

            const statusLabels = { 'pending': '⏳ Ожидает', 'in_progress': '🔄 В работе', 'completed': '✅ Выполнено' };
            const priorityLabels = { 'low': '🟢 Низкий', 'medium': '🟡 Средний', 'high': '🔴 Высокий' };
            const priorityColors = { 'low': '#48bb78', 'medium': '#ecc94b', 'high': '#f56565' };
            const isSuperAdmin = this.currentUser && (this.currentUser.role === 'super_admin' || this.currentUser.role === 'director');
            const currentAdminId = this.currentUser?.id;

            if (!sorted.length) {
                container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:40px;">${searchQuery ? 'Ничего не найдено' : (archived ? 'Нет выполненных' : 'Нет активных')}</p>`;
                return;
            }

            container.innerHTML = `<div class="tasks-grid">${sorted.map(task => {
                const canComplete = task.status !== 'completed' && (task.assigned_to === currentAdminId || !task.assigned_to);
                return `
                    <div class="task-card" style="border-left:4px solid ${priorityColors[task.priority] || '#4a9eff'}">
                        <div class="task-header">
                            <h3 class="task-title">${task.title}</h3>
                            <span class="task-status ${task.status}">${statusLabels[task.status]}</span>
                        </div>
                        ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                        <div class="task-meta">
                            <div>👤 ${task.assigned_to_name || 'Не назначена'}</div>
                            <div>📅 ${new Date(task.created_at).toLocaleDateString('ru-RU')}</div>
                            ${task.due_date ? `<div>⏰ ${new Date(task.due_date).toLocaleDateString('ru-RU')}</div>` : ''}
                            ${task.completed_by_name ? `<div>✅ ${task.completed_by_name}</div>` : ''}
                            <div>🏷️ ${priorityLabels[task.priority]}</div>
                        </div>
                        <div class="task-actions">
                            ${!archived ? `
                                ${task.status !== 'completed' && canComplete ? `
                                    ${task.status === 'pending' ? `<button class="btn-complete" onclick="app.updateTaskStatus(${task.id}, 'in_progress', ${currentAdminId})">🔄 Взять</button>` : ''}
                                    ${task.status === 'in_progress' ? `<button class="btn-complete" onclick="app.updateTaskStatus(${task.id}, 'completed', ${currentAdminId})">✅ Завершить</button>` : ''}
                                ` : ''}
                                ${task.status === 'completed' && isSuperAdmin ? `<button class="btn-reopen" onclick="app.updateTaskStatus(${task.id}, 'pending', ${currentAdminId})">🔄 Открыть</button>` : ''}
                                ${isSuperAdmin ? `
                                    <button class="btn-edit-task" onclick="app.showEditTaskModal(${task.id})">✏️</button>
                                    <button class="btn-delete" onclick="app.deleteTask(${task.id})">🗑️</button>
                                ` : ''}
                            ` : `
                                <span style="color:#33dd88;font-weight:600;">✅ Выполнено</span>
                                ${isSuperAdmin ? `
                                    <button class="btn-reopen" onclick="app.updateTaskStatus(${task.id}, 'pending', ${currentAdminId})">🔄 Открыть</button>
                                    <button class="btn-delete" onclick="app.deleteTask(${task.id})">🗑️</button>
                                ` : ''}
                            `}
                        </div>
                    </div>
                `;
            }).join('')}</div>`;
        } catch (e) { container.innerHTML = `<p style="color:var(--danger);">Ошибка: ${e.message}</p>`; }
    },

    async loadTasks(archived = false) {
        const container = document.getElementById(archived ? 'tasks-archive-container' : 'tasks-container');
        if (!container) return;
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка...</p>';

        try {
            const url = archived ? '/api/tasks/archive' : '/api/tasks';
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            let tasks = await res.json();
            const searchKey = archived ? 'tasksArchived' : 'tasks';
            const searchQuery = this.searchState[searchKey] || '';
            const searchFields = ['title', 'description', 'assigned_to_name', 'created_by_name', 'completed_by_name', 'priority', 'status'];
            let filtered = this.searchData(tasks, searchQuery, searchFields);
            const sortKey = archived ? 'tasksArchived' : 'tasks';
            const sort = this.sortState[sortKey];
            const sorted = this.sortData(filtered, sort.field, sort.order);

            const statusLabels = { 'pending': '⏳ Ожидает', 'in_progress': '🔄 В работе', 'completed': '✅ Выполнено' };
            const priorityLabels = { 'low': '🟢 Низкий', 'medium': '🟡 Средний', 'high': '🔴 Высокий' };
            const priorityColors = { 'low': '#48bb78', 'medium': '#ecc94b', 'high': '#f56565' };
            const isSuperAdmin = this.currentUser && (this.currentUser.role === 'super_admin' || this.currentUser.role === 'director');
            const currentAdminId = this.currentUser?.id;

            let html = `
                <div class="controls-bar" id="controls-bar-tasks">
                    <div class="search-wrapper">
                        <input type="text" id="search-${searchKey}" placeholder="🔍 Поиск..." value="${searchQuery}" 
                               oninput="app.handleSearch('${searchKey}', this.value, 'tasks', ${archived})"
                               onkeydown="app.handleSearchEnter(event, '${searchKey}', 'tasks', ${archived})" autofocus>
                        ${searchQuery ? `<button class="clear-search" onclick="app.clearSearch('${searchKey}', 'tasks', ${archived})">✕</button>` : ''}
                    </div>
                    <div class="sort-wrapper">
                        <span>Сортировка:</span>
                        <select onchange="app.sortState['${sortKey}'] = {field: this.value.split('-')[0], order: this.value.split('-')[1]}; app.loadTasks(${archived})">
                            <option value="created_at-desc" ${sort.field === 'created_at' && sort.order === 'desc' ? 'selected' : ''}>По дате (новые)</option>
                            <option value="created_at-asc" ${sort.field === 'created_at' && sort.order === 'asc' ? 'selected' : ''}>По дате (старые)</option>
                            <option value="due_date-asc" ${sort.field === 'due_date' && sort.order === 'asc' ? 'selected' : ''}>По сроку</option>
                            <option value="priority-desc" ${sort.field === 'priority' && sort.order === 'desc' ? 'selected' : ''}>По приоритету</option>
                        </select>
                    </div>
                    <div class="results-count">Найдено: ${sorted.length}</div>
                    ${!archived && isSuperAdmin ? `<button class="btn-add-inventory" onclick="app.showCreateTaskModal()" style="margin:0;">➕ Создать</button>` : ''}
                </div>
                <div id="tasks-list-container">
            `;

            if (!sorted.length) {
                html += `<p style="text-align:center;color:var(--text-muted);padding:40px;">${searchQuery ? 'Ничего не найдено' : (archived ? 'Нет выполненных' : 'Нет активных')}</p>`;
            } else {
                html += `<div class="tasks-grid">${sorted.map(task => {
                    const canComplete = task.status !== 'completed' && (task.assigned_to === currentAdminId || !task.assigned_to);
                    return `
                        <div class="task-card" style="border-left:4px solid ${priorityColors[task.priority] || '#4a9eff'}">
                            <div class="task-header">
                                <h3 class="task-title">${task.title}</h3>
                                <span class="task-status ${task.status}">${statusLabels[task.status]}</span>
                            </div>
                            ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                            <div class="task-meta">
                                <div>👤 ${task.assigned_to_name || 'Не назначена'}</div>
                                <div>📅 ${new Date(task.created_at).toLocaleDateString('ru-RU')}</div>
                                ${task.due_date ? `<div>⏰ ${new Date(task.due_date).toLocaleDateString('ru-RU')}</div>` : ''}
                                ${task.completed_by_name ? `<div>✅ ${task.completed_by_name}</div>` : ''}
                                <div>🏷️ ${priorityLabels[task.priority]}</div>
                            </div>
                            <div class="task-actions">
                                ${!archived ? `
                                    ${task.status !== 'completed' && canComplete ? `
                                        ${task.status === 'pending' ? `<button class="btn-complete" onclick="app.updateTaskStatus(${task.id}, 'in_progress', ${currentAdminId})">🔄 Взять</button>` : ''}
                                        ${task.status === 'in_progress' ? `<button class="btn-complete" onclick="app.updateTaskStatus(${task.id}, 'completed', ${currentAdminId})">✅ Завершить</button>` : ''}
                                    ` : ''}
                                    ${task.status === 'completed' && isSuperAdmin ? `<button class="btn-reopen" onclick="app.updateTaskStatus(${task.id}, 'pending', ${currentAdminId})">🔄 Открыть</button>` : ''}
                                    ${isSuperAdmin ? `
                                        <button class="btn-edit-task" onclick="app.showEditTaskModal(${task.id})">✏️</button>
                                        <button class="btn-delete" onclick="app.deleteTask(${task.id})">🗑️</button>
                                    ` : ''}
                                ` : `
                                    <span style="color:#33dd88;font-weight:600;">✅ Выполнено</span>
                                    ${isSuperAdmin ? `
                                        <button class="btn-reopen" onclick="app.updateTaskStatus(${task.id}, 'pending', ${currentAdminId})">🔄 Открыть</button>
                                        <button class="btn-delete" onclick="app.deleteTask(${task.id})">🗑️</button>
                                    ` : ''}
                                `}
                            </div>
                        </div>
                    `;
                }).join('')}</div>`;
            }
            html += `</div>`;
            container.innerHTML = html;

            const searchInput = document.getElementById(`search-${searchKey}`);
            if (searchInput) { searchInput.focus(); const len = searchInput.value.length; searchInput.setSelectionRange(len, len); }
        } catch (e) {
            container.innerHTML = `<p style="color:var(--danger);">Ошибка: ${e.message}</p>`;
        }
    },

    async loadAdmins() {
        try { const res = await fetch('/api/admins'); return await res.json(); } catch (e) { return []; }
    },

    // ============================================================
    // ЗАДАЧИ - МОДАЛКИ
    // ============================================================

    async showCreateTaskModal() {
        if (!this.currentUser || !['super_admin', 'director'].includes(this.currentUser.role)) {
            alert('Только главный администратор или директор');
            return;
        }
        const admins = await this.loadAdmins();
        const modal = document.getElementById('task-modal');
        const form = document.getElementById('task-form');
        const title = document.getElementById('modal-title');
        if (!modal || !form || !title) return;

        title.textContent = '📋 Создать задачу';
        const selectHtml = admins.map(a => `<option value="${a.id}">${a.full_name}</option>`).join('');

        form.innerHTML = `
            <div class="form-group"><label>Название *</label><input type="text" id="task-title" required></div>
            <div class="form-group"><label>Описание</label><textarea id="task-description" rows="3"></textarea></div>
            <div class="form-group"><label>Назначить</label><select id="task-assigned-to"><option value="">Не назначено</option>${selectHtml}</select></div>
            <div class="form-group"><label>Приоритет</label><select id="task-priority"><option value="low">🟢 Низкий</option><option value="medium" selected>🟡 Средний</option><option value="high">🔴 Высокий</option></select></div>
            <div class="form-group"><label>Срок</label><input type="date" id="task-due-date"></div>
            <div class="modal-buttons"><button class="btn-save" onclick="app.createTask()">💾 Создать</button><button class="btn-cancel" onclick="app.closeTaskModal()">❌ Отмена</button></div>
        `;
        modal.style.display = 'flex';
        modal.classList.add('active');
    },

    async showEditTaskModal(taskId) {
        if (!this.currentUser || !['super_admin', 'director'].includes(this.currentUser.role)) {
            alert('Только главный администратор или директор');
            return;
        }
        try {
            const res = await fetch('/api/tasks');
            const tasks = await res.json();
            const task = tasks.find(t => t.id === taskId);
            if (!task) { alert('Задача не найдена'); return; }
            const admins = await this.loadAdmins();
            const modal = document.getElementById('task-modal');
            const form = document.getElementById('task-form');
            if (!modal || !form) return;
            document.getElementById('modal-title').textContent = '✏️ Редактировать';

            const selectHtml = admins.map(a => `<option value="${a.id}" ${task.assigned_to === a.id ? 'selected' : ''}>${a.full_name}</option>`).join('');
            form.innerHTML = `
                <input type="hidden" id="task-edit-id" value="${task.id}">
                <div class="form-group"><label>Название *</label><input type="text" id="task-edit-title" value="${task.title}" required></div>
                <div class="form-group"><label>Описание</label><textarea id="task-edit-description" rows="3">${task.description || ''}</textarea></div>
                <div class="form-group"><label>Назначить</label><select id="task-edit-assigned-to"><option value="">Не назначено</option>${selectHtml}</select></div>
                <div class="form-group"><label>Приоритет</label><select id="task-edit-priority"><option value="low" ${task.priority === 'low' ? 'selected' : ''}>🟢 Низкий</option><option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>🟡 Средний</option><option value="high" ${task.priority === 'high' ? 'selected' : ''}>🔴 Высокий</option></select></div>
                <div class="form-group"><label>Срок</label><input type="date" id="task-edit-due-date" value="${task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : ''}"></div>
                <div class="modal-buttons"><button class="btn-save" onclick="app.editTask()">💾 Сохранить</button><button class="btn-cancel" onclick="app.closeTaskModal()">❌ Отмена</button></div>
            `;
            modal.style.display = 'flex';
            modal.classList.add('active');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    closeTaskModal() {
        const modal = document.getElementById('task-modal');
        if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); }
    },

    async createTask() {
        const title = document.getElementById('task-title')?.value.trim();
        if (!title) { alert('Введите название'); return; }
        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description: document.getElementById('task-description')?.value.trim() || null,
                    assigned_to: document.getElementById('task-assigned-to')?.value || null,
                    priority: document.getElementById('task-priority')?.value,
                    due_date: document.getElementById('task-due-date')?.value || null,
                    created_by: this.currentUser.id
                })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            this.closeTaskModal();
            this.loadTasks(false);
            alert('✅ Создано');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async editTask() {
        const taskId = document.getElementById('task-edit-id')?.value;
        const title = document.getElementById('task-edit-title')?.value.trim();
        if (!title) { alert('Введите название'); return; }
        try {
            const res = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description: document.getElementById('task-edit-description')?.value.trim() || null,
                    assigned_to: document.getElementById('task-edit-assigned-to')?.value || null,
                    priority: document.getElementById('task-edit-priority')?.value,
                    due_date: document.getElementById('task-edit-due-date')?.value || null,
                    admin_id: this.currentUser.id
                })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            this.closeTaskModal();
            this.loadTasks(false);
            alert('✅ Сохранено');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async updateTaskStatus(taskId, status, adminId) {
        try {
            const res = await fetch(`/api/tasks/${taskId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, admin_id: adminId })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            this.loadTasks(activeTab?.dataset.tab === 'tasks-archive');
            alert('✅ Статус обновлен');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async deleteTask(taskId) {
        if (!confirm('Удалить?')) return;
        try {
            const res = await fetch(`/api/tasks/${taskId}?admin_role=${this.currentUser?.role}`, { method: 'DELETE' });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            this.loadTasks(activeTab?.dataset.tab === 'tasks-archive');
            alert('✅ Удалено');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    // ============================================================
    // IP СТАТИСТИКА
    // ============================================================

    async loadIPStats() {
        const container = document.getElementById('ip-container');
        if (!container) return;
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка...</p>';
        try {
            const res = await fetch('/api/ip-stats');
            const stats = await res.json();
            if (!stats.length) { container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">Нет данных</p>'; return; }
            container.innerHTML = `
                <h3 style="margin-bottom:20px;color:var(--text-primary);">📊 Статистика по IP</h3>
                <table class="inv-table">
                    <tr><th>IP</th><th>Заявок</th><th>Устройства</th><th>Первый визит</th><th>Последний</th></tr>
                    ${stats.map(s => `
                        <tr>
                            <td><span class="ip-address">${s.ip_address}</span></td>
                            <td><strong>${s.total_requests}</strong></td>
                            <td class="device-cell">${s.user_agents ? [...new Set(s.user_agents)].map(ua => `<div class="device-tag">${this.formatUserAgent(ua)}</div>`).join('') : '—'}</td>
                            <td>${new Date(s.first_request).toLocaleString('ru-RU')}</td>
                            <td>${new Date(s.last_request).toLocaleString('ru-RU')}</td>
                        </tr>
                    `).join('')}
                </table>
            `;
        } catch (e) { container.innerHTML = `<p style="color:var(--danger);">Ошибка: ${e.message}</p>`; }
    },

    // ============================================================
    // ОТЧЕТЫ
    // ============================================================

    createNewReport() {
        const modal = document.getElementById('report-type-modal');
        if (modal) { modal.style.display = 'flex'; modal.classList.add('active'); }
    },

    closeReportTypeModal() {
        const modal = document.getElementById('report-type-modal');
        if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); }
    },

    async generateReport(type) {
        this.closeReportTypeModal();
        const typeName = type === 'tickets' ? 'заявок' : type === 'tasks' ? 'задач' : 'статистика';
        const title = prompt(`Введите название отчета (${typeName}):`);
        if (!title) return;
        const description = prompt('Описание (необязательно):');

        try {
            let reportData = {};
            if (type === 'tickets') {
                const res = await fetch('/api/tickets?archived=true');
                const tickets = await res.json();
                reportData = { type: 'tickets', tickets: tickets.map(t => ({
                    id: t.id,
                    title: t.employee_info + ' - ' + t.location,
                    problem_desc: t.problem_desc,
                    created_at: t.created_at,
                    completed_at: t.completed_at,
                    executor_name: t.executor_name || '—'
                })) };
            } else if (type === 'tasks') {
                const res = await fetch('/api/tasks/archive');
                const tasks = await res.json();
                const priorityLabels = { 'low': 'Низкий', 'medium': 'Средний', 'high': 'Высокий' };
                reportData = { type: 'tasks', tasks: tasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    description: t.description || '—',
                    assigned_to: t.assigned_to_name || '—',
                    completed_by: t.completed_by_name || '—',
                    priority: priorityLabels[t.priority] || t.priority,
                    created_at: t.created_at,
                    completed_at: t.completed_at
                })) };
            } else if (type === 'stats') {
                const [activeRes, archivedRes] = await Promise.all([
                    fetch('/api/tickets?archived=false'),
                    fetch('/api/tickets?archived=true')
                ]);
                const active = await activeRes.json();
                const archived = await archivedRes.json();
                const map = {};
                active.forEach(t => { const d = new Date(t.created_at).toLocaleDateString('ru-RU'); if (!map[d]) map[d] = { total: 0, completed: 0, time: 0, count: 0 }; map[d].total++; });
                archived.forEach(t => {
                    const d = new Date(t.created_at).toLocaleDateString('ru-RU');
                    if (!map[d]) map[d] = { total: 0, completed: 0, time: 0, count: 0 };
                    map[d].completed++;
                    if (t.created_at && t.completed_at) {
                        const diff = (new Date(t.completed_at) - new Date(t.created_at)) / (1000 * 60 * 60);
                        if (diff > 0) { map[d].time += diff; map[d].count++; }
                    }
                });
                const stats = Object.keys(map).sort((a, b) => a.split('.').reverse().join('-').localeCompare(b.split('.').reverse().join('-'))).map(d => {
                    const data = map[d];
                    const avg = data.count > 0 ? (data.time / data.count).toFixed(1) : '—';
                    return { date: d, total: data.total, completed: data.completed, pending: data.total - data.completed, avgSpeed: avg, completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0 };
                });
                const totalAll = stats.reduce((s, d) => s + d.total, 0);
                const completedAll = stats.reduce((s, d) => s + d.completed, 0);
                const avgSpeedAll = stats.filter(d => d.avgSpeed !== '—').reduce((s, d) => s + parseFloat(d.avgSpeed), 0);
                const countWithSpeed = stats.filter(d => d.avgSpeed !== '—').length;
                reportData = { type: 'stats', stats, summary: {
                    total: totalAll,
                    completed: completedAll,
                    pending: totalAll - completedAll,
                    avgSpeed: countWithSpeed > 0 ? (avgSpeedAll / countWithSpeed).toFixed(1) : '—',
                    completionRate: totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0,
                    days: stats.length
                } };
            }

            const createRes = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description: description || '', report_data: reportData, created_by: this.currentUser.id })
            });
            if (!createRes.ok) { const e = await createRes.json(); throw new Error(e.error); }
            this.loadReports();
            alert(`✅ Отчет "${title}" создан`);
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async loadReports() {
        const container = document.getElementById('reports-grid');
        if (!container) return;
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка...</p>';
        try {
            const res = await fetch('/api/reports');
            const reports = await res.json();
            const isEditable = this.currentUser && ['director', 'super_admin'].includes(this.currentUser.role);

            if (!reports.length) {
                container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;grid-column:1/-1;"><p style="font-size:16px;">📭 Нет отчетов</p><button class="btn-add-inventory" onclick="app.createNewReport()">➕ Создать</button></div>`;
                return;
            }

            container.innerHTML = reports.map(report => {
                const data = report.report_data || {};
                const count = (data.tickets || []).length || (data.tasks || []).length || (data.stats || []).length;
                const typeLabel = data.type === 'tasks' ? '✅ Задачи' : data.type === 'stats' ? '📊 Статистика' : '📋 Заявки';
                return `
                    <div class="report-card">
                        <div class="report-header">
                            <h3>${report.title}</h3>
                            <span style="font-size:11px;color:var(--text-muted);background:var(--bg-hover);padding:2px 10px;border-radius:12px;">${typeLabel}</span>
                        </div>
                        ${report.description ? `<p class="report-desc">${report.description}</p>` : ''}
                        <div class="report-meta">
                            <span>👤 ${report.created_by_name || 'Неизвестно'}</span>
                            <span>📅 ${new Date(report.created_at).toLocaleDateString('ru-RU')}</span>
                            <span>📋 ${count} записей</span>
                        </div>
                        <div class="report-actions">
                            <button class="btn-complete" onclick="app.viewReport(${report.id})">👁️ Просмотр</button>
                            ${isEditable ? `
                                <button class="btn-edit-task" onclick="app.editReport(${report.id})">✏️</button>
                                <button class="btn-delete" onclick="app.deleteReport(${report.id})">🗑️</button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) { container.innerHTML = `<p style="color:var(--danger);">Ошибка: ${e.message}</p>`; }
    },

    async viewReport(reportId) {
        try {
            const res = await fetch('/api/reports');
            const reports = await res.json();
            const report = reports.find(r => r.id === reportId);
            if (!report) { alert('Отчет не найден'); return; }

            const data = report.report_data || {};
            const reportType = data.type || 'tickets';
            const screen = document.getElementById('screen-report-view');
            const content = document.getElementById('report-view-content');
            const title = document.getElementById('report-view-title');
            if (!screen || !content || !title) { alert('Ошибка: не найдены элементы'); return; }

            title.textContent = `📊 ${report.title}`;
            document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
            screen.style.display = 'flex';
            screen.classList.add('active');

            const tickets = data.tickets || [];
            const tasks = data.tasks || [];
            const stats = data.stats || [];
            const summary = data.summary || {};

            let tableHtml = '';
            if (reportType === 'tickets' && tickets.length) {
                tableHtml = `
                    <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:24px;overflow-x:auto;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
                            <div style="display:flex;gap:16px;flex-wrap:wrap;"><span style="font-size:13px;color:#718096;">📋 Архив заявок</span><span style="font-size:13px;color:#718096;">📅 ${new Date(report.created_at).toLocaleString('ru-RU')}</span></div>
                            <span style="font-size:13px;font-weight:600;color:#4a9eff;">Всего: ${tickets.length}</span>
                        </div>
                        ${report.description ? `<p style="padding:10px 14px;background:#f7fafc;border-radius:6px;border-left:3px solid #4a9eff;margin-bottom:12px;">${report.description}</p>` : ''}
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead><tr style="background:#f7fafc;border-bottom:2px solid #e2e8f0;">
                                <th style="padding:8px 12px;">№</th>
                                <th style="padding:8px 12px;">Название</th>
                                <th style="padding:8px 12px;">Проблема</th>
                                <th style="padding:8px 12px;">Создана</th>
                                <th style="padding:8px 12px;">Выполнена</th>
                                <th style="padding:8px 12px;">Время</th>
                                <th style="padding:8px 12px;">Исполнитель</th>
                            </tr></thead>
                            <tbody>${tickets.map((t, i) => {
                                let time = '—';
                                if (t.created_at && t.completed_at) {
                                    const diff = (new Date(t.completed_at) - new Date(t.created_at)) / (1000 * 60 * 60);
                                    if (diff > 0) { const h = Math.floor(diff); const m = Math.round((diff - h) * 60); time = `${h}ч ${m}м`; }
                                }
                                return `<tr style="border-bottom:1px solid #e2e8f0;">
                                    <td style="padding:8px 12px;text-align:center;">${i+1}</td>
                                    <td style="padding:8px 12px;font-weight:500;">${t.title || '—'}</td>
                                    <td style="padding:8px 12px;">${t.problem_desc || '—'}</td>
                                    <td style="padding:8px 12px;font-size:12px;white-space:nowrap;">${t.created_at ? new Date(t.created_at).toLocaleString('ru-RU') : '—'}</td>
                                    <td style="padding:8px 12px;font-size:12px;white-space:nowrap;">${t.completed_at ? new Date(t.completed_at).toLocaleString('ru-RU') : '—'}</td>
                                    <td style="padding:8px 12px;font-weight:600;text-align:center;">${time}</td>
                                    <td style="padding:8px 12px;">${t.executor_name || '—'}</td>
                                </tr>`;
                            }).join('')}</tbody>
                        </table>
                    </div>
                `;
            } else if (reportType === 'tasks' && tasks.length) {
                tableHtml = `
                    <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:24px;overflow-x:auto;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
                            <div style="display:flex;gap:16px;flex-wrap:wrap;"><span style="font-size:13px;color:#718096;">✅ Архив задач</span><span style="font-size:13px;color:#718096;">📅 ${new Date(report.created_at).toLocaleString('ru-RU')}</span></div>
                            <span style="font-size:13px;font-weight:600;color:#4a9eff;">Всего: ${tasks.length}</span>
                        </div>
                        ${report.description ? `<p style="padding:10px 14px;background:#f7fafc;border-radius:6px;border-left:3px solid #4a9eff;margin-bottom:12px;">${report.description}</p>` : ''}
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead><tr style="background:#f7fafc;border-bottom:2px solid #e2e8f0;">
                                <th style="padding:8px 12px;">№</th>
                                <th style="padding:8px 12px;">Название</th>
                                <th style="padding:8px 12px;">Описание</th>
                                <th style="padding:8px 12px;">Приоритет</th>
                                <th style="padding:8px 12px;">Назначена</th>
                                <th style="padding:8px 12px;">Создана</th>
                                <th style="padding:8px 12px;">Выполнена</th>
                                <th style="padding:8px 12px;">Исполнитель</th>
                            </tr></thead>
                            <tbody>${tasks.map((t, i) => `
                                <tr style="border-bottom:1px solid #e2e8f0;">
                                    <td style="padding:8px 12px;text-align:center;">${i+1}</td>
                                    <td style="padding:8px 12px;font-weight:500;">${t.title || '—'}</td>
                                    <td style="padding:8px 12px;">${t.description || '—'}</td>
                                    <td style="padding:8px 12px;font-weight:600;">${t.priority || '—'}</td>
                                    <td style="padding:8px 12px;">${t.assigned_to || '—'}</td>
                                    <td style="padding:8px 12px;font-size:12px;white-space:nowrap;">${t.created_at ? new Date(t.created_at).toLocaleString('ru-RU') : '—'}</td>
                                    <td style="padding:8px 12px;font-size:12px;white-space:nowrap;">${t.completed_at ? new Date(t.completed_at).toLocaleString('ru-RU') : '—'}</td>
                                    <td style="padding:8px 12px;">${t.completed_by || '—'}</td>
                                </tr>
                            `).join('')}</tbody>
                        </table>
                    </div>
                `;
            } else if (reportType === 'stats' && stats.length) {
                tableHtml = `
                    <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:24px;overflow-x:auto;">
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px;">
                            <div style="background:#f0f4f8;border-radius:8px;padding:16px;text-align:center;border:1px solid #e2e8f0;">
                                <div style="font-size:24px;font-weight:700;color:#4a9eff;">${summary.days || 0}</div>
                                <div style="font-size:12px;color:#718096;">Дней</div>
                            </div>
                            <div style="background:#f0f4f8;border-radius:8px;padding:16px;text-align:center;border:1px solid #e2e8f0;">
                                <div style="font-size:24px;font-weight:700;color:#4a9eff;">${summary.total || 0}</div>
                                <div style="font-size:12px;color:#718096;">Всего</div>
                            </div>
                            <div style="background:#f0f4f8;border-radius:8px;padding:16px;text-align:center;border:1px solid #e2e8f0;">
                                <div style="font-size:24px;font-weight:700;color:#33dd88;">${summary.completed || 0}</div>
                                <div style="font-size:12px;color:#718096;">Выполнено</div>
                            </div>
                            <div style="background:#f0f4f8;border-radius:8px;padding:16px;text-align:center;border:1px solid #e2e8f0;">
                                <div style="font-size:24px;font-weight:700;color:#ffaa33;">${summary.pending || 0}</div>
                                <div style="font-size:12px;color:#718096;">В работе</div>
                            </div>
                            <div style="background:#f0f4f8;border-radius:8px;padding:16px;text-align:center;border:1px solid #e2e8f0;">
                                <div style="font-size:24px;font-weight:700;color:#ff3355;">${summary.completionRate || 0}%</div>
                                <div style="font-size:12px;color:#718096;">% выполнения</div>
                            </div>
                            <div style="background:#f0f4f8;border-radius:8px;padding:16px;text-align:center;border:1px solid #e2e8f0;">
                                <div style="font-size:24px;font-weight:700;color:#9b59b6;">${summary.avgSpeed || '—'} ч</div>
                                <div style="font-size:12px;color:#718096;">Среднее время</div>
                            </div>
                        </div>
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead><tr style="background:#f7fafc;border-bottom:2px solid #e2e8f0;">
                                <th style="padding:10px 14px;">Дата</th>
                                <th style="padding:10px 14px;text-align:center;">Всего</th>
                                <th style="padding:10px 14px;text-align:center;">Выполнено</th>
                                <th style="padding:10px 14px;text-align:center;">В работе</th>
                                <th style="padding:10px 14px;text-align:center;">%</th>
                                <th style="padding:10px 14px;text-align:center;">Среднее время</th>
                            </tr></thead>
                            <tbody>${stats.map(s => `
                                <tr style="border-bottom:1px solid #e2e8f0;">
                                    <td style="padding:10px 14px;font-weight:500;">${s.date}</td>
                                    <td style="padding:10px 14px;text-align:center;">${s.total}</td>
                                    <td style="padding:10px 14px;text-align:center;color:#33dd88;font-weight:600;">${s.completed}</td>
                                    <td style="padding:10px 14px;text-align:center;color:#ffaa33;font-weight:600;">${s.pending}</td>
                                    <td style="padding:10px 14px;text-align:center;font-weight:700;color:${s.completionRate >= 80 ? '#33dd88' : s.completionRate >= 50 ? '#ffaa33' : '#ff3355'};">${s.completionRate}%</td>
                                    <td style="padding:10px 14px;text-align:center;">${s.avgSpeed !== '—' ? s.avgSpeed + ' ч' : '—'}</td>
                                </tr>
                            `).join('')}</tbody>
                        </table>
                    </div>
                `;
            } else {
                tableHtml = `<div style="text-align:center;padding:60px 20px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;"><p style="font-size:18px;color:#718096;">📭 Нет данных</p></div>`;
            }

            content.innerHTML = tableHtml;
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    printReportOnly() {
        const screen = document.getElementById('screen-report-view');
        if (!screen) return;
        screen.classList.add('printing');
        setTimeout(() => { window.print(); }, 100);
        setTimeout(() => { screen.classList.remove('printing'); }, 1500);
    },

    closeReportView() {
        const screen = document.getElementById('screen-report-view');
        if (screen) { screen.style.display = 'none'; screen.classList.remove('active'); }
        const adminScreen = document.getElementById('screen-admin');
        if (adminScreen) { adminScreen.style.display = 'flex'; adminScreen.classList.add('active'); }
        this.loadReports();
    },

    // ============================================================
    // УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ (ТОЛЬКО ДИРЕКТОР)
    // ============================================================

    async loadUsers() {
        const container = document.getElementById('users-grid');
        if (!container) return;
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка...</p>';
        
        if (!this.currentUser || this.currentUser.role !== 'director') {
            container.innerHTML = '<p style="text-align:center;color:var(--danger);">Доступ только для директора</p>';
            return;
        }

        try {
            const res = await fetch('/api/users/all');
            const users = await res.json();
            if (!users.length) {
                container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;"><p>👥 Нет пользователей</p></div>`;
                return;
            }
            container.innerHTML = `
                <table class="inv-table">
                    <thead><tr><th>Логин</th><th>ФИО</th><th>Отдел</th><th>Должность</th><th>Создан</th><th>Кем</th><th style="width:150px;">Действия</th></tr></thead>
                    <tbody>${users.map(u => `
                        <tr>
                            <td>${u.login_id}</td>
                            <td>${u.full_name}</td>
                            <td>${u.department || '—'}</td>
                            <td>${u.position || '—'}</td>
                            <td>${new Date(u.created_at).toLocaleDateString('ru-RU')}</td>
                            <td>${u.created_by_name || '—'}</td>
                            <td>
                                <button class="btn-edit" onclick="app.openEditUserModal(${u.id})">✏️</button>
                                <button class="btn-delete-inv" onclick="app.deleteUser(${u.id})">🗑️</button>
                            </td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            `;
        } catch (e) { container.innerHTML = `<p style="color:var(--danger);">Ошибка: ${e.message}</p>`; }
    },

    showCreateUserModal() {
        if (!this.currentUser || this.currentUser.role !== 'director') {
            alert('Только директор может создавать пользователей');
            return;
        }
        const modalHtml = `
            <div id="create-user-modal" class="modal active" style="display:flex;">
                <div class="modal-content" style="max-width:420px;">
                    <span class="close-modal" onclick="app.closeCreateUserModal()">&times;</span>
                    <h2>👤 Создать пользователя</h2>
                    <div class="form-group"><label>Логин *</label><input type="text" id="new-user-login" placeholder="Логин"></div>
                    <div class="form-group"><label>Пароль *</label><input type="password" id="new-user-pass" placeholder="Пароль"></div>
                    <div class="form-group"><label>ФИО *</label><input type="text" id="new-user-name" placeholder="Иванов И.И."></div>
                    <div class="form-group"><label>Отдел</label><input type="text" id="new-user-department" placeholder="Отдел"></div>
                    <div class="form-group"><label>Должность</label><input type="text" id="new-user-position" placeholder="Должность"></div>
                    <div class="modal-buttons"><button class="btn-save" onclick="app.createUser()">💾 Создать</button><button class="btn-cancel" onclick="app.closeCreateUserModal()">❌ Отмена</button></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeCreateUserModal() {
        const modal = document.getElementById('create-user-modal');
        if (modal) modal.remove();
    },

    async createUser() {
        const login_id = document.getElementById('new-user-login').value.trim();
        const password = document.getElementById('new-user-pass').value.trim();
        const full_name = document.getElementById('new-user-name').value.trim();
        if (!login_id || !password || !full_name) { alert('Логин, пароль и ФИО обязательны'); return; }
        if (password.length < 4) { alert('Пароль минимум 4 символа'); return; }

        try {
            const res = await fetch('/api/users/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login_id, password, full_name,
                    department: document.getElementById('new-user-department').value.trim(),
                    position: document.getElementById('new-user-position').value.trim(),
                    created_by: this.currentUser.id
                })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            const data = await res.json();
            this.closeCreateUserModal();
            this.loadUsers();
            alert(`✅ Пользователь ${data.user.full_name} создан!`);
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async openEditUserModal(userId) {
        if (!this.currentUser || this.currentUser.role !== 'director') {
            alert('Только директор может редактировать пользователей');
            return;
        }

        try {
            const res = await fetch('/api/users/all');
            const users = await res.json();
            const user = users.find(u => u.id === userId);
            if (!user) { alert('Пользователь не найден'); return; }

            document.getElementById('edit-user-id').value = user.id;
            document.getElementById('edit-user-login').value = user.login_id;
            document.getElementById('edit-user-name').value = user.full_name || '';
            document.getElementById('edit-user-department').value = user.department || '';
            document.getElementById('edit-user-position').value = user.position || '';
            document.getElementById('edit-user-password').value = '';
            document.getElementById('edit-user-title').textContent = `✏️ Редактировать пользователя: ${user.login_id}`;

            document.getElementById('edit-user-modal').style.display = 'flex';
            document.getElementById('edit-user-modal').classList.add('active');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    closeEditUserModal() {
        const modal = document.getElementById('edit-user-modal');
        if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); }
    },

    async saveEditUser() {
        const id = document.getElementById('edit-user-id').value;
        const full_name = document.getElementById('edit-user-name').value.trim();
        const department = document.getElementById('edit-user-department').value.trim();
        const position = document.getElementById('edit-user-position').value.trim();
        const password = document.getElementById('edit-user-password').value.trim();

        if (!full_name) { alert('ФИО обязательно'); return; }

        try {
            // Обновляем данные
            const res1 = await fetch(`/api/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name, department, position, current_admin_id: this.currentUser.id })
            });
            if (!res1.ok) { const e = await res1.json(); throw new Error(e.error); }

            // Если пароль указан - меняем
            if (password) {
                if (password.length < 4) { alert('Пароль минимум 4 символа'); return; }
                const res2 = await fetch(`/api/users/${id}/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password, current_admin_id: this.currentUser.id })
                });
                if (!res2.ok) { const e = await res2.json(); throw new Error(e.error); }
                alert('✅ Пароль изменен');
            }

            this.closeEditUserModal();
            this.loadUsers();
            alert('✅ Данные пользователя обновлены');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async deleteUser(id) {
        if (!confirm('Удалить пользователя навсегда?')) return;
        if (!this.currentUser || this.currentUser.role !== 'director') {
            alert('Только директор может удалять пользователей');
            return;
        }

        try {
            const res = await fetch(`/api/users/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_admin_id: this.currentUser.id })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            this.loadUsers();
            alert('✅ Пользователь удален');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    // ============================================================
    // УПРАВЛЕНИЕ АДМИНАМИ (ТОЛЬКО ДИРЕКТОР)
    // ============================================================

    async loadAdminsList() {
        const container = document.getElementById('admins-grid');
        if (!container) return;
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка...</p>';

        if (!this.currentUser || this.currentUser.role !== 'director') {
            container.innerHTML = '<p style="text-align:center;color:var(--danger);">Доступ только для директора</p>';
            return;
        }

        try {
            const res = await fetch('/api/admins/all');
            const admins = await res.json();
            if (!admins.length) {
                container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;"><p>👑 Нет администраторов</p></div>`;
                return;
            }
            const roleLabels = { 'admin': '👤 Админ', 'super_admin': '🛠️ Гл. Админ', 'director': '👑 Директор' };
            container.innerHTML = `
                <table class="inv-table">
                    <thead><tr><th>Логин</th><th>ФИО</th><th>Роль</th><th>Телефон</th><th>Цвет</th><th>Создан</th><th>Кем</th><th style="width:150px;">Действия</th></tr></thead>
                    <tbody>${admins.map(a => `
                        <tr>
                            <td>${a.login_id}</td>
                            <td>${a.full_name}</td>
                            <td>${roleLabels[a.role] || a.role}</td>
                            <td>${a.phone_number || '—'}</td>
                            <td><span style="display:inline-block;width:30px;height:30px;border-radius:50%;background:${a.color_theme || '#4a9eff'};border:2px solid #fff;box-shadow:0 0 10px ${a.color_theme || '#4a9eff'}44;"></span></td>
                            <td>${new Date(a.created_at).toLocaleDateString('ru-RU')}</td>
                            <td>${a.created_by_name || '—'}</td>
                            <td>
                                ${a.id !== this.currentUser.id ? `
                                    <button class="btn-edit" onclick="app.openEditAdminModal(${a.id})">✏️</button>
                                    <button class="btn-delete-inv" onclick="app.deleteAdmin(${a.id})">🗑️</button>
                                ` : '<span style="color:var(--text-muted);">Это вы</span>'}
                            </td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            `;
        } catch (e) { container.innerHTML = `<p style="color:var(--danger);">Ошибка: ${e.message}</p>`; }
    },

    showCreateAdminModal() {
        if (!this.currentUser || this.currentUser.role !== 'director') {
            alert('Только директор может создавать администраторов');
            return;
        }
        const modalHtml = `
            <div id="create-admin-modal" class="modal active" style="display:flex;">
                <div class="modal-content" style="max-width:420px;">
                    <span class="close-modal" onclick="app.closeCreateAdminModal()">&times;</span>
                    <h2>👑 Создать администратора</h2>
                    <div class="form-group"><label>Логин *</label><input type="text" id="new-admin-login"></div>
                    <div class="form-group"><label>Пароль *</label><input type="password" id="new-admin-pass"></div>
                    <div class="form-group"><label>ФИО *</label><input type="text" id="new-admin-name"></div>
                    <div class="form-group"><label>Роль</label><select id="new-admin-role"><option value="admin">Администратор</option><option value="super_admin">Главный</option><option value="director">Директор</option></select></div>
                    <div class="form-group"><label>Телефон</label><input type="text" id="new-admin-phone"></div>
                    <div class="form-group"><label>Цвет</label><input type="color" id="new-admin-color" value="#4a9eff"></div>
                    <div class="modal-buttons"><button class="btn-save" onclick="app.createAdmin()">💾 Создать</button><button class="btn-cancel" onclick="app.closeCreateAdminModal()">❌ Отмена</button></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeCreateAdminModal() {
        const modal = document.getElementById('create-admin-modal');
        if (modal) modal.remove();
    },

    async createAdmin() {
        const login_id = document.getElementById('new-admin-login').value.trim();
        const password = document.getElementById('new-admin-pass').value.trim();
        const full_name = document.getElementById('new-admin-name').value.trim();
        if (!login_id || !password || !full_name) { alert('Заполните все обязательные поля'); return; }
        if (password.length < 4) { alert('Пароль минимум 4 символа'); return; }

        try {
            const res = await fetch('/api/admins/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login_id, password, full_name,
                    role: document.getElementById('new-admin-role').value,
                    phone_number: document.getElementById('new-admin-phone').value.trim(),
                    color_theme: document.getElementById('new-admin-color').value,
                    created_by: this.currentUser.id
                })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            const data = await res.json();
            this.closeCreateAdminModal();
            this.loadAdminsList();
            alert(`✅ Администратор ${data.admin.full_name} создан`);
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async openEditAdminModal(adminId) {
        if (!this.currentUser || this.currentUser.role !== 'director') {
            alert('Только директор может редактировать администраторов');
            return;
        }

        try {
            const res = await fetch('/api/admins/all');
            const admins = await res.json();
            const admin = admins.find(a => a.id === adminId);
            if (!admin) { alert('Администратор не найден'); return; }

            document.getElementById('edit-admin-id').value = admin.id;
            document.getElementById('edit-admin-login').value = admin.login_id;
            document.getElementById('edit-admin-name').value = admin.full_name || '';
            document.getElementById('edit-admin-role').value = admin.role || 'admin';
            document.getElementById('edit-admin-phone').value = admin.phone_number || '';
            document.getElementById('edit-admin-color').value = admin.color_theme || '#4a9eff';
            document.getElementById('edit-admin-password').value = '';
            document.getElementById('edit-admin-title').textContent = `✏️ Редактировать: ${admin.login_id}`;

            document.getElementById('edit-admin-modal').style.display = 'flex';
            document.getElementById('edit-admin-modal').classList.add('active');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    closeEditAdminModal() {
        const modal = document.getElementById('edit-admin-modal');
        if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); }
    },

    async saveEditAdmin() {
        const id = document.getElementById('edit-admin-id').value;
        const full_name = document.getElementById('edit-admin-name').value.trim();
        const role = document.getElementById('edit-admin-role').value;
        const phone_number = document.getElementById('edit-admin-phone').value.trim();
        const color_theme = document.getElementById('edit-admin-color').value;
        const password = document.getElementById('edit-admin-password').value.trim();

        if (!full_name) { alert('ФИО обязательно'); return; }

        try {
            // Обновляем данные
            const res1 = await fetch(`/api/admins/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name, role, phone_number, color_theme, current_admin_id: this.currentUser.id })
            });
            if (!res1.ok) { const e = await res1.json(); throw new Error(e.error); }

            // Если пароль указан - меняем
            if (password) {
                if (password.length < 4) { alert('Пароль минимум 4 символа'); return; }
                const res2 = await fetch(`/api/admins/${id}/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password, current_admin_id: this.currentUser.id })
                });
                if (!res2.ok) { const e = await res2.json(); throw new Error(e.error); }
                alert('✅ Пароль администратора изменен');
            }

            this.closeEditAdminModal();
            this.loadAdminsList();
            alert('✅ Данные администратора обновлены');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async deleteAdmin(id) {
        if (!confirm('Удалить администратора навсегда?')) return;
        if (!this.currentUser || this.currentUser.role !== 'director') {
            alert('Только директор может удалять администраторов');
            return;
        }
        if (id == this.currentUser.id) {
            alert('Нельзя удалить самого себя');
            return;
        }

        try {
            const res = await fetch(`/api/admins/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_admin_id: this.currentUser.id })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            this.loadAdminsList();
            alert('✅ Администратор удален');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    // ============================================================
    // ИНВЕНТАРЬ (сокращенный)
    // ============================================================

    async updateInventoryList() {
        const container = document.getElementById('inventory-container');
        if (!container) return;
        try {
            const [laptops, computers, printers] = await Promise.all([
                fetch('/api/inventory/laptops').then(r => r.json()),
                fetch('/api/inventory/computers').then(r => r.json()),
                fetch('/api/inventory/printers').then(r => r.json())
            ]);

            const searchQuery = this.searchState.inventory || '';
            const searchFields = {
                laptops: ['inventory_number', 'responsible', 'location', 'cpu', 'ram', 'storage', 'windows_version', 'ip_lan', 'mac', 'name', 'manufacturer'],
                computers: ['inventory_number', 'responsible', 'location', 'cpu', 'ram', 'storage', 'windows_version', 'ip_lan', 'mac', 'name', 'manufacturer'],
                printers: ['inventory_number', 'model', 'cartridge', 'location', 'ip', 'comment']
            };

            const filtered = {
                laptops: this.searchData(laptops, searchQuery, searchFields.laptops),
                computers: this.searchData(computers, searchQuery, searchFields.computers),
                printers: this.searchData(printers, searchQuery, searchFields.printers)
            };

            const renderSection = (title, type, data, cols) => {
                if (!data.length) {
                    return `<details class="inventory-section" open><summary class="section-header"><span>${title} (0)</span><button class="btn-add-inventory" onclick="app.openInventoryModal('${type}', null, '${type}')">➕ Добавить</button></summary><p style="color:var(--text-muted);padding:40px;text-align:center;">Нет записей</p></details>`;
                }
                return `
                    <details class="inventory-section" open>
                        <summary class="section-header"><span>${title} (${data.length})</span><button class="btn-add-inventory" onclick="app.openInventoryModal('${type}', null, '${type}')">➕ Добавить</button></summary>
                        <div class="table-wrapper"><table class="inv-table">
                            <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}<th style="width:120px;">Действия</th></tr></thead>
                            <tbody>${data.map(row => `
                                <tr>${cols.map(c => `<td title="${row[c.key] || ''}">${row[c.key] || '—'}</td>`).join('')}
                                <td class="action-buttons">
                                    <button class="btn-edit" onclick='app.openInventoryModal("${type}", ${JSON.stringify(row).replace(/'/g, "&#39;")}, "${type}")'>✏️</button>
                                    <button class="btn-delete-inv" onclick="app.deleteInventoryItem('${type}', ${row.id})">🗑️</button>
                                </td></tr>
                            `).join('')}</tbody>
                        </table></div>
                    </details>
                `;
            };

            container.innerHTML = `
                ${renderSection('💻 Ноутбуки', 'laptops', filtered.laptops, [
                    { key: 'inventory_number', label: 'Инв. №' }, { key: 'responsible', label: 'Ответственный' },
                    { key: 'location', label: 'Расположение' }, { key: 'cpu', label: 'CPU' },
                    { key: 'ram', label: 'RAM' }, { key: 'storage', label: 'Накопитель' },
                    { key: 'windows_version', label: 'ОС' }, { key: 'ip_lan', label: 'IP' },
                    { key: 'mac', label: 'MAC' }
                ])}
                ${renderSection('🖥️ ПК', 'computers', filtered.computers, [
                    { key: 'inventory_number', label: 'Инв. №' }, { key: 'responsible', label: 'Ответственный' },
                    { key: 'location', label: 'Расположение' }, { key: 'cpu', label: 'CPU' },
                    { key: 'ram', label: 'RAM' }, { key: 'storage', label: 'Накопитель' },
                    { key: 'windows_version', label: 'ОС' }, { key: 'ip_lan', label: 'IP' },
                    { key: 'mac', label: 'MAC' }
                ])}
                ${renderSection('🖨️ Принтеры', 'printers', filtered.printers, [
                    { key: 'inventory_number', label: 'Инв. №' }, { key: 'model', label: 'Модель' },
                    { key: 'cartridge', label: 'Картридж' }, { key: 'location', label: 'Расположение' },
                    { key: 'ip', label: 'IP' }, { key: 'comment', label: 'Примечание' }
                ])}
            `;
            setTimeout(() => this.initResizers(), 100);
        } catch (e) { container.innerHTML = `<p style="color:var(--danger);">Ошибка: ${e.message}</p>`; }
    },

    async loadInventory() {
        const container = document.getElementById('inventory-container');
        if (!container) return;
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка...</p>';
        await this.updateInventoryList();
    },

    openInventoryModal(type, item = null, sectionType = null) {
        const modal = document.getElementById('inventory-modal');
        const form = document.getElementById('inventory-form');
        const title = document.getElementById('modal-title');
        const actualType = sectionType || type;
        form.dataset.type = actualType;
        form.dataset.id = item ? item.id : '';
        title.textContent = item ? '✏️ Редактировать' : '➕ Добавить';

        let fields = [];
        if (actualType === 'laptops' || actualType === 'computers') {
            fields = [
                { key: 'inventory_number', label: 'Инв. №', value: item?.inventory_number || '' },
                { key: 'responsible', label: 'Ответственный', value: item?.responsible || '' },
                { key: 'location', label: 'Расположение', value: item?.location || '' },
                { key: 'cpu', label: 'CPU', value: item?.cpu || '' },
                { key: 'ram', label: 'RAM', value: item?.ram || '' },
                { key: 'storage', label: 'Накопитель', value: item?.storage || '' },
                { key: 'windows_version', label: 'ОС', value: item?.windows_version || '' },
                { key: 'ip_inet', label: 'IP (Интернет)', value: item?.ip_inet || '' },
                { key: 'ip_lan', label: 'IP (Локальная)', value: item?.ip_lan || '' },
                { key: 'mac', label: 'MAC', value: item?.mac || '' },
                { key: 'name', label: 'Имя в сети', value: item?.name || '' },
                { key: 'manufacturer', label: 'Производитель', value: item?.manufacturer || '' }
            ];
        } else {
            fields = [
                { key: 'inventory_number', label: 'Инв. №', value: item?.inventory_number || '' },
                { key: 'model', label: 'Модель', value: item?.model || '' },
                { key: 'cartridge', label: 'Картридж', value: item?.cartridge || '' },
                { key: 'location', label: 'Расположение', value: item?.location || '' },
                { key: 'ip', label: 'IP', value: item?.ip || '' },
                { key: 'comment', label: 'Примечание', value: item?.comment || '' }
            ];
        }

        form.innerHTML = fields.map(f => `
            <div class="form-group"><label>${f.label}</label><input type="text" name="${f.key}" value="${f.value || ''}"></div>
        `).join('') + `
            <div class="modal-buttons"><button type="submit" class="btn-save">💾 Сохранить</button><button type="button" class="btn-cancel" onclick="app.closeInventoryModal()">❌ Отмена</button></div>
        `;
        modal.style.display = 'flex';
        modal.classList.add('active');
    },

    closeInventoryModal() {
        const modal = document.getElementById('inventory-modal');
        if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); }
    },

    async saveInventoryItem(e) {
        e.preventDefault();
        const form = e.target;
        const type = form.dataset.type;
        const id = form.dataset.id;
        const data = Object.fromEntries(new FormData(form));
        try {
            const url = id ? `/api/inventory/${type}/${id}` : `/api/inventory/${type}`;
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            this.closeInventoryModal();
            this.loadInventory();
            alert('✅ Сохранено');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    async deleteInventoryItem(type, id) {
        if (!confirm('Удалить?')) return;
        try {
            const res = await fetch(`/api/inventory/${type}/${id}`, { method: 'DELETE' });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            this.loadInventory();
            alert('✅ Удалено');
        } catch (e) { alert('Ошибка: ' + e.message); }
    },

    initResizers() {
        document.querySelectorAll('.inv-table').forEach(table => {
            table.querySelectorAll('.resizer').forEach(resizer => {
                resizer.removeEventListener('mousedown', this.handleResizeStart);
                resizer.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.startResize(e, table, resizer.closest('th'));
                });
            });
        });
    },

    startResize(e, table, header) {
        const th = header;
        const startX = e.pageX;
        const startWidth = th.offsetWidth;
        let indicator = document.querySelector('.resizing-indicator') || (() => {
            const el = document.createElement('div');
            el.className = 'resizing-indicator';
            document.body.appendChild(el);
            return el;
        })();

        const onMouseMove = (moveEvent) => {
            const newWidth = Math.max(50, startWidth + moveEvent.pageX - startX);
            indicator.classList.add('active');
            indicator.style.setProperty('--resize-x', moveEvent.pageX + 'px');
            th.style.width = newWidth + 'px';
            th.style.minWidth = newWidth + 'px';
            const colIndex = Array.from(th.parentElement.children).indexOf(th);
            table.querySelectorAll('tbody tr').forEach(row => {
                const cell = row.children[colIndex];
                if (cell) { cell.style.width = newWidth + 'px'; cell.style.minWidth = newWidth + 'px'; }
            });
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            indicator.classList.remove('active');
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    },

    // ============================================================
    // КЛАВИАТУРНЫЕ КОМБИНАЦИИ
    // ============================================================

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
                const onKeyDown = (ev) => {
                    if (ev.key === 'k' || ev.key === 'K' || ev.key === 'к' || ev.key === 'К') {
                        ev.preventDefault();
                        const adminForm = document.getElementById('login-admin-form');
                        if (adminForm) {
                            if (adminForm.style.display === 'block') {
                                adminForm.style.display = 'none';
                            } else {
                                adminForm.style.display = 'block';
                                document.getElementById('admin-login-input').focus();
                            }
                        }
                        document.removeEventListener('keydown', onKeyDown);
                    }
                };
                document.addEventListener('keydown', onKeyDown);
            }
        });
    }
};

// Инициализация
console.log('🚀 IT Portal загружен');
console.log('🔑 S+K — вход администратора');
console.log('📋 Тестовый логин: dmitry / 123456 (директор)');

app.initKeyboardShortcuts();
app.initNavArrows();

setTimeout(() => { app.initResizers(); }, 500);