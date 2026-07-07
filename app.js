const app = {
    currentUser: { id: null, role: null },

    // ============================================================
    // СКРЫТЫЙ ВХОД (S+K)
    // ============================================================

    showAdminLogin: false,

    // ============================================================
    // ПЕРЕМЕННЫЕ ДЛЯ СОРТИРОВКИ И ПОИСКА
    // ============================================================

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
    fromAdmin: false,

    // ============================================================
    // НАВИГАЦИЯ
    // ============================================================
    
    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        
        if (id === 'screen-ticket' || id === 'screen-login' || id === 'screen-track-tickets' || id === 'screen-find-ticket') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else if (id === 'screen-admin') {
            document.documentElement.setAttribute('data-theme', 'dark');
            this.startAutoRefresh();
        } else {
            this.stopAutoRefresh();
        }
        
        if (id === 'screen-ticket' || id === 'screen-admin' || id === 'screen-track-tickets' || id === 'screen-find-ticket') {
            this.loadPhones(id);
        }
        
        if (id === 'screen-login') {
            document.getElementById('admin-login-input').value = '';
            this.currentUser = { id: null, role: null };
            document.documentElement.setAttribute('data-theme', 'light');
            this.showAdminLogin = false;
            const section = document.getElementById('admin-login-section');
            if (section) section.style.display = 'none';
            this.stopAutoRefresh();
        }
        
        if (id === 'screen-track-tickets') {
            this.loadTrackedTickets();
        }
        
        if (id === 'screen-ticket') {
            const adminScreen = document.getElementById('screen-admin');
            if (adminScreen && !adminScreen.classList.contains('active')) {
                this.fromAdmin = true;
            } else {
                this.fromAdmin = false;
            }
        }
    },

    // ============================================================
    // ЗАГРУЗКА ТЕЛЕФОНОВ
    // ============================================================

    async loadPhones(screenId) {
        let footerId;
        if (screenId === 'screen-admin') footerId = 'admin-footer';
        else if (screenId === 'screen-track-tickets') footerId = 'track-footer';
        else if (screenId === 'screen-find-ticket') footerId = 'find-footer';
        else footerId = 'ticket-footer';
        const footer = document.getElementById(footerId);
        if (!footer || footer.dataset.loaded) return;
        try {
            const res = await fetch('/api/phones');
            const phones = await res.json();
            footer.textContent = '📞 Экстренная связь: ' + phones.join(' | ');
            footer.dataset.loaded = 'true';
        } catch (e) { footer.textContent = 'Телефоны недоступны'; }
    },

    // ============================================================
    // АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ
    // ============================================================

    startAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        this.autoRefreshInterval = setInterval(() => {
            if (document.getElementById('screen-admin').classList.contains('active')) {
                const activeTab = document.querySelector('.nav-btn.active[data-tab]');
                if (activeTab) {
                    this.switchTab(activeTab.dataset.tab);
                }
            }
        }, 30000);
    },

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    },

    // ============================================================
    // ОБРАБОТЧИКИ КЛАВИШ (S+K)
    // ============================================================

    toggleAdminLogin() {
        const section = document.getElementById('admin-login-section');
        if (!section) return;
        
        if (this.showAdminLogin) {
            section.style.display = 'none';
            this.showAdminLogin = false;
        } else {
            section.style.display = 'block';
            this.showAdminLogin = true;
            setTimeout(() => {
                document.getElementById('admin-login-input').focus();
            }, 100);
        }
    },

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
                const onKeyDown = (ev) => {
                    if (ev.key === 'k' || ev.key === 'K' || ev.key === 'к' || ev.key === 'К' || ev.key === 'л' || ev.key === 'Л') {
                        ev.preventDefault();
                        this.toggleAdminLogin();
                        document.removeEventListener('keydown', onKeyDown);
                    }
                };
                document.addEventListener('keydown', onKeyDown);
            }
            if (e.key === 'Escape' && this.showAdminLogin) {
                this.toggleAdminLogin();
            }
        });
    },

    // ============================================================
    // АВТОРИЗАЦИЯ
    // ============================================================

    async login() {
        const input = document.getElementById('admin-login-input');
        const loginId = input.value.trim();
        if (!loginId) { alert('Введите ID'); return; }
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login_id: loginId })
            });
            if (res.ok) {
                const data = await res.json();
                this.currentUser.id = data.userId;
                this.currentUser.role = data.role;
                const roleDisplay = document.getElementById('admin-role-indicator');
                if (data.role === 'super_admin') {
                    roleDisplay.textContent = '👑 Главный администратор';
                    roleDisplay.className = 'admin-role super';
                } else {
                    roleDisplay.textContent = '🛠️ Администратор';
                    roleDisplay.className = 'admin-role';
                }
                this.showScreen('screen-admin');
                this.switchTab('active');
            } else {
                input.classList.add('error');
                setTimeout(() => input.classList.remove('error'), 600);
                alert('Пользователь не найден');
            }
        } catch (err) {
            console.error('❌ Login error:', err);
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 600);
            alert('Ошибка входа: ' + err.message);
        }
    },

    logout() {
        this.currentUser = { id: null, role: null };
        this.showScreen('screen-login');
    },

    switchTab(tab) {
        document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
        const targetBtn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
        if (targetBtn) targetBtn.classList.add('active');

        if (tab === 'inventory') this.loadInventory();
        else if (tab === 'tasks') this.loadTasks(false);
        else if (tab === 'tasks-archive') this.loadTasks(true);
        else if (tab === 'ip-stats') this.loadIPStats();
        else this.loadTickets(tab === 'archived');
    },

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

    // ============================================================
    // ФОРМАТИРОВАНИЕ USER-AGENT
    // ============================================================

    formatUserAgent(userAgent) {
        if (!userAgent) return 'Неизвестно';
        let result = [];
        if (userAgent.includes('Windows NT 10.0')) result.push('Windows 10/11');
        else if (userAgent.includes('Windows NT 6.1')) result.push('Windows 7');
        else if (userAgent.includes('Windows NT 6.2')) result.push('Windows 8');
        else if (userAgent.includes('Windows NT 6.3')) result.push('Windows 8.1');
        else if (userAgent.includes('Mac OS X')) result.push('macOS');
        else if (userAgent.includes('Linux') && !userAgent.includes('Android')) result.push('Linux');
        else if (userAgent.includes('Android')) result.push('Android');
        else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) result.push('iOS');
        else result.push('Unknown OS');
        if (userAgent.includes('Chrome') && !userAgent.includes('Edg') && !userAgent.includes('OPR')) result.push('Chrome');
        else if (userAgent.includes('Firefox')) result.push('Firefox');
        else if (userAgent.includes('Safari') && !userAgent.includes('Chrome') && !userAgent.includes('Edg')) result.push('Safari');
        else if (userAgent.includes('Edg')) result.push('Edge');
        else if (userAgent.includes('OPR')) result.push('Opera');
        else if (userAgent.includes('YaBrowser')) result.push('Yandex');
        else result.push('Unknown Browser');
        if (userAgent.includes('Mobile')) result.push('📱');
        else if (userAgent.includes('Tablet')) result.push('📱');
        else result.push('💻');
        return result.join(' ');
    },

    // ============================================================
    // LOCALSTORAGE ДЛЯ ОТСЛЕЖИВАНИЯ
    // ============================================================

    saveTicketToken(token) {
        try {
            let tokens = JSON.parse(localStorage.getItem('trackingTickets') || '[]');
            if (!tokens.includes(token)) {
                tokens.push(token);
                localStorage.setItem('trackingTickets', JSON.stringify(tokens));
            }
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

    // ============================================================
    // ВЫХОД ИЗ МОИХ ЗАЯВОК
    // ============================================================

    logoutFromTracks() {
        this.showScreen('screen-login');
    },

    // ============================================================
    // ПОИСК ПО ТОКЕНУ (2 БУКВЫ + 2 ЦИФРЫ)
    // ============================================================

    async findTicketByToken() {
        const input = document.getElementById('find-ticket-input');
        const result = document.getElementById('find-result');
        let token = input.value.trim().toUpperCase();
        
        if (!token) {
            result.innerHTML = `<p style="color:var(--warning);text-align:center;padding:20px;">⚠️ Введите номер заявки</p>`;
            return;
        }
        
        if (!/^[A-Z]{2}\d{2}$/.test(token)) {
            result.innerHTML = `<p style="color:var(--warning);text-align:center;padding:20px;">⚠️ Неверный формат. Используйте 2 буквы + 2 цифры (например: AB12)</p>`;
            return;
        }
        
        result.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">⏳ Поиск...</p>';
        
        try {
            const res = await fetch(`/api/ticket/track/${token}`);
            
            if (res.status === 404) {
                result.innerHTML = `
                    <div class="find-not-found">
                        <p style="color:var(--text-muted);text-align:center;padding:20px;font-size:16px;">
                            ❌ Заявка с номером <strong>${token}</strong> не найдена
                        </p>
                        <p style="color:var(--text-muted);text-align:center;font-size:13px;">
                            Проверьте правильность введенного номера
                        </p>
                    </div>
                `;
                return;
            }
            
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Ошибка поиска');
            }
            
            const ticket = await res.json();
            
            const statusLabels = {
                'false': '⏳ Ожидает',
                'true': '✅ Выполнена'
            };
            
            const timeClass = ticket.color_class || this.getTicketTimeClass(ticket.created_at);
            const comments = ticket.comments || [];
            
            let commentsHtml = comments.length > 0 ? `
                <div class="find-comments">
                    <details>
                        <summary>💬 Комментарии (${comments.length})</summary>
                        ${comments.map(c => `
                            <div class="comment-item">
                                <div class="comment-text">${c.comment_text}</div>
                                <div class="comment-meta">Админ #${c.admin_id} • ${new Date(c.created_at).toLocaleString('ru-RU')}</div>
                            </div>
                        `).join('')}
                    </details>
                </div>
            ` : '';
            
            result.innerHTML = `
                <div class="find-result-card ${timeClass}">
                    <div class="find-result-header">
                        <span class="find-id">#${ticket.id}</span>
                        <span class="find-status ${ticket.status ? 'completed' : 'pending'}">
                            ${statusLabels[ticket.status] || ticket.status}
                        </span>
                    </div>
                    <div class="find-result-body">
                        <div class="find-problem">${ticket.problem_desc}</div>
                        <div class="find-meta">
                            <span>📍 ${ticket.location}</span>
                            <span>👤 ${ticket.employee_info}</span>
                            <span>⏱️ ${ticket.urgency}</span>
                            <span>📅 ${new Date(ticket.created_at).toLocaleString('ru-RU')}</span>
                            ${ticket.executor_name ? `<span>✅ Исполнитель: ${ticket.executor_name}</span>` : ''}
                        </div>
                        ${commentsHtml}
                        ${ticket.comment ? `<div class="find-user-comment">💬 ${ticket.comment}</div>` : ''}
                    </div>
                    <div class="find-result-footer">
                        <span class="find-token">🔑 ${ticket.tracking_token}</span>
                        <button class="find-copy" onclick="app.copyToken('${ticket.tracking_token}')">📋 Копировать</button>
                        <button class="find-track" onclick="app.addTokenToTracking('${ticket.tracking_token}')">➕ Добавить в мои заявки</button>
                    </div>
                </div>
            `;
            
        } catch (err) {
            console.error('❌ Ошибка поиска:', err);
            result.innerHTML = `
                <div class="find-error">
                    <p style="color:var(--danger);text-align:center;padding:20px;">
                        ❌ Ошибка: ${err.message}
                    </p>
                </div>
            `;
        }
    },

    addTokenToTracking(token) {
        this.saveTicketToken(token);
        alert(`✅ Заявка ${token} добавлена в "Мои заявки"`);
        if (confirm('Перейти к моим заявкам?')) {
            this.showScreen('screen-track-tickets');
            this.loadTrackedTickets();
        }
    },

    // ============================================================
    // МОИ ЗАЯВКИ
    // ============================================================

    async loadTrackedTickets() {
        const container = document.getElementById('screen-track-tickets-content');
        if (!container) return;
        const tokens = this.getSavedTokens();

        if (tokens.length === 0) {
            container.innerHTML = `
                <div class="track-empty">
                    <p style="text-align:center;color:var(--text-muted);padding:40px;font-size:16px;">📭 У вас пока нет отслеживаемых заявок</p>
                    <div style="text-align:center;">
                        <button class="btn-create-ticket" onclick="app.showScreen('screen-ticket')">📝 Создать заявку</button>
                    </div>
                </div>
            `;
            return;
        }

        try {
            const res = await fetch('/api/tickets/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tokens })
            });
            if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
            const tickets = await res.json();

            if (!tickets || tickets.length === 0) {
                container.innerHTML = `
                    <div class="track-empty">
                        <p style="text-align:center;color:var(--text-muted);padding:40px;font-size:16px;">📭 Заявки не найдены</p>
                        <div style="text-align:center;">
                            <button class="btn-create-ticket" onclick="app.showScreen('screen-ticket')">📝 Создать заявку</button>
                        </div>
                    </div>
                `;
                return;
            }

            const statusLabels = { 'false': '⏳ Ожидает', 'true': '✅ Выполнена' };

            container.innerHTML = `
                <div class="track-list">
                    ${tickets.map(t => {
                        const timeClass = t.color_class || this.getTicketTimeClass(t.created_at);
                        const comments = t.comments || [];
                        let commentsHtml = comments.length > 0 ? `
                            <div class="track-comments">
                                <details>
                                    <summary>💬 Комментарии (${comments.length})</summary>
                                    ${comments.map(c => `
                                        <div class="comment-item">
                                            <div class="comment-text">${c.comment_text}</div>
                                            <div class="comment-meta">Админ #${c.admin_id} • ${new Date(c.created_at).toLocaleString('ru-RU')}</div>
                                        </div>
                                    `).join('')}
                                </details>
                            </div>
                        ` : '';

                        return `
                            <div class="track-card ${timeClass}">
                                <div class="track-card-header">
                                    <span class="track-id">#${t.id}</span>
                                    <span class="track-status ${t.status ? 'completed' : 'pending'}">${statusLabels[t.status] || t.status}</span>
                                    <button class="track-remove" onclick="app.removeTrackedTicket('${t.tracking_token}')">✕</button>
                                </div>
                                <div class="track-card-body">
                                    <div class="track-problem">${t.problem_desc}</div>
                                    <div class="track-meta">
                                        <span>📍 ${t.location}</span>
                                        <span>👤 ${t.employee_info}</span>
                                        <span>⏱️ ${t.urgency}</span>
                                        <span>📅 ${new Date(t.created_at).toLocaleString('ru-RU')}</span>
                                        ${t.executor_name ? `<span>✅ Исполнитель: ${t.executor_name}</span>` : ''}
                                    </div>
                                    ${commentsHtml}
                                    ${t.comment ? `<div class="track-user-comment">💬 ${t.comment}</div>` : ''}
                                </div>
                                <div class="track-card-footer">
                                    <span class="track-token">🔑 ${t.tracking_token}</span>
                                    <button class="track-copy" onclick="app.copyToken('${t.tracking_token}')">📋 Копировать</button>
                                    <button class="track-refresh" onclick="app.loadTrackedTickets()">🔄 Обновить</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (err) {
            container.innerHTML = `
                <div class="track-empty">
                    <p style="color:var(--danger);text-align:center;padding:40px;font-size:16px;">❌ Ошибка: ${err.message}</p>
                    <div style="text-align:center;">
                        <button class="btn-create-ticket" onclick="app.loadTrackedTickets()">🔄 Попробовать снова</button>
                    </div>
                </div>
            `;
        }
    },

    removeTrackedTicket(token) {
        if (!confirm('Убрать эту заявку из отслеживания?')) return;
        this.removeTicketToken(token);
        this.loadTrackedTickets();
    },

    clearAllTokens() {
        if (!confirm('Очистить весь список отслеживаемых заявок?')) return;
        localStorage.removeItem('trackingTickets');
        this.loadTrackedTickets();
    },

    copyToken(token) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(token).then(() => {
                alert('✅ Токен скопирован: ' + token);
            }).catch(() => this.fallbackCopy(token));
        } else {
            this.fallbackCopy(token);
        }
    },

    fallbackCopy(token) {
        const textArea = document.createElement('textarea');
        textArea.value = token;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            alert('✅ Токен скопирован: ' + token);
        } catch (e) {
            alert('❌ Токен: ' + token);
        }
        document.body.removeChild(textArea);
    },

    // ============================================================
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ============================================================

    sortData(data, field, order) {
        return [...data].sort((a, b) => {
            let valA = a[field] || '', valB = b[field] || '';
            if (!isNaN(valA) && !isNaN(valB)) { valA = parseFloat(valA); valB = parseFloat(valB); }
            else if (field.includes('_at') || field === 'created_at' || field === 'completed_at' || field === 'due_date') {
                valA = new Date(valA); valB = new Date(valB);
            } else { valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); }
            if (valA < valB) return order === 'asc' ? -1 : 1;
            if (valA > valB) return order === 'asc' ? 1 : -1;
            return 0;
        });
    },

    searchData(data, query, fields) {
        if (!query || query.trim() === '') return data;
        const q = query.toLowerCase().trim();
        return data.filter(item => fields.some(field => {
            const val = item[field];
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

    // ============================================================
    // СТРЕЛКИ НАВИГАЦИИ
    // ============================================================

    scrollUp() {
        const currentScroll = window.scrollY;
        const targetScroll = Math.max(0, currentScroll - 300);
        window.scrollTo({ top: targetScroll, behavior: 'smooth' });
        const btn = document.querySelector('.nav-arrow-up');
        if (btn) {
            btn.style.transform = 'scale(0.9)';
            setTimeout(() => { btn.style.transform = ''; }, 200);
        }
    },

    scrollDown() {
        const currentScroll = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const targetScroll = Math.min(maxScroll, currentScroll + 300);
        window.scrollTo({ top: targetScroll, behavior: 'smooth' });
        const btn = document.querySelector('.nav-arrow-down');
        if (btn) {
            btn.style.transform = 'scale(0.9)';
            setTimeout(() => { btn.style.transform = ''; }, 200);
        }
    },

    initNavArrows() {
        const upArrow = document.querySelector('.nav-arrow-up');
        const downArrow = document.querySelector('.nav-arrow-down');
        if (!upArrow || !downArrow) return;
        let timeoutId = null;
        const updateArrows = () => {
            const scrollY = window.scrollY;
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            if (scrollY <= 50) { upArrow.classList.add('hidden'); } else { upArrow.classList.remove('hidden'); }
            if (scrollY >= maxScroll - 50) { downArrow.classList.add('hidden'); } else { downArrow.classList.remove('hidden'); }
        };
        window.addEventListener('scroll', updateArrows);
        window.addEventListener('resize', updateArrows);
        setTimeout(updateArrows, 100);
        const showArrows = () => {
            upArrow.classList.remove('hidden');
            downArrow.classList.remove('hidden');
            updateArrows();
            if (timeoutId) { clearTimeout(timeoutId); }
            timeoutId = setTimeout(() => { updateArrows(); }, 3000);
        };
        document.addEventListener('mousemove', showArrows);
        document.addEventListener('scroll', showArrows);
        document.addEventListener('touchstart', showArrows);
    },

    // ============================================================
    // ЗАЯВКИ
    // ============================================================

    async updateTicketsList(archived) {
        const container = document.getElementById('tickets-list-container');
        if (!container) return;
        try {
            const res = await fetch(`/api/tickets?archived=${archived}`);
            let tickets = await res.json();
            const searchKey = archived ? 'ticketsArchived' : 'tickets';
            const searchQuery = this.searchState[searchKey] || '';
            const searchFields = ['employee_info', 'problem_desc', 'location', 'comment', 'urgency', 'executor_name'];
            let filteredTickets = this.searchData(tickets, searchQuery, searchFields);
            const sortKey = archived ? 'ticketsArchived' : 'tickets';
            const sort = this.sortState[sortKey];
            const sortedTickets = this.sortData(filteredTickets, sort.field, sort.order);

            const countEl = document.getElementById('results-count');
            if (countEl) countEl.textContent = `Найдено: ${sortedTickets.length}`;

            if (sortedTickets.length === 0) {
                container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:40px;">По вашему запросу ничего не найдено</p>`;
                return;
            }

            const isSuperAdmin = this.currentUser.role === 'super_admin';

            container.innerHTML = sortedTickets.map(t => {
                const timeClass = t.color_class || this.getTicketTimeClass(t.created_at);
                const comments = t.comments || [];
                let commentsHtml = comments.length > 0 ? `
                    <div class="ticket-comments">
                        <details>
                            <summary>💬 Комментарии (${comments.length})</summary>
                            ${comments.map(c => `
                                <div class="comment-item">
                                    <div class="comment-text">${c.comment_text}</div>
                                    <div class="comment-meta">Админ #${c.admin_id} • ${new Date(c.created_at).toLocaleString('ru-RU')}</div>
                                </div>
                            `).join('')}
                        </details>
                    </div>
                ` : '';

                let deviceHtml = '';
                const hasDeviceInfo = t.ip_address || t.user_agent;
                if (hasDeviceInfo) {
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
                        ${commentsHtml}
                        ${deviceHtml}
                        <div class="meta">
                            ⏱️ Срочность: <b>${t.urgency}</b> | 📅 Создана: ${new Date(t.created_at).toLocaleString('ru-RU')}
                            ${t.completed_at ? ` | ✅ Выполнена: ${new Date(t.completed_at).toLocaleString('ru-RU')}` : ''}
                        </div>
                        ${archived
                            ? `<div class="done">✅ Выполнил: ${t.executor_name}</div>
                               <div class="ticket-actions">
                                   <button class="btn-restore" onclick="app.restoreTicket(${t.id})">↩️ Вернуть в активные</button>
                                   ${isSuperAdmin ? `<button class="btn-delete" onclick="app.deleteTicket(${t.id})">🗑️ Удалить из архива</button>` : `<div class="info-message">🔒 Только главный администратор может удалять из архива</div>`}
                               </div>`
                            : `<div class="ticket-actions">
                                <button class="btn-complete" onclick="app.completeTicket(${t.id})">✅ Отметить выполнение</button>
                                <button class="btn-comment" onclick="app.showCommentModal(${t.id})">💬 Добавить комментарий</button>
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
        const container = document.getElementById('admin-content');
        if (!container) return;
        if (this.searchTimeout) clearTimeout(this.searchTimeout);

        let controlsBar = document.getElementById('controls-bar-tickets');

        if (!controlsBar) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка...</p>';
            try {
                const res = await fetch(`/api/tickets?archived=${archived}`);
                let tickets = await res.json();
                const searchKey = archived ? 'ticketsArchived' : 'tickets';
                const searchQuery = this.searchState[searchKey] || '';
                const searchFields = ['employee_info', 'problem_desc', 'location', 'comment', 'urgency', 'executor_name'];
                let filteredTickets = this.searchData(tickets, searchQuery, searchFields);
                const sortKey = archived ? 'ticketsArchived' : 'tickets';
                const sort = this.sortState[sortKey];
                const sortedTickets = this.sortData(filteredTickets, sort.field, sort.order);

                const isSuperAdmin = this.currentUser.role === 'super_admin';

                let html = `
                    <div class="controls-bar" id="controls-bar-tickets">
                        <div class="search-wrapper">
                            <input type="text" id="search-${searchKey}" placeholder="🔍 Поиск по заявкам..." value="${searchQuery}" 
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
                                <option value="location-asc" ${sort.field === 'location' && sort.order === 'asc' ? 'selected' : ''}>По кабинету (А-Я)</option>
                            </select>
                        </div>
                        <div class="results-count" id="results-count">Найдено: ${sortedTickets.length}</div>
                    </div>
                    <div id="tickets-list-container">
                `;

                if (sortedTickets.length === 0) {
                    html += `<p style="text-align:center;color:var(--text-muted);padding:40px;">${searchQuery ? 'По вашему запросу ничего не найдено' : (archived ? 'Нет выполненных заявок' : 'Нет активных заявок')}</p>`;
                } else {
                    html += sortedTickets.map(t => {
                        const timeClass = t.color_class || this.getTicketTimeClass(t.created_at);
                        const comments = t.comments || [];
                        let commentsHtml = comments.length > 0 ? `
                            <div class="ticket-comments">
                                <details>
                                    <summary>💬 Комментарии (${comments.length})</summary>
                                    ${comments.map(c => `
                                        <div class="comment-item">
                                            <div class="comment-text">${c.comment_text}</div>
                                            <div class="comment-meta">Админ #${c.admin_id} • ${new Date(c.created_at).toLocaleString('ru-RU')}</div>
                                        </div>
                                    `).join('')}
                                </details>
                            </div>
                        ` : '';

                        let deviceHtml = '';
                        const hasDeviceInfo = t.ip_address || t.user_agent;
                        if (hasDeviceInfo) {
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
                                ${commentsHtml}
                                ${deviceHtml}
                                <div class="meta">
                                    ⏱️ Срочность: <b>${t.urgency}</b> | 📅 Создана: ${new Date(t.created_at).toLocaleString('ru-RU')}
                                    ${t.completed_at ? ` | ✅ Выполнена: ${new Date(t.completed_at).toLocaleString('ru-RU')}` : ''}
                                </div>
                                ${archived
                                    ? `<div class="done">✅ Выполнил: ${t.executor_name}</div>
                                       <div class="ticket-actions">
                                           <button class="btn-restore" onclick="app.restoreTicket(${t.id})">↩️ Вернуть в активные</button>
                                           ${isSuperAdmin ? `<button class="btn-delete" onclick="app.deleteTicket(${t.id})">🗑️ Удалить из архива</button>` : `<div class="info-message">🔒 Только главный администратор может удалять из архива</div>`}
                                       </div>`
                                    : `<div class="ticket-actions">
                                        <button class="btn-complete" onclick="app.completeTicket(${t.id})">✅ Отметить выполнение</button>
                                        <button class="btn-comment" onclick="app.showCommentModal(${t.id})">💬 Добавить комментарий</button>
                                       </div>`
                                }
                            </div>
                        `;
                    }).join('');
                }
                html += `</div>`;
                container.innerHTML = html;

                const searchInput = document.getElementById(`search-${searchKey}`);
                if (searchInput) {
                    searchInput.focus();
                    const length = searchInput.value.length;
                    searchInput.setSelectionRange(length, length);
                }
            } catch (err) {
                container.innerHTML = `<p style="color:var(--danger);text-align:center;">Ошибка: ${err.message}</p>`;
            }
        } else {
            await this.updateTicketsList(archived);
            const searchKey = archived ? 'ticketsArchived' : 'tickets';
            const searchInput = document.getElementById(`search-${searchKey}`);
            if (searchInput) {
                searchInput.focus();
                const length = searchInput.value.length;
                searchInput.setSelectionRange(length, length);
            }
        }
    },

    // ============================================================
    // ВОЗВРАТ ЗАЯВКИ ИЗ АРХИВА
    // ============================================================

    async restoreTicket(id) {
        if (!confirm('Вернуть заявку в активные?')) return;
        try {
            const res = await fetch(`/api/tickets/${id}/restore`, { method: 'PUT' });
            if (!res.ok) { const error = await res.json(); throw new Error(error.error || 'Ошибка'); }
            this.loadTickets(true);
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            if (activeTab && activeTab.dataset.tab === 'active') {
                this.loadTickets(false);
            }
            alert('✅ Заявка возвращена в активные');
        } catch (error) { alert('Ошибка: ' + error.message); }
    },

    // ============================================================
    // КОММЕНТАРИИ
    // ============================================================

    showCommentModal(ticketId) {
        if (!this.currentUser.id) { alert('Ошибка: вы не авторизованы'); this.showScreen('screen-login'); return; }
        const modal = document.getElementById('comment-modal');
        if (!modal) return;
        document.getElementById('comment-ticket-id').value = ticketId;
        document.getElementById('comment-textarea').value = '';
        modal.classList.add('active');
    },

    closeCommentModal() {
        const modal = document.getElementById('comment-modal');
        if (modal) modal.classList.remove('active');
    },

    async submitComment() {
        const ticketId = document.getElementById('comment-ticket-id')?.value;
        const commentText = document.getElementById('comment-textarea')?.value.trim();
        if (!commentText) { alert('Введите текст комментария'); return; }
        if (!this.currentUser.id) { alert('Ошибка: вы не авторизованы'); this.showScreen('screen-login'); return; }
        try {
            const res = await fetch(`/api/tickets/${ticketId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment_text: commentText, admin_id: this.currentUser.id })
            });
            if (!res.ok) { const error = await res.json(); throw new Error(error.error || 'Ошибка'); }
            this.closeCommentModal();
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            if (activeTab) { this.switchTab(activeTab.dataset.tab); }
            alert('✅ Комментарий добавлен!');
        } catch (error) { console.error('❌ Comment error:', error); alert('Ошибка: ' + error.message); }
    },

    // ============================================================
    // ЗАВЕРШЕНИЕ ЗАЯВКИ
    // ============================================================

    async completeTicket(id) {
        const executor = prompt('Введите ваше имя (кто выполнил):');
        if (!executor || !executor.trim()) return;
        try {
            const res = await fetch(`/api/tickets/${id}/complete`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ executor_name: executor.trim() })
            });
            if (!res.ok) { const error = await res.json(); throw new Error(error.error || 'Ошибка'); }
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            if (activeTab) { this.switchTab(activeTab.dataset.tab); } else { this.loadTickets(false); }
        } catch (error) { alert('Ошибка: ' + error.message); }
    },

    // ============================================================
    // УДАЛЕНИЕ ЗАЯВКИ
    // ============================================================

    async deleteTicket(id) {
        if (!confirm('⚠️ Удалить заявку из архива навсегда?')) return;
        try {
            const res = await fetch(`/api/tickets/${id}?admin_role=${this.currentUser.role}`, { method: 'DELETE' });
            if (!res.ok) { const error = await res.json(); throw new Error(error.error || 'Ошибка'); }
            this.loadTickets(true);
            alert('✅ Заявка удалена');
        } catch (error) { alert('Ошибка: ' + error.message); }
    },

    // ============================================================
    // ОТПРАВКА ЗАЯВКИ
    // ============================================================

    async submitTicket(e) {
        e.preventDefault();
        const form = e.target;
        const data = {
            problem: document.querySelector('[name="problem"]')?.value || '',
            location: document.querySelector('[name="location"]')?.value || '',
            employee: document.querySelector('[name="employee"]')?.value || '',
            comment: document.querySelector('[name="comment"]')?.value || '',
            urgency: document.querySelector('[name="urgency"]')?.value || 'Средняя'
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
            if (!res.ok) throw new Error(response.error || 'Ошибка отправки');

            this.saveTicketToken(response.trackingToken);
            form.reset();

            if (this.fromAdmin) {
                this.showScreen('screen-admin');
                const activeTab = document.querySelector('.nav-btn.active[data-tab]');
                if (activeTab) {
                    this.switchTab(activeTab.dataset.tab);
                }
                alert(`✅ Заявка #${response.ticketId} создана! Токен: ${response.trackingToken}`);
                this.fromAdmin = false;
                return;
            }

            alert(
                `✅ Заявка #${response.ticketId} создана!\n\n` +
                `🔑 Ваш токен для отслеживания: ${response.trackingToken}\n\n` +
                `Пример: AB12, CD34, XY56\n` +
                `Токен автоматически сохранен в "Моих заявках".`
            );

            if (confirm('Перейти к моим заявкам?')) {
                this.showScreen('screen-track-tickets');
                this.loadTrackedTickets();
            } else {
                this.showScreen('screen-login');
            }
        } catch (err) {
            console.error('❌ Ошибка:', err);
            alert('Ошибка: ' + err.message);
        } finally {
            if (btn) { btn.textContent = 'Отправить'; btn.disabled = false; }
        }
    },

    // ============================================================
    // ЗАДАЧИ
    // ============================================================

    async updateTasksList(archived) {
        const container = document.getElementById('tasks-list-container');
        if (!container) return;
        try {
            const url = archived ? '/api/tasks/archive' : '/api/tasks';
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
            let tasks = await res.json();

            const searchKey = archived ? 'tasksArchived' : 'tasks';
            const searchQuery = this.searchState[searchKey] || '';
            const searchFields = ['title', 'description', 'assigned_to_name', 'created_by_name', 'completed_by_name', 'priority', 'status'];
            let filteredTasks = this.searchData(tasks, searchQuery, searchFields);
            const sortKey = archived ? 'tasksArchived' : 'tasks';
            const sort = this.sortState[sortKey];
            const sortedTasks = this.sortData(filteredTasks, sort.field, sort.order);

            const statusLabels = { 'pending': '⏳ Ожидает', 'in_progress': '🔄 В работе', 'completed': '✅ Выполнено' };
            const priorityLabels = { 'low': '🟢 Низкий', 'medium': '🟡 Средний', 'high': '🔴 Высокий' };
            const priorityColors = { 'low': '#48bb78', 'medium': '#ecc94b', 'high': '#f56565' };

            const isSuperAdmin = this.currentUser.role === 'super_admin';
            const currentAdminId = this.currentUser.id;

            const countEl = document.getElementById('results-count-tasks');
            if (countEl) countEl.textContent = `Найдено: ${sortedTasks.length}`;

            if (sortedTasks.length === 0) {
                container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:40px;">${searchQuery ? 'По вашему запросу ничего не найдено' : (archived ? 'Нет выполненных задач' : 'Нет активных задач')}</p>`;
                return;
            }

            container.innerHTML = `
                <div class="tasks-grid">
                    ${sortedTasks.map(task => {
                        const canComplete = task.status !== 'completed' && (task.assigned_to === currentAdminId || !task.assigned_to);
                        return `
                            <div class="task-card" style="border-left: 3px solid ${priorityColors[task.priority] || '#4a9eff'}">
                                <div class="task-header">
                                    <h3 class="task-title">${task.title}</h3>
                                    <span class="task-status ${task.status}">${statusLabels[task.status] || task.status}</span>
                                </div>
                                ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                                <div class="task-meta">
                                    <div>👤 Назначена: ${task.assigned_to_name || 'Не назначена'}</div>
                                    <div>📅 Создана: ${new Date(task.created_at).toLocaleDateString('ru-RU')}</div>
                                    ${task.due_date ? `<div>⏰ Срок: ${new Date(task.due_date).toLocaleDateString('ru-RU')}</div>` : ''}
                                    ${task.completed_by_name ? `<div>✅ Выполнил: ${task.completed_by_name} (${new Date(task.completed_at).toLocaleString('ru-RU')})</div>` : ''}
                                    <div>🏷️ Приоритет: ${priorityLabels[task.priority] || task.priority}</div>
                                </div>
                                <div class="task-actions">
                                    ${!archived ? `
                                        ${task.status !== 'completed' && canComplete ? `
                                            ${task.status === 'pending' ? `<button class="btn-complete" onclick="app.updateTaskStatus(${task.id}, 'in_progress', ${currentAdminId})">🔄 Взять в работу</button>` : ''}
                                            ${task.status === 'in_progress' ? `<button class="btn-complete" onclick="app.updateTaskStatus(${task.id}, 'completed', ${currentAdminId})">✅ Завершить</button>` : ''}
                                            ${task.status === 'pending' ? `<button class="btn-complete" onclick="app.updateTaskStatus(${task.id}, 'completed', ${currentAdminId})">✅ Завершить</button>` : ''}
                                        ` : ''}
                                        ${task.status === 'completed' && isSuperAdmin ? `<button class="btn-reopen" onclick="app.updateTaskStatus(${task.id}, 'pending', ${currentAdminId})">🔄 Переоткрыть</button>` : ''}
                                        ${isSuperAdmin ? `
                                            <button class="btn-edit-task" onclick="app.showEditTaskModal(${task.id})">✏️ Редактировать</button>
                                            <button class="btn-delete" onclick="app.deleteTask(${task.id})">🗑️ Удалить</button>
                                        ` : ''}
                                    ` : `
                                        <span style="color:#33dd88; font-weight:600;">✅ Выполнено</span>
                                        ${isSuperAdmin ? `
                                            <button class="btn-reopen" onclick="app.updateTaskStatus(${task.id}, 'pending', ${currentAdminId})">🔄 Переоткрыть</button>
                                            <button class="btn-delete" onclick="app.deleteTask(${task.id})">🗑️ Удалить</button>
                                        ` : ''}
                                    `}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (err) {
            container.innerHTML = `<p style="color:var(--danger);text-align:center;">Ошибка: ${err.message}</p>`;
        }
    },

    async loadTasks(archived = false) {
        const container = document.getElementById('admin-content');
        if (!container) return;
        if (this.searchTimeout) clearTimeout(this.searchTimeout);

        let controlsBar = document.getElementById('controls-bar-tasks');

        if (!controlsBar) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка...</p>';
            try {
                const url = archived ? '/api/tasks/archive' : '/api/tasks';
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
                let tasks = await res.json();

                const searchKey = archived ? 'tasksArchived' : 'tasks';
                const searchQuery = this.searchState[searchKey] || '';
                const searchFields = ['title', 'description', 'assigned_to_name', 'created_by_name', 'completed_by_name', 'priority', 'status'];
                let filteredTasks = this.searchData(tasks, searchQuery, searchFields);
                const sortKey = archived ? 'tasksArchived' : 'tasks';
                const sort = this.sortState[sortKey];
                const sortedTasks = this.sortData(filteredTasks, sort.field, sort.order);

                const statusLabels = { 'pending': '⏳ Ожидает', 'in_progress': '🔄 В работе', 'completed': '✅ Выполнено' };
                const priorityLabels = { 'low': '🟢 Низкий', 'medium': '🟡 Средний', 'high': '🔴 Высокий' };
                const priorityColors = { 'low': '#48bb78', 'medium': '#ecc94b', 'high': '#f56565' };

                const isSuperAdmin = this.currentUser.role === 'super_admin';
                const currentAdminId = this.currentUser.id;

                let html = `
                    <div class="controls-bar" id="controls-bar-tasks">
                        <div class="search-wrapper">
                            <input type="text" id="search-${searchKey}" placeholder="🔍 Поиск по задачам..." value="${searchQuery}" 
                                   oninput="app.handleSearch('${searchKey}', this.value, 'tasks', ${archived})"
                                   onkeydown="app.handleSearchEnter(event, '${searchKey}', 'tasks', ${archived})" autofocus>
                            ${searchQuery ? `<button class="clear-search" onclick="app.clearSearch('${searchKey}', 'tasks', ${archived})">✕</button>` : ''}
                        </div>
                        <div class="sort-wrapper">
                            <span>Сортировка:</span>
                            <select onchange="app.sortState['${sortKey}'] = {field: this.value.split('-')[0], order: this.value.split('-')[1]}; app.loadTasks(${archived})">
                                <option value="created_at-desc" ${sort.field === 'created_at' && sort.order === 'desc' ? 'selected' : ''}>По дате (новые)</option>
                                <option value="created_at-asc" ${sort.field === 'created_at' && sort.order === 'asc' ? 'selected' : ''}>По дате (старые)</option>
                                <option value="due_date-asc" ${sort.field === 'due_date' && sort.order === 'asc' ? 'selected' : ''}>По сроку (ближайшие)</option>
                                <option value="priority-desc" ${sort.field === 'priority' && sort.order === 'desc' ? 'selected' : ''}>По приоритету (высокий)</option>
                                <option value="title-asc" ${sort.field === 'title' && sort.order === 'asc' ? 'selected' : ''}>По названию (А-Я)</option>
                                ${archived ? `
                                    <option value="completed_at-desc" ${sort.field === 'completed_at' && sort.order === 'desc' ? 'selected' : ''}>По дате выполнения (новые)</option>
                                    <option value="completed_at-asc" ${sort.field === 'completed_at' && sort.order === 'asc' ? 'selected' : ''}>По дате выполнения (старые)</option>
                                ` : ''}
                            </select>
                        </div>
                        <div class="results-count" id="results-count-tasks">Найдено: ${sortedTasks.length}</div>
                        ${!archived && isSuperAdmin ? `<button class="btn-add-inventory" onclick="app.showCreateTaskModal()" style="margin:0;">➕ Создать</button>` : ''}
                    </div>
                    <div id="tasks-list-container">
                `;

                if (sortedTasks.length === 0) {
                    html += `<p style="text-align:center;color:var(--text-muted);padding:40px;">${searchQuery ? 'По вашему запросу ничего не найдено' : (archived ? 'Нет выполненных задач' : 'Нет активных задач')}</p>`;
                } else {
                    html += `
                        <div class="tasks-grid">
                            ${sortedTasks.map(task => {
                                const canComplete = task.status !== 'completed' && (task.assigned_to === currentAdminId || !task.assigned_to);
                                return `
                                    <div class="task-card" style="border-left: 3px solid ${priorityColors[task.priority] || '#4a9eff'}">
                                        <div class="task-header">
                                            <h3 class="task-title">${task.title}</h3>
                                            <span class="task-status ${task.status}">${statusLabels[task.status] || task.status}</span>
                                        </div>
                                        ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                                        <div class="task-meta">
                                            <div>👤 Назначена: ${task.assigned_to_name || 'Не назначена'}</div>
                                            <div>📅 Создана: ${new Date(task.created_at).toLocaleDateString('ru-RU')}</div>
                                            ${task.due_date ? `<div>⏰ Срок: ${new Date(task.due_date).toLocaleDateString('ru-RU')}</div>` : ''}
                                            ${task.completed_by_name ? `<div>✅ Выполнил: ${task.completed_by_name} (${new Date(task.completed_at).toLocaleString('ru-RU')})</div>` : ''}
                                            <div>🏷️ Приоритет: ${priorityLabels[task.priority] || task.priority}</div>
                                        </div>
                                        <div class="task-actions">
                                            ${!archived ? `
                                                ${task.status !== 'completed' && canComplete ? `
                                                    ${task.status === 'pending' ? `<button class="btn-complete" onclick="app.updateTaskStatus(${task.id}, 'in_progress', ${currentAdminId})">🔄 Взять в работу</button>` : ''}
                                                    ${task.status === 'in_progress' ? `<button class="btn-complete" onclick="app.updateTaskStatus(${task.id}, 'completed', ${currentAdminId})">✅ Завершить</button>` : ''}
                                                    ${task.status === 'pending' ? `<button class="btn-complete" onclick="app.updateTaskStatus(${task.id}, 'completed', ${currentAdminId})">✅ Завершить</button>` : ''}
                                                ` : ''}
                                                ${task.status === 'completed' && isSuperAdmin ? `<button class="btn-reopen" onclick="app.updateTaskStatus(${task.id}, 'pending', ${currentAdminId})">🔄 Переоткрыть</button>` : ''}
                                                ${isSuperAdmin ? `
                                                    <button class="btn-edit-task" onclick="app.showEditTaskModal(${task.id})">✏️ Редактировать</button>
                                                    <button class="btn-delete" onclick="app.deleteTask(${task.id})">🗑️ Удалить</button>
                                                ` : ''}
                                            ` : `
                                                <span style="color:#33dd88; font-weight:600;">✅ Выполнено</span>
                                                ${isSuperAdmin ? `
                                                    <button class="btn-reopen" onclick="app.updateTaskStatus(${task.id}, 'pending', ${currentAdminId})">🔄 Переоткрыть</button>
                                                    <button class="btn-delete" onclick="app.deleteTask(${task.id})">🗑️ Удалить</button>
                                                ` : ''}
                                            `}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                }
                html += `</div>`;
                container.innerHTML = html;

                const searchInput = document.getElementById(`search-${searchKey}`);
                if (searchInput) {
                    searchInput.focus();
                    const length = searchInput.value.length;
                    searchInput.setSelectionRange(length, length);
                }
            } catch (err) {
                console.error('❌ Ошибка загрузки задач:', err);
                container.innerHTML = `
                    <p style="color:var(--danger);text-align:center;">Ошибка загрузки: ${err.message}</p>
                    <div style="text-align:center; margin-top: 10px;">
                        <button class="btn-complete" onclick="app.loadTasks(${archived})">🔄 Попробовать снова</button>
                    </div>
                `;
            }
        } else {
            await this.updateTasksList(archived);
            const searchKey = archived ? 'tasksArchived' : 'tasks';
            const searchInput = document.getElementById(`search-${searchKey}`);
            if (searchInput) {
                searchInput.focus();
                const length = searchInput.value.length;
                searchInput.setSelectionRange(length, length);
            }
        }
    },

    async loadAdmins() {
        try {
            const res = await fetch('/api/admins');
            return await res.json();
        } catch (err) { return []; }
    },

    // ============================================================
    // ЗАДАЧИ - МОДАЛКИ
    // ============================================================

    async showCreateTaskModal() {
        if (this.currentUser.role !== 'super_admin') { alert('Только главный администратор может создавать задачи'); return; }
        const admins = await this.loadAdmins();
        const modal = document.getElementById('task-modal');
        const form = document.getElementById('task-form');
        if (!modal || !form) return;
        document.getElementById('modal-title').textContent = '📋 Создать задачу';

        const selectHtml = admins.map(a => `<option value="${a.id}">${a.login_id} ${a.role === 'super_admin' ? '👑' : ''}</option>`).join('');
        form.innerHTML = `
            <div class="form-group"><label>Название задачи *</label><input type="text" id="task-title" required placeholder="Введите название задачи"></div>
            <div class="form-group"><label>Описание</label><textarea id="task-description" rows="3" placeholder="Подробное описание задачи"></textarea></div>
            <div class="form-group"><label>Назначить</label><select id="task-assigned-to"><option value="">Не назначено</option>${selectHtml}</select></div>
            <div class="form-group"><label>Приоритет</label><select id="task-priority"><option value="low">🟢 Низкий</option><option value="medium" selected>🟡 Средний</option><option value="high">🔴 Высокий</option></select></div>
            <div class="form-group"><label>Срок выполнения</label><input type="date" id="task-due-date"></div>
            <div class="modal-buttons"><button type="button" class="btn-save" onclick="app.createTask()">💾 Создать</button><button type="button" class="btn-cancel" onclick="app.closeTaskModal()">❌ Отмена</button></div>
        `;
        modal.classList.add('active');
    },

    async showEditTaskModal(taskId) {
        if (this.currentUser.role !== 'super_admin') { alert('Только главный администратор может редактировать задачи'); return; }
        try {
            const res = await fetch('/api/tasks');
            const tasks = await res.json();
            const task = tasks.find(t => t.id === taskId);
            if (!task) { alert('Задача не найдена'); return; }
            const admins = await this.loadAdmins();
            const modal = document.getElementById('task-modal');
            const form = document.getElementById('task-form');
            if (!modal || !form) return;
            document.getElementById('modal-title').textContent = '✏️ Редактировать задачу';

            const selectHtml = admins.map(a => `<option value="${a.id}" ${task.assigned_to === a.id ? 'selected' : ''}>${a.login_id} ${a.role === 'super_admin' ? '👑' : ''}</option>`).join('');
            form.innerHTML = `
                <input type="hidden" id="task-edit-id" value="${task.id}">
                <div class="form-group"><label>Название задачи *</label><input type="text" id="task-edit-title" value="${task.title}" required></div>
                <div class="form-group"><label>Описание</label><textarea id="task-edit-description" rows="3">${task.description || ''}</textarea></div>
                <div class="form-group"><label>Назначить</label><select id="task-edit-assigned-to"><option value="">Не назначено</option>${selectHtml}</select></div>
                <div class="form-group"><label>Приоритет</label><select id="task-edit-priority"><option value="low" ${task.priority === 'low' ? 'selected' : ''}>🟢 Низкий</option><option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>🟡 Средний</option><option value="high" ${task.priority === 'high' ? 'selected' : ''}>🔴 Высокий</option></select></div>
                <div class="form-group"><label>Срок выполнения</label><input type="date" id="task-edit-due-date" value="${task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : ''}"></div>
                <div class="modal-buttons"><button type="button" class="btn-save" onclick="app.editTask()">💾 Сохранить</button><button type="button" class="btn-cancel" onclick="app.closeTaskModal()">❌ Отмена</button></div>
            `;
            modal.classList.add('active');
        } catch (error) { console.error('❌ Ошибка загрузки задачи для редактирования:', error); alert('Ошибка: ' + error.message); }
    },

    closeTaskModal() {
        const modal = document.getElementById('task-modal');
        if (modal) modal.classList.remove('active');
    },

    async createTask() {
        const title = document.getElementById('task-title')?.value.trim();
        const description = document.getElementById('task-description')?.value.trim();
        const assigned_to = document.getElementById('task-assigned-to')?.value;
        const priority = document.getElementById('task-priority')?.value;
        const due_date = document.getElementById('task-due-date')?.value;
        if (!title) { alert('Введите название задачи'); return; }
        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description: description || null, assigned_to: assigned_to || null, priority, due_date: due_date || null, created_by: this.currentUser.id })
            });
            if (!res.ok) { const error = await res.json(); throw new Error(error.error || 'Ошибка создания задачи'); }
            this.closeTaskModal();
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            if (activeTab && activeTab.dataset.tab === 'tasks') {
                this.loadTasks(false);
            } else {
                this.loadTasks(false);
            }
            alert('✅ Задача создана!');
        } catch (error) { console.error('❌ Ошибка создания задачи:', error); alert('Ошибка: ' + error.message); }
    },

    async editTask() {
        const taskId = document.getElementById('task-edit-id')?.value;
        const title = document.getElementById('task-edit-title')?.value.trim();
        const description = document.getElementById('task-edit-description')?.value.trim();
        const assigned_to = document.getElementById('task-edit-assigned-to')?.value;
        const priority = document.getElementById('task-edit-priority')?.value;
        const due_date = document.getElementById('task-edit-due-date')?.value;
        if (!title) { alert('Введите название задачи'); return; }
        try {
            const res = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description: description || null, assigned_to: assigned_to || null, priority, due_date: due_date || null, admin_id: this.currentUser.id })
            });
            if (!res.ok) { const error = await res.json(); throw new Error(error.error || 'Ошибка редактирования задачи'); }
            this.closeTaskModal();
            this.loadTasks(false);
            alert('✅ Задача обновлена!');
        } catch (error) { console.error('❌ Ошибка редактирования задачи:', error); alert('Ошибка: ' + error.message); }
    },

    async updateTaskStatus(taskId, status, adminId) {
        try {
            const res = await fetch(`/api/tasks/${taskId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, admin_id: adminId })
            });
            if (!res.ok) { const error = await res.json(); throw new Error(error.error || 'Ошибка обновления статуса'); }
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            const isArchive = activeTab?.dataset.tab === 'tasks-archive';
            this.loadTasks(isArchive);
            alert('✅ Статус задачи обновлен!');
        } catch (error) { console.error('❌ Ошибка обновления статуса:', error); alert('Ошибка: ' + error.message); }
    },

    async deleteTask(taskId) {
        if (!confirm('⚠️ Удалить задачу навсегда?')) return;
        try {
            const res = await fetch(`/api/tasks/${taskId}?admin_role=${this.currentUser.role}`, { method: 'DELETE' });
            if (!res.ok) { const error = await res.json(); throw new Error(error.error || 'Ошибка удаления'); }
            const activeTab = document.querySelector('.nav-btn.active[data-tab]');
            const isArchive = activeTab?.dataset.tab === 'tasks-archive';
            this.loadTasks(isArchive);
            alert('✅ Задача удалена');
        } catch (error) { console.error('❌ Ошибка удаления задачи:', error); alert('Ошибка: ' + error.message); }
    },

    // ============================================================
    // IP СТАТИСТИКА
    // ============================================================

    async loadIPStats() {
        const container = document.getElementById('admin-content');
        if (!container) return;
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка статистики...</p>';
        try {
            const res = await fetch('/api/ip-stats');
            const stats = await res.json();
            if (!stats.length) {
                container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">Нет данных об IP-адресах</p>';
                return;
            }
            container.innerHTML = `
                <h3 style="margin-bottom:20px;color:var(--text-primary);">📊 Статистика по IP-адресам</h3>
                <table class="inv-table">
                    <tr>
                        <th>IP-адрес</th>
                        <th>Заявок</th>
                        <th>Устройства</th>
                        <th>Первый визит</th>
                        <th>Последний визит</th>
                    </tr>
                    ${stats.map(s => {
                        let deviceDisplay = '—';
                        if (s.user_agents && s.user_agents.length > 0) {
                            const uniqueAgents = [...new Set(s.user_agents)];
                            deviceDisplay = uniqueAgents.map(ua => {
                                const formatted = this.formatUserAgent(ua);
                                return `<div class="device-tag" title="${ua}">${formatted}</div>`;
                            }).join('');
                        }
                        return `
                            <tr>
                                <td><span class="ip-address">${s.ip_address}</span></td>
                                <td><strong>${s.total_requests}</strong></td>
                                <td class="device-cell">${deviceDisplay}</td>
                                <td>${new Date(s.first_request).toLocaleString('ru-RU')}</td>
                                <td>${new Date(s.last_request).toLocaleString('ru-RU')}</td>
                            </tr>
                        `;
                    }).join('')}
                </table>
            `;
        } catch (err) {
            container.innerHTML = `<p style="color:var(--danger);text-align:center;">Ошибка: ${err.message}</p>`;
        }
    },

    // ============================================================
    // ИНВЕНТАРЬ
    // ============================================================

    async updateInventoryList() {
        const container = document.getElementById('inventory-sections-container');
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

            const filteredData = {
                laptops: this.searchData(laptops, searchQuery, searchFields.laptops),
                computers: this.searchData(computers, searchQuery, searchFields.computers),
                printers: this.searchData(printers, searchQuery, searchFields.printers)
            };

            const totalCount = filteredData.laptops.length + filteredData.computers.length + filteredData.printers.length;

            const countEl = document.getElementById('results-count-inventory');
            if (countEl) countEl.textContent = `Найдено: ${totalCount}`;

            const renderSection = (title, type, data, columns, addText = 'Добавить') => {
                if (!data || data.length === 0) {
                    return `
                        <details class="inventory-section" open>
                            <summary class="section-header"><span>${title} (0)</span><button class="btn-add-inventory" onclick="app.openInventoryModal('${type}', null, '${type}')">➕ ${addText}</button></summary>
                            <p style="color:var(--text-muted);padding:40px;text-align:center;font-size:16px;">Нет записей</p>
                        </details>
                    `;
                }
                return `
                    <details class="inventory-section" open>
                        <summary class="section-header"><span>${title} (${data.length})</span><button class="btn-add-inventory" onclick="app.openInventoryModal('${type}', null, '${type}')">➕ ${addText}</button></summary>
                        <div class="table-wrapper" id="wrapper-${type}">
                            <table class="inv-table" id="table-${type}">
                                <thead><tr>${columns.map((c, i) => `<th data-col="${i}" style="width: ${c.width || 'auto'}">${c.label}<span class="resizer" data-col="${i}"></span></th>`).join('')}<th style="width: 120px; min-width: 90px;">Действия</th></tr></thead>
                                <tbody>${data.map(row => `
                                    <tr>${columns.map(c => `<td title="${row[c.key] || ''}">${row[c.key] || '—'}</td>`).join('')}
                                    <td class="action-buttons">
                                        <button class="btn-edit" onclick='app.openInventoryModal("${type}", ${JSON.stringify(row).replace(/'/g, "&#39;")}, "${type}")'>✏️</button>
                                        <button class="btn-delete-inv" onclick="app.deleteInventoryItem('${type}', ${row.id})">🗑️</button>
                                    </td></tr>
                                `).join('')}</tbody>
                            </table>
                        </div>
                    </details>
                `;
            };

            container.innerHTML = `
                ${renderSection('💻 Ноутбуки', 'laptops', filteredData.laptops, [
                    { key: 'inventory_number', label: 'Инв. №', width: '120px' },
                    { key: 'responsible', label: 'Ответственный', width: '180px' },
                    { key: 'location', label: 'Расположение', width: '220px' },
                    { key: 'cpu', label: 'CPU', width: '240px' },
                    { key: 'ram', label: 'RAM', width: '100px' },
                    { key: 'storage', label: 'Накопитель', width: '180px' },
                    { key: 'windows_version', label: 'ОС', width: '100px' },
                    { key: 'ip_lan', label: 'IP', width: '150px' },
                    { key: 'mac', label: 'MAC', width: '200px' }
                ])}
                ${renderSection('🖥️ Стационарные ПК', 'computers', filteredData.computers, [
                    { key: 'inventory_number', label: 'Инв. №', width: '120px' },
                    { key: 'responsible', label: 'Ответственный', width: '180px' },
                    { key: 'location', label: 'Расположение', width: '220px' },
                    { key: 'cpu', label: 'CPU', width: '240px' },
                    { key: 'ram', label: 'RAM', width: '100px' },
                    { key: 'storage', label: 'Накопитель', width: '180px' },
                    { key: 'windows_version', label: 'ОС', width: '100px' },
                    { key: 'ip_lan', label: 'IP', width: '150px' },
                    { key: 'mac', label: 'MAC', width: '200px' }
                ])}
                ${renderSection('🖨️ Принтеры', 'printers', filteredData.printers, [
                    { key: 'inventory_number', label: 'Инв. №', width: '120px' },
                    { key: 'model', label: 'Модель', width: '220px' },
                    { key: 'cartridge', label: 'Картридж', width: '200px' },
                    { key: 'location', label: 'Расположение', width: '220px' },
                    { key: 'ip', label: 'IP', width: '150px' },
                    { key: 'comment', label: 'Примечание', width: '220px' }
                ])}
            `;
            setTimeout(() => this.initResizers(), 100);
        } catch (err) {
            container.innerHTML = `<p style="color:var(--danger);text-align:center;font-size:16px;">Ошибка загрузки: ${err.message}</p>`;
        }
    },

    async loadInventory() {
        const container = document.getElementById('admin-content');
        if (!container) return;
        if (this.searchTimeout) clearTimeout(this.searchTimeout);

        let controlsBar = document.getElementById('controls-bar-inventory');

        if (!controlsBar) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Загрузка инвентаря...</p>';
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

                const filteredData = {
                    laptops: this.searchData(laptops, searchQuery, searchFields.laptops),
                    computers: this.searchData(computers, searchQuery, searchFields.computers),
                    printers: this.searchData(printers, searchQuery, searchFields.printers)
                };

                const totalCount = filteredData.laptops.length + filteredData.computers.length + filteredData.printers.length;

                const renderSection = (title, type, data, columns, addText = 'Добавить') => {
                    if (!data || data.length === 0) {
                        return `
                            <details class="inventory-section" open>
                                <summary class="section-header"><span>${title} (0)</span><button class="btn-add-inventory" onclick="app.openInventoryModal('${type}', null, '${type}')">➕ ${addText}</button></summary>
                                <p style="color:var(--text-muted);padding:40px;text-align:center;font-size:16px;">Нет записей</p>
                            </details>
                        `;
                    }
                    return `
                        <details class="inventory-section" open>
                            <summary class="section-header"><span>${title} (${data.length})</span><button class="btn-add-inventory" onclick="app.openInventoryModal('${type}', null, '${type}')">➕ ${addText}</button></summary>
                            <div class="table-wrapper" id="wrapper-${type}">
                                <table class="inv-table" id="table-${type}">
                                    <thead><tr>${columns.map((c, i) => `<th data-col="${i}" style="width: ${c.width || 'auto'}">${c.label}<span class="resizer" data-col="${i}"></span></th>`).join('')}<th style="width: 120px; min-width: 90px;">Действия</th></tr></thead>
                                    <tbody>${data.map(row => `
                                        <tr>${columns.map(c => `<td title="${row[c.key] || ''}">${row[c.key] || '—'}</td>`).join('')}
                                        <td class="action-buttons">
                                            <button class="btn-edit" onclick='app.openInventoryModal("${type}", ${JSON.stringify(row).replace(/'/g, "&#39;")}, "${type}")'>✏️</button>
                                            <button class="btn-delete-inv" onclick="app.deleteInventoryItem('${type}', ${row.id})">🗑️</button>
                                        </td></tr>
                                    `).join('')}</tbody>
                                </table>
                            </div>
                        </details>
                    `;
                };

                let html = `
                    <div class="controls-bar" id="controls-bar-inventory">
                        <div class="search-wrapper" style="flex:1;">
                            <input type="text" id="search-inventory" placeholder="🔍 Поиск по всему инвентарю..." value="${searchQuery}" 
                                   oninput="app.handleSearch('inventory', this.value, 'inventory')"
                                   onkeydown="app.handleSearchEnter(event, 'inventory', 'inventory')" autofocus>
                            ${searchQuery ? `<button class="clear-search" onclick="app.clearSearch('inventory', 'inventory')">✕</button>` : ''}
                        </div>
                        <div class="results-count" id="results-count-inventory">Найдено: ${totalCount}</div>
                    </div>
                    <div id="inventory-sections-container">
                `;

                if (totalCount === 0 && searchQuery) {
                    html += `<p style="text-align:center;color:var(--text-muted);padding:40px;font-size:16px;">По вашему запросу ничего не найдено</p>`;
                } else {
                    html += `
                        ${renderSection('💻 Ноутбуки', 'laptops', filteredData.laptops, [
                            { key: 'inventory_number', label: 'Инв. №', width: '120px' },
                            { key: 'responsible', label: 'Ответственный', width: '180px' },
                            { key: 'location', label: 'Расположение', width: '220px' },
                            { key: 'cpu', label: 'CPU', width: '240px' },
                            { key: 'ram', label: 'RAM', width: '100px' },
                            { key: 'storage', label: 'Накопитель', width: '180px' },
                            { key: 'windows_version', label: 'ОС', width: '100px' },
                            { key: 'ip_lan', label: 'IP', width: '150px' },
                            { key: 'mac', label: 'MAC', width: '200px' }
                        ])}
                        ${renderSection('🖥️ Стационарные ПК', 'computers', filteredData.computers, [
                            { key: 'inventory_number', label: 'Инв. №', width: '120px' },
                            { key: 'responsible', label: 'Ответственный', width: '180px' },
                            { key: 'location', label: 'Расположение', width: '220px' },
                            { key: 'cpu', label: 'CPU', width: '240px' },
                            { key: 'ram', label: 'RAM', width: '100px' },
                            { key: 'storage', label: 'Накопитель', width: '180px' },
                            { key: 'windows_version', label: 'ОС', width: '100px' },
                            { key: 'ip_lan', label: 'IP', width: '150px' },
                            { key: 'mac', label: 'MAC', width: '200px' }
                        ])}
                        ${renderSection('🖨️ Принтеры', 'printers', filteredData.printers, [
                            { key: 'inventory_number', label: 'Инв. №', width: '120px' },
                            { key: 'model', label: 'Модель', width: '220px' },
                            { key: 'cartridge', label: 'Картридж', width: '200px' },
                            { key: 'location', label: 'Расположение', width: '220px' },
                            { key: 'ip', label: 'IP', width: '150px' },
                            { key: 'comment', label: 'Примечание', width: '220px' }
                        ])}
                    `;
                }
                html += `</div>`;
                container.innerHTML = html;

                const searchInput = document.getElementById('search-inventory');
                if (searchInput) {
                    searchInput.focus();
                    const length = searchInput.value.length;
                    searchInput.setSelectionRange(length, length);
                }
                setTimeout(() => this.initResizers(), 100);
            } catch (err) {
                container.innerHTML = `<p style="color:var(--danger);text-align:center;font-size:16px;">Ошибка загрузки: ${err.message}</p>`;
            }
        } else {
            await this.updateInventoryList();
            const searchInput = document.getElementById('search-inventory');
            if (searchInput) {
                searchInput.focus();
                const length = searchInput.value.length;
                searchInput.setSelectionRange(length, length);
            }
        }
    },

    // ============================================================
    // ИНВЕНТАРЬ - МОДАЛКИ
    // ============================================================

    openInventoryModal(type, item = null, sectionType = null) {
        const modal = document.getElementById('inventory-modal');
        const form = document.getElementById('inventory-form');
        const title = document.getElementById('modal-title');
        const actualType = sectionType || type;
        form.dataset.type = actualType;
        form.dataset.id = item ? item.id : '';
        title.textContent = item ? '✏️ Редактировать запись' : '➕ Добавить запись';

        let fields = [];
        if (actualType === 'laptops' || actualType === 'computers') {
            fields = [
                { key: 'inventory_number', label: 'Инвентарный номер', value: item?.inventory_number || '' },
                { key: 'responsible', label: 'Ответственный', value: item?.responsible || '' },
                { key: 'location', label: 'Расположение', value: item?.location || '' },
                { key: 'cpu', label: 'Процессор (CPU)', value: item?.cpu || '' },
                { key: 'ram', label: 'Оперативная память (RAM)', value: item?.ram || '' },
                { key: 'storage', label: 'Накопитель', value: item?.storage || '' },
                { key: 'windows_version', label: 'Версия ОС', value: item?.windows_version || '' },
                { key: 'ip_inet', label: 'IP (Интернет)', value: item?.ip_inet || '' },
                { key: 'ip_lan', label: 'IP (Локальная сеть)', value: item?.ip_lan || '' },
                { key: 'mac', label: 'MAC-адрес', value: item?.mac || '' },
                { key: 'name', label: 'Имя в сети', value: item?.name || '' },
                { key: 'manufacturer', label: 'Производитель', value: item?.manufacturer || '' }
            ];
        } else if (actualType === 'printers') {
            fields = [
                { key: 'inventory_number', label: 'Инвентарный номер', value: item?.inventory_number || '' },
                { key: 'model', label: 'Модель', value: item?.model || '' },
                { key: 'cartridge', label: 'Картридж', value: item?.cartridge || '' },
                { key: 'location', label: 'Расположение', value: item?.location || '' },
                { key: 'ip', label: 'IP-адрес', value: item?.ip || '' },
                { key: 'comment', label: 'Примечание', value: item?.comment || '' }
            ];
        }

        let html = fields.map(f => `
            <div class="form-group">
                <label>${f.label}</label>
                <input type="text" name="${f.key}" value="${f.value || ''}">
            </div>
        `).join('');

        html += `
            <div class="modal-buttons">
                <button type="submit" class="btn-save">💾 Сохранить</button>
                <button type="button" class="btn-cancel" onclick="app.closeInventoryModal()">❌ Отмена</button>
            </div>
        `;
        form.innerHTML = html;
        modal.classList.add('active');
    },

    closeInventoryModal() {
        const modal = document.getElementById('inventory-modal');
        if (modal) modal.classList.remove('active');
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
            if (!res.ok) { const error = await res.json(); throw new Error(error.error || 'Ошибка сохранения'); }
            this.closeInventoryModal();
            this.loadInventory();
            alert('✅ Запись сохранена!');
        } catch (err) { console.error('❌ Ошибка сохранения:', err); alert('Ошибка: ' + err.message); }
    },

    async deleteInventoryItem(type, id) {
        if (!confirm('Вы уверены, что хотите удалить эту запись?')) return;
        try {
            const res = await fetch(`/api/inventory/${type}/${id}`, { method: 'DELETE' });
            if (!res.ok) { const error = await res.json(); throw new Error(error.error || 'Ошибка удаления'); }
            this.loadInventory();
            alert('✅ Запись удалена');
        } catch (err) { console.error('❌ Ошибка удаления:', err); alert('Ошибка: ' + err.message); }
    },

    // ============================================================
    // РЕСАЙЗЕРЫ
    // ============================================================

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
    }
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

console.log('🚀 IT Portal загружен');
console.log('🔑 Для входа администратора нажмите S+K');
console.log('🔑 Токен: 2 буквы + 2 цифры (например: AB12)');

// Инициализируем обработчик клавиш
app.initKeyboardShortcuts();

// Инициализируем стрелки навигации
app.initNavArrows();

// Инициализируем ресайзеры
setTimeout(() => {
    app.initResizers();
}, 500);