// This file is loaded after the legacy portal. Inventory data is always rendered as text.
(() => {
    const oldSwitch = app.switchTab.bind(app);
    app.switchTab = function(tab) {
        document.getElementById('cartridges-container')?.remove();
        if (tab !== 'cartridges') return oldSwitch(tab);
        this.activeTab = tab;
        document.getElementById('page-name').textContent = 'Картриджи';
        document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.getElementById('admin-content').replaceChildren();
        const root = document.createElement('section');
        root.id = 'cartridges-container'; root.className = 'stock-page';
        document.getElementById('admin-content').append(root);
        render(root);
    };
    const oldLogout = app.logout.bind(app);
    app.logout = async function() {
        try { await request('/api/logout', {}); oldLogout(); }
        catch (e) { alert('Не удалось завершить сессию: ' + e.message); }
    };
    async function request(url, body) {
        const response = await fetch(url, body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
        const value = await response.json();
        if (!response.ok) {const error=new Error(value.error || 'Ошибка сервера');error.status=response.status;throw error;}
        return value;
    }
    function cell(row, text) { const td = document.createElement('td'); td.textContent = text ?? ''; row.append(td); return td; }
    function render(root) {
        root.innerHTML = `<header class="stock-heading"><div><p class="stock-eyebrow">СКЛАД РАСХОДНЫХ МАТЕРИАЛОВ</p><h2>Картриджи</h2><p>Принимайте поставки и выдавайте картриджи по штрихкоду.</p></div><button id="stock-refresh" type="button">Обновить остатки</button></header>
        <div class="stock-metrics"><div><span>На складе</span><strong id="stock-total">—</strong></div><div><span>Моделей</span><strong id="stock-models">—</strong></div><div><span>Требуют пополнения</span><strong id="stock-low">—</strong></div></div>
        <div class="stock-columns"><section class="stock-panel"><h3>Сканирование</h3>
        <form id="stock-scan"><label>Операция<select id="stock-kind"><option value="issue">Выдача · 1 шт. за сканирование</option><option value="receipt">Приход партии</option><option value="return">Возврат на склад</option></select></label>
        <label id="stock-qty-label" hidden>Количество<input id="stock-qty" type="number" min="1" max="1000000" step="1" value="1" required></label>
        <label>Куда устанавливаем / получатель<input id="stock-destination" maxlength="500" placeholder="Кабинет 204, бухгалтерия" required></label>
        <label>Принтер (необязательно)<select id="stock-printer"><option value="">Без привязки к принтеру</option></select></label>
        <label>Примечание<input id="stock-note" maxlength="1000" placeholder="Накладная, партия или причина возврата"></label>
        <label>Штрихкод<input id="stock-barcode" autocomplete="off" spellcheck="false" maxlength="128" placeholder="Отсканируйте картридж" required></label>
        <p class="stock-help">Сканер должен работать как USB-клавиатура и добавлять Enter. При выдаче каждый Enter списывает одну штуку. Перед сканированием укажите место установки.</p>
        <button id="stock-submit" type="submit">Записать операцию</button><button id="stock-retry" type="button" hidden>Повторить неподтверждённую операцию</button></form><p id="stock-message" role="status" aria-live="polite"></p></section>
        <section class="stock-panel"><h3>Карточки и штрихкоды</h3><form id="stock-create"><label>Модель<input name="model" required maxlength="200" placeholder="HP 85A / CE285A"></label><label>Первый штрихкод<input name="barcode" required maxlength="128"></label><label>Совместимые принтеры<input name="compatible_printers" maxlength="500"></label><label>Порог пополнения, шт.<input name="min_stock" type="number" min="0" max="1000000" value="2" required aria-describedby="stock-threshold-help"></label><p id="stock-threshold-help" class="field-help">Когда остаток равен этому числу или ниже, модель попадает в «Требуют пополнения». Например, 2 — напомнить о закупке, когда осталось 2 картриджа или меньше. Выдачу это не ограничивает.</p><button type="submit">Создать карточку</button></form>
        <details><summary>Новый штрихкод у существующей модели</summary><form id="stock-alias"><label>Модель<select id="stock-alias-item" required></select></label><label>Штрихкод новой партии<input name="barcode" required maxlength="128"></label><label>Партия / примечание<input name="batch_note" maxlength="500"></label><button type="submit">Привязать штрихкод</button></form></details></section></div>
        <section class="stock-panel"><div class="stock-heading"><h3>Остатки</h3><input id="stock-search" aria-label="Поиск картриджа" placeholder="Модель или штрихкод"></div><p class="field-help">Порог пополнения — остаток, при котором пора заказать картриджи. На выдачу он не влияет.</p><div class="stock-table-wrap"><table class="stock-table"><thead><tr><th>Модель / совместимость</th><th>Штрихкоды</th><th>Остаток</th><th>Порог пополнения, шт.</th><th>Карточка</th></tr></thead><tbody id="stock-items"></tbody></table></div></section>
        <section class="stock-panel"><h3>Журнал операций <small>Последние 500</small></h3><div class="stock-table-wrap"><table class="stock-table"><thead><tr><th>Дата</th><th>Модель</th><th>Операция</th><th>Кол-во</th><th>Остаток после</th><th>Куда / принтер</th><th>Сотрудник</th><th>Примечание</th></tr></thead><tbody id="stock-history"></tbody></table></div></section>`;
        const $ = id => root.querySelector('#' + id);
        const pendingKey = 'oit-pending-stock-' + app.currentUser.id;
        let items = [], busy = false, pending = null;
        try {pending=JSON.parse(localStorage.getItem(pendingKey)||'null');} catch {}
        const message = (text, error=false) => { $('stock-message').textContent = text; $('stock-message').className = error ? 'stock-error' : 'stock-success'; };
        function draw() {
            const query = $('stock-search').value.toLowerCase(); $('stock-items').replaceChildren();
            for (const item of items.filter(i => (i.model+' '+i.barcodes.map(b=>b.barcode).join(' ')).toLowerCase().includes(query))) {
                const row = document.createElement('tr');
                cell(row, item.model + (item.compatible_printers ? ' · ' + item.compatible_printers : ''));
                cell(row, item.barcodes.map(b=>b.barcode + (b.batch_note ? ' ('+b.batch_note+')' : '')).join(', '));
                cell(row, item.stock).className = item.low_stock ? 'stock-warning' : ''; cell(row, item.min_stock);
                const editButton=document.createElement('button');editButton.type='button';editButton.className='secondary';editButton.textContent='Изменить';
                editButton.onclick=()=>edit('Карточка картриджа',[field('model','Модель','text',{required:true}),field('compatible_printers','Совместимые принтеры'),field('min_stock','Порог пополнения, шт.','number',{required:true,min:0,max:1000000,help:'Когда остаток равен порогу или ниже, модель попадает в «Требуют пополнения». На выдачу это не влияет.'})],async b=>{b.min_stock=Number(b.min_stock);await app.api('/api/cartridges/'+item.id,'PUT',b);await refresh();},item);
                cell(row,'').append(editButton);$('stock-items').append(row);
            }
            if (!$('stock-items').children.length) {const row=document.createElement('tr');cell(row,'Карточек пока нет или ничего не найдено.').colSpan=5;$('stock-items').append(row);}
        }
        async function refresh() {
            const [data, history, printers] = await Promise.all([request('/api/cartridges'),request('/api/cartridges/movements'),request('/api/inventory/printers')]);
            if (!root.isConnected) return;
            items = data;
            $('stock-total').textContent = items.reduce((sum,item)=>sum+item.stock,0); $('stock-models').textContent=items.length; $('stock-low').textContent=items.filter(i=>i.low_stock).length;
            const selected = $('stock-alias-item').value; $('stock-alias-item').replaceChildren();
            for (const item of items) $('stock-alias-item').add(new Option(item.model,item.id));
            if (selected) $('stock-alias-item').value = selected;
            const printer = $('stock-printer').value; $('stock-printer').replaceChildren(new Option('Без привязки к принтеру',''));
            for (const p of printers) $('stock-printer').add(new Option([p.inventory_number,p.model,p.location].filter(Boolean).join(' · '),p.id));
            $('stock-printer').value = printer;
            $('stock-history').replaceChildren();
            const names={receipt:'Приход',issue:'Выдача',return:'Возврат'};
            for (const m of history) {
                const row=document.createElement('tr');
                for (const text of [new Date(m.created_at).toLocaleString('ru-RU'),m.model+' · '+m.scanned_barcode,names[m.kind],m.quantity,m.balance_after,[m.destination,m.printer_inventory_number].filter(Boolean).join(' · '),m.admin_name||'Удалённая учётная запись',m.note]) cell(row,text);
                $('stock-history').append(row);
            }
            if (!history.length){const row=document.createElement('tr');cell(row,'Операций пока нет.').colSpan=8;$('stock-history').append(row);}
            draw();
        }
        function mode() { const issue=$('stock-kind').value==='issue';$('stock-qty-label').hidden=issue;$('stock-destination').required=issue;$('stock-qty').disabled=issue; }
        $('stock-kind').onchange=mode; mode();
        $('stock-search').oninput=draw;
        $('stock-refresh').onclick=()=>refresh().catch(e=>message(e.message,true));
        $('stock-create').onsubmit=async e=> {
            e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
            try {const data=Object.fromEntries(new FormData(e.target));data.min_stock=Number(data.min_stock);await request('/api/cartridges',data);e.target.reset();message('Карточка создана. Теперь зарегистрируйте приход.');await refresh();}catch(err){message(err.message,true);}finally{button.disabled=false;}
        };
        $('stock-alias').onsubmit=async e=> {
            e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
            try {const data=Object.fromEntries(new FormData(e.target));await request('/api/cartridges/'+$('stock-alias-item').value+'/barcodes',data);e.target.reset();message('Штрихкод привязан к модели.');await refresh();}catch(err){message(err.message,true);}finally{button.disabled=false;}
        };
        async function submit(retry=false) {
            if (busy) return;
            if (!retry && pending) {message('Сначала повторите неподтверждённую операцию, чтобы не списать картридж дважды.',true);return;}
            busy=true;$('stock-submit').disabled=true;$('stock-retry').disabled=true;
            const payload = retry ? pending : {barcode:$('stock-barcode').value.trim(),kind:$('stock-kind').value,quantity:$('stock-kind').value==='issue'?1:Number($('stock-qty').value),destination:$('stock-destination').value.trim(),printer_id:$('stock-printer').value?Number($('stock-printer').value):null,note:$('stock-note').value.trim(),request_id:makeId()};
            pending=payload;
            try {
                localStorage.setItem(pendingKey,JSON.stringify(payload));
                const result=await request('/api/cartridges/movements',payload);
                pending=null;localStorage.removeItem(pendingKey);$('stock-retry').hidden=true;$('stock-barcode').value='';
                message((result.duplicate?'Операция уже была записана. ':'Готово. ')+(payload.kind==='issue'?'Выдан 1 картридж. ':'Записано: '+payload.quantity+' шт. ')+'Остаток после операции: '+result.movement.balance_after);
                try {await refresh();}catch(e){message('Операция записана. Не удалось обновить таблицу: '+e.message,true);}
            }catch(e){
                if(e.status>=400 && e.status<500){pending=null;localStorage.removeItem(pendingKey);$('stock-retry').hidden=true;message(e.message,true);return;}
                // Retain the same request ID for any retry, including a response lost after commit.
                $('stock-retry').hidden=false;message(e.message+' Операция не подтверждена. Повтор использует тот же номер операции.',true);
            }finally{busy=false;$('stock-submit').disabled=!!pending;$('stock-retry').disabled=false;$('stock-barcode').focus();}
        }
        $('stock-scan').onsubmit=e=>{e.preventDefault();submit();};
        $('stock-retry').onclick=()=>submit(true);
        if(pending){$('stock-retry').hidden=false;$('stock-submit').disabled=true;message('Есть неподтверждённая операция: '+pending.barcode+', '+pending.quantity+' шт. Повторите её с прежним номером операции.',true);}
        refresh().catch(e=>message(e.message,true));$('stock-barcode').focus({preventScroll:true});
    }
    function makeId() {
        // getRandomValues works on internal HTTP hosts where randomUUID may be unavailable.
        const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
        const s=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
    }
})();
