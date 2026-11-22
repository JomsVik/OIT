// The browser handles presentation. Authentication and permissions are enforced by Rust.
const app = {
    currentUser:null, currentUserType:null, activeTab:'active',
    async api(url, method='GET', body) {
        const response=await fetch(url,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
        const value=await response.json();
        if (!response.ok) {if(response.status===401 && this.currentUser)this.showLogin();throw new Error(value.error||'Ошибка запроса');}return value;
    },
    toast(text) {const el=document.getElementById('toast');el.textContent=text;el.hidden=false;clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.hidden=true,6000);},
    showLogin() {this.currentUser=null;document.documentElement.dataset.theme='light';document.getElementById('workspace').hidden=true;document.getElementById('login-screen').hidden=false;document.getElementById('login-form').reset();setLoginType('users');},
    enter(account,kind) {
        this.currentUser=account;this.currentUserType=kind==='admins'?'admin':'user';
        document.documentElement.dataset.theme=kind==='admins'?'dark':'light';
        document.getElementById('workspace-title').textContent=kind==='admins'?'Панель администратора':'Личный кабинет';
        document.querySelector('.account-badge').dataset.role=account.role||'user';
        document.getElementById('login-screen').hidden=true;document.getElementById('workspace').hidden=false;
        document.getElementById('account-name').textContent=account.full_name;
        document.getElementById('account-role').textContent=({director:'Директор',super_admin:'Главный администратор',admin:'Администратор',user:'Пользователь'})[account.role||'user'];
        const nav=document.getElementById('navigation');nav.replaceChildren();
        const tabs=kind==='admins'?[['active','Активные'],['archived','Архив'],['tasks','Задачи'],['tasks-archive','Архив задач'],['inventory','Инвентарь'],['switches','Коммутаторы'],['cartridges','Картриджи'],['reports','Отчёты']]:[['active','Мои заявки'],['archived','Архив заявок'],['track','Найти по коду']];
        if(account.role==='director')tabs.push(['users','Сотрудники и доступ']);
        for(const [key,label] of tabs){const b=el('button',label,{className:'nav-btn'});b.dataset.tab=key;b.onclick=()=>this.switchTab(key);nav.append(b);}
        this.switchTab('active');
    },
    logout() {this.showLogin();},
    switchTab(tab) {
        this.activeTab=tab;document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
        document.getElementById('page-name').textContent=document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.textContent||'';
        const root=document.getElementById('admin-content');root.replaceChildren();
        const load=tab==='active'||tab==='archived'?()=>this.tickets(root,tab==='archived'):tab==='tasks'||tab==='tasks-archive'?()=>this.tasks(root,tab==='tasks-archive'):tab==='inventory'?()=>this.inventory(root):tab==='switches'?()=>this.switches(root):tab==='reports'?()=>this.reports(root):tab==='users'?()=>this.accounts(root):tab==='track'?()=>this.track(root):async()=>{};
        load().catch(e=>{if(root.isConnected){root.replaceChildren(el('p',e.message,{className:'error'}));}});
    },
    manager(){return ['director','super_admin'].includes(this.currentUser?.role);},
    async tickets(root,archived) {
        heading(root,archived?'Архив заявок':'Заявки',archived?'История выполненных обращений.':'Обращения сотрудников и ход работы.',!archived?button('Новая заявка',()=>this.editTicket()):null);
        const data=await this.api('/api/tickets?archived='+archived);if(this.activeTab!==(archived?'archived':'active'))return;
        ticketCards(root,data,r=>{
            const buttons=[button('Открыть',()=>this.ticketDetail(r),'secondary')];
            if(this.currentUserType==='admin')buttons.push(button(archived?'Вернуть':'Завершить',()=>this.ticketStatus(r,archived),'secondary'));
            if(this.manager())buttons.push(button('Удалить',()=>this.remove('/api/tickets/'+r.id),'danger'));return buttons;
        });
    },
    editTicket() {edit('Новая заявка',[
        field('problem','Описание проблемы','textarea',{required:true}),field('location','Кабинет / расположение','text',{required:true}),field('employee','Сотрудник','text',{required:true,value:this.currentUser.full_name}),field('comment','Дополнение','textarea'),field('urgency','Срочность','select',{options:[['low','Низкая'],['medium','Обычная'],['high','Высокая']]})
    ],async b=>{const r=await this.api('/api/tickets','POST',b);this.toast('Заявка №'+r.ticketId+' создана. Код отслеживания: '+r.trackingToken);this.switchTab('active');});},
    async ticketDetail(ticket) {
        const comments=ticket.comments||[];
        detail('Заявка №'+ticket.id,root=>{
            root.append(el('p',ticket.problem_desc,{className:'details-text'}),el('p',[ticket.employee_info,ticket.location].join(' · ')),el('p','Код отслеживания: '+ticket.tracking_token,{className:'muted'}));
            if(ticket.comment)root.append(el('p',ticket.comment,{className:'details-text'}));
            if(ticket.executor_name)root.append(el('p','Выполнил: '+ticket.executor_name));
            renderComments(root,comments);
            const form=el('form');const text=el('textarea',null,{required:true,placeholder:'Написать комментарий',maxLength:10000});const label=el('label','Комментарий');label.append(text);form.append(label);
            let privacy;
            if(this.currentUserType==='admin'){privacy=el('select');privacy.add(new Option('Виден пользователю','true'));privacy.add(new Option('Внутренний комментарий ОИТ','false'));form.append(privacy);}
            form.append(button('Отправить',null));form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('button');submit.disabled=true;try{await this.api('/api/tickets/'+ticket.id+'/comments','POST',{comment_text:text.value,is_public:privacy?privacy.value==='true':true});closeEditor();this.switchTab(this.activeTab);}catch(err){this.toast(err.message);}finally{submit.disabled=false;}};root.append(form);
        });
    },
    ticketStatus(r,restore) {
        if(restore)return this.api('/api/tickets/'+r.id+'/restore','PUT',{}).then(()=>this.switchTab(this.activeTab)).catch(e=>this.toast(e.message));
        edit('Завершить заявку №'+r.id,[field('comment_text','Что было сделано','textarea',{required:true})],async b=>{
            // Record the work description first; a failure never silently closes the ticket.
            await this.api('/api/tickets/'+r.id+'/comments','POST',{comment_text:b.comment_text,is_public:true});
            await this.api('/api/tickets/'+r.id+'/complete','PUT',{});this.switchTab(this.activeTab);
        });
    },
    track(root) {
        heading(root,'Найти заявку','Введите код, полученный при создании обращения.');const form=el('form',null,{className:'panel'});const input=el('input',null,{required:true,placeholder:'Код отслеживания'});const result=el('div');form.append(input,button('Найти',null));form.onsubmit=async e=>{e.preventDefault();try{const t=await this.api('/api/ticket/track/'+encodeURIComponent(input.value.trim()));result.replaceChildren();listing(result,[t],[['Номер','id'],['Описание','problem_desc'],['Место','location'],['Статус',r=>r.status?'Выполнена':'В работе']],r=>[button('Открыть',()=>this.ticketDetail(r),'secondary')]);}catch(err){this.toast(err.message);}};root.append(form,result);
    },
    async tasks(root,archived) {
        heading(root,archived?'Архив задач':'Задачи отдела','Назначения, сроки и обсуждения.',archived?null:button('Создать задачу',()=>this.editTask()));
        const data=await this.api('/api/tasks'+(archived?'/archive':''));if(this.activeTab!==(archived?'tasks-archive':'tasks'))return;
        listing(root,data,[['Задача','title'],['Исполнитель','assigned_to_name'],['Приоритет',r=>priority[r.priority]||r.priority],['Срок',r=>r.due_date?date(r.due_date):'Не задан'],['Статус',r=>statuses[r.status]||r.status]],r=>[
            button('Открыть',()=>this.taskDetail(r),'secondary'),...(this.manager()?[button('Изменить',()=>this.editTask(r),'secondary'),button('Удалить',()=>this.remove('/api/tasks/'+r.id),'danger')]:[])
        ]);
    },
    async editTask(task={}) {
        try {
            const admins=await this.api('/api/admins');
            edit(task.id?'Изменить задачу':'Новая задача',[field('title','Название','text',{required:true}),field('description','Описание','textarea'),field('assigned_to','Исполнитель','select',{options:[['','Не назначен'],...admins.map(a=>[a.id,a.full_name])]}),field('priority','Приоритет','select',{options:Object.entries(priority),value:'medium'}),field('due_date','Срок','date')],async b=>{b.assigned_to=b.assigned_to?Number(b.assigned_to):null;b.due_date=b.due_date||null;await this.api('/api/tasks'+(task.id?'/'+task.id:''),task.id?'PUT':'POST',b);this.switchTab(this.activeTab);},task);
        }catch(e){this.toast(e.message);}
    },
    async taskDetail(task) {
        try {
            const comments=await this.api('/api/tasks/'+task.id+'/comments');
            detail('Задача №'+task.id,root=>{
                root.append(el('h3',task.title),el('p',task.description||'',{className:'details-text'}));renderComments(root,comments);
                if(this.manager()||task.assigned_to===this.currentUser.id){const controls=el('div',null,{className:'actions'});for(const [value,label] of Object.entries(statuses))controls.append(button(label,async()=>{try{await this.api('/api/tasks/'+task.id+'/status','PUT',{status:value});closeEditor();this.switchTab(this.activeTab);}catch(e){this.toast(e.message);}},'secondary'));root.append(controls);}
                const form=el('form');const text=el('textarea',null,{required:true,placeholder:'Комментарий'});form.append(text,button('Добавить комментарий',null));form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('button');submit.disabled=true;try{await this.api('/api/tasks/'+task.id+'/comments','POST',{comment_text:text.value});closeEditor();this.taskDetail(task);}catch(err){this.toast(err.message);}finally{submit.disabled=false;}};root.append(form);
            });
        }catch(e){this.toast(e.message);}
    },
    async inventory(root) {
        heading(root,'Инвентарь','Компьютеры, ноутбуки и принтеры организации.');
        const select=el('select',null,{'aria-label':'Вид оборудования'});for(const [k,v] of [['computers','Компьютеры'],['laptops','Ноутбуки'],['printers','Принтеры']])select.add(new Option(v,k));
        const toolbar=el('div',null,{className:'actions'});const content=el('div');toolbar.append(select,button('Добавить оборудование',()=>this.editInventory(select.value)));root.append(toolbar,content);
        let revision=0;
        const load=async()=>{const current=++revision;try{const type=select.value;const data=await this.api('/api/inventory/'+type);if(current!==revision)return;content.replaceChildren();listing(content,data,type==='printers'?[['Инв. номер','inventory_number'],['Модель','model'],['Картридж','cartridge'],['Место','location'],['IP','ip']]:[['Инв. номер','inventory_number'],['Имя','name'],['Ответственный','responsible'],['Место','location'],['CPU','cpu'],['RAM','ram'],['IP LAN','ip_lan']],r=>[button('Изменить',()=>this.editInventory(type,r,load),'secondary'),...(this.manager()?[button('Удалить',()=>this.remove('/api/inventory/'+type+'/'+r.id,load),'danger')]:[])]);}catch(e){this.toast(e.message);}};
        select.onchange=load;this.inventoryRefresh=load;await load();
    },
    editInventory(type,item={},refresh=this.inventoryRefresh) {
        const fields=type==='printers'?[['inventory_number','Инвентарный номер'],['model','Модель'],['cartridge','Модель картриджа'],['location','Расположение'],['ip','IP-адрес'],['comment','Примечание']]:[['inventory_number','Инвентарный номер'],['name','Имя ПК'],['responsible','Ответственный'],['location','Расположение'],['cpu','Процессор'],['ram','Оперативная память'],['storage','Накопитель'],['windows_version','ОС'],['ip_inet','Внешний IP'],['ip_lan','IP LAN'],['mac','MAC'],['manufacturer','Производитель']];
        edit(item.id?'Изменить оборудование':'Новое оборудование',fields.map(([k,v])=>field(k,v,'text',{required:k==='inventory_number'})),async b=>{await this.api('/api/inventory/'+type+(item.id?'/'+item.id:''),item.id?'PUT':'POST',b);await refresh();},item);
    },
    async switches(root) {
        heading(root,'Коммутаторы','Оборудование сети и назначение портов.',button('Добавить коммутатор',()=>this.editSwitch()));
        const data=await this.api('/api/switches');if(this.activeTab!=='switches')return;
        listing(root,data,[['Инв. номер','inventory_number'],['Модель','model'],['Место','location'],['IP','ip'],['Портов','ports_count']],r=>[button('Порты',()=>this.ports(r),'secondary'),button('Изменить',()=>this.editSwitch(r),'secondary'),...(this.manager()?[button('Удалить',()=>this.remove('/api/switches/'+r.id),'danger')]:[])]);
    },
    editSwitch(item={}) {edit(item.id?'Изменить коммутатор':'Новый коммутатор',[...['inventory_number','model','manufacturer','ports_count','ip','mac','location','connection_method','sn','comment'].map((k,i)=>field(k,['Инвентарный номер','Модель','Производитель','Количество портов','IP','MAC','Расположение','Подключение','Серийный номер','Примечание'][i],k==='ports_count'?'number':'text',{required:k==='inventory_number'||k==='ports_count',min:1,max:1024,value:k==='ports_count'?24:''}))],async b=>{b.ports_count=Number(b.ports_count);await this.api('/api/switches'+(item.id?'/'+item.id:''),item.id?'PUT':'POST',b);this.switchTab('switches');},item);},
    ports(sw) {
        detail('Порты · '+sw.inventory_number,root=>{
            root.append(button('Добавить порт',()=>this.editPort(sw)));
            listing(root,sw.ports,[['Порт','port_number'],['Метка','port_label'],['Куда идёт','destination'],['Статус',r=>portStatuses[r.status]],['Скорость','speed'],['VLAN','vlan'],['Примечание','comment']],r=>[button('Изменить',()=>this.editPort(sw,r),'secondary'),...(this.manager()?[button('Удалить',()=>this.remove('/api/switch-ports/'+r.id,()=>{closeEditor();this.switchTab('switches');}),'danger')]:[])]);
        });
    },
    editPort(sw,item={}) {edit(item.id?'Изменить порт':'Добавить порт',[field('port_number','Номер порта','number',{required:true,min:1,max:sw.ports_count}),field('port_label','Метка'),field('destination','Куда идёт'),field('status','Статус','select',{options:Object.entries(portStatuses)}),field('speed','Скорость'),field('vlan','VLAN'),field('comment','Примечание','textarea')],async b=>{b.port_number=Number(b.port_number);await this.api(item.id?'/api/switch-ports/'+item.id:'/api/switches/'+sw.id+'/ports',item.id?'PUT':'POST',b);this.switchTab('switches');},item);},
    async reports(root) {
        heading(root,'Отчёты','Сводки по заявкам, задачам и расходным материалам.',button('Создать отчёт',()=>this.generateReport()));
        const data=await this.api('/api/reports');if(this.activeTab!=='reports')return;
        listing(root,data,[['Название','title'],['Описание','description'],['Автор','created_by_name'],['Создан',r=>date(r.created_at)]],r=>[button('Открыть',()=>this.viewReport(r),'secondary'),button('Изменить JSON',()=>this.editReport(r),'secondary'),...(this.manager()?[button('Удалить',()=>this.remove('/api/reports/'+r.id),'danger')]:[])]);
    },
    generateReport() {
        edit('Создать отчёт',[field('title','Название','text',{required:true}),field('description','Описание','textarea'),field('type','Содержание','select',{options:[['tickets','Выполненные заявки'],['tasks','Выполненные задачи'],['stats','Статистика заявок по дням'],['stock','Остатки картриджей']]})],async b=>{
            let data;
            if(b.type==='tickets')data={type:'tickets',tickets:(await this.api('/api/tickets?archived=true')).map(t=>({id:t.id,title:t.employee_info+' · '+t.location,problem_desc:t.problem_desc,created_at:t.created_at,completed_at:t.completed_at,executor_name:t.executor_name}))};
            else if(b.type==='tasks')data={type:'tasks',tasks:(await this.api('/api/tasks/archive')).map(t=>({id:t.id,title:t.title,description:t.description,assigned_to:t.assigned_to_name,completed_by:t.completed_by_name,priority:priority[t.priority],created_at:t.created_at,completed_at:t.completed_at}))};
            else if(b.type==='stock')data={type:'stock',stock:(await this.api('/api/cartridges')).map(c=>({model:c.model,barcodes:c.barcodes.map(b=>b.barcode).join(', '),stock:c.stock,min_stock:c.min_stock,compatible_printers:c.compatible_printers}))};
            else {
                const [active,archived]=await Promise.all([this.api('/api/tickets'),this.api('/api/tickets?archived=true')]);const days=new Map();
                for(const t of [...active,...archived]){const day=t.created_at.slice(0,10);if(!days.has(day))days.set(day,{date:day,total:0,completed:0,pending:0,hours:0,count:0});const d=days.get(day);d.total++;if(t.status){d.completed++;const hours=(new Date(t.completed_at)-new Date(t.created_at))/3600000;if(Number.isFinite(hours)&&hours>=0){d.hours+=hours;d.count++;}}else d.pending++;}
                const stats=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({date:d.date,total:d.total,completed:d.completed,pending:d.pending,avgSpeed:d.count?+(d.hours/d.count).toFixed(2):null,completionRate:Math.round(d.completed/d.total*100)}));
                data={type:'stats',stats,summary:{total:active.length+archived.length,completed:archived.length,pending:active.length}};
            }
            await this.api('/api/reports','POST',{title:b.title,description:b.description,report_data:data});this.switchTab('reports');
        });
    },
    viewReport(report) {
        let data;try{data=typeof report.report_data==='string'?JSON.parse(report.report_data):report.report_data;}catch{this.editReport(report);return;}
        const layouts={tickets:[['ID','id'],['Сотрудник / место','title'],['Проблема','problem_desc'],['Создана','created_at'],['Выполнена','completed_at'],['Выполнил','executor_name']],tasks:[['ID','id'],['Задача','title'],['Описание','description'],['Назначена','assigned_to'],['Выполнил','completed_by'],['Приоритет','priority'],['Создана','created_at'],['Выполнена','completed_at']],stats:[['Дата','date'],['Всего','total'],['Выполнено','completed'],['Ожидают','pending'],['Среднее время, ч','avgSpeed'],['Выполнение, %','completionRate']],stock:[['Модель','model'],['Штрихкоды','barcodes'],['Остаток','stock'],['Порог пополнения','min_stock'],['Совместимость','compatible_printers']]};
        const columns=layouts[data?.type],items=data?.[data?.type];if(!columns||!Array.isArray(items)){this.editReport(report);return;}
        detail(report.title,root=>{
            root.append(el('p',report.description||'',{className:'details-text'}));
            const controls=el('div',null,{className:'actions'});
            controls.append(button('Добавить строку',()=>this.editReportRow(report,data,columns,{})),button('Скачать CSV',()=>downloadCSV(report.title,columns,items),'secondary'));root.append(controls);
            listing(root,items,columns,(r)=>[button('Изменить',()=>this.editReportRow(report,data,columns,r,items.indexOf(r)),'secondary')]);
        });
    },
    editReportRow(report,data,columns,row,index) {
        const numeric=['id','stock','min_stock','total','completed','pending','avgSpeed','completionRate'];
        edit('Строка отчёта',columns.map(([title,key])=>field(key,title,numeric.includes(key)?'number':'text',{min:0})),async b=>{
            for(const key of numeric)if(key in b)b[key]=b[key]===''?null:Number(b[key]);
            const updated=structuredClone(data);if(index===undefined)updated[data.type].push(b);else updated[data.type][index]=b;
            await this.api('/api/reports/'+report.id,'PUT',{report_data:updated});this.switchTab('reports');
        },row);
    },
    editReport(item={}) {edit(item.id?'Отчёт':'Новый отчёт',[field('title','Название','text',{required:true}),field('description','Описание','textarea'),field('report_data','Данные отчёта (JSON)','textarea',{value:'{}'})],async b=>{JSON.parse(b.report_data||'{}');await this.api('/api/reports'+(item.id?'/'+item.id:''),item.id?'PUT':'POST',b);this.switchTab('reports');},{...item,report_data:typeof item.report_data==='object'?JSON.stringify(item.report_data,null,2):item.report_data??'{}'});},
    async accounts(root) {
        heading(root,'Сотрудники и доступ','Учётные записи пользователей и команды ОИТ.',button('Создать учётную запись',()=>this.editAccount()));
        const [admins,users]=await Promise.all([this.api('/api/admins/all'),this.api('/api/users/all')]);if(this.activeTab!=='users')return;
        root.append(el('h3','Команда ОИТ'));this.accountTable(root,admins,'admins');root.append(el('h3','Пользователи'));this.accountTable(root,users,'users');
    },
    accountTable(root,data,type) {listing(root,data,[['ФИО','full_name'],['Логин','login_id'],[type==='admins'?'Роль':'Отдел',type==='admins'?'role':'department']],r=>[button('Изменить',()=>this.editAccount(r,type),'secondary'),button('Пароль',()=>edit('Новый пароль',[field('password','Пароль','password',{required:true,minLength:12,maxLength:72})],async b=>{await this.api('/api/'+type+'/'+r.id+'/password','PUT',b);this.toast('Пароль изменён');}),'secondary'),button('Удалить',()=>this.remove('/api/'+type+'/'+r.id),'danger')]);},
    editAccount(item={},type='users') {
        const isAdmin=b=>(b.type||type)==='admins';
        const fields=[...(!item.id?[field('type','Тип учётной записи','select',{options:[['users','Пользователь'],['admins','Сотрудник ОИТ']],value:type}),field('login_id','Логин','text',{required:true}),field('password','Пароль','password',{required:true,minLength:12,maxLength:72})]:[]),field('full_name','ФИО','text',{required:true}),field('role','Роль сотрудника ОИТ','select',{options:[['admin','Администратор'],['super_admin','Главный администратор'],['director','Директор']],visibleWhen:isAdmin}),field('phone_number','Телефон ОИТ','text',{visibleWhen:isAdmin}),field('department','Отдел','text',{visibleWhen:b=>!isAdmin(b)}),field('position','Должность','text',{visibleWhen:b=>!isAdmin(b)})];
        edit(item.id?'Изменить учётную запись':'Новая учётная запись',fields,async b=>{const kind=item.id?type:b.type;await this.api('/api/'+kind+(item.id?'/'+item.id:'/create'),item.id?'PUT':'POST',b);if(item.id&&type==='admins'&&item.id===this.currentUser.id){this.showLogin();this.toast('Учётная запись изменена. Войдите заново.');}else this.switchTab('users');},item);
    },
    async remove(url,refresh=()=>this.switchTab(this.activeTab)) {if(!confirm('Удалить запись? Это действие нельзя отменить.'))return;try{await this.api(url,'DELETE',{});await refresh();}catch(e){this.toast(e.message);}}
};
const priority={low:'Низкий',medium:'Обычный',high:'Высокий'},statuses={pending:'Ожидает',in_progress:'В работе',completed:'Выполнена'},portStatuses={free:'Свободен',active:'Активен',dead:'Не работает',burnt:'Сгорел',reserved:'Резерв'};
function el(tag,text,props={}) {const node=document.createElement(tag);if(text!==null&&text!==undefined)node.textContent=text;for(const [k,v] of Object.entries(props)){if(k.startsWith('aria-'))node.setAttribute(k,v);else node[k]=v;}return node;}
function button(text,handler,style='') {const b=el('button',text,{className:style});if(handler){b.type='button';b.onclick=handler;}return b;}
function date(s){return s?new Date(s).toLocaleString('ru-RU'):'—';}
function downloadCSV(title,columns,data){
    const quote=value=>{let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    const csv='\uFEFF'+[columns.map(([label])=>quote(label)).join(';'),...data.map(row=>columns.map(([,key])=>quote(row[key])).join(';'))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=el('a',null,{href:url,download:title.replace(/[<>:"/\\|?*]/g,'_')+'.csv'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function heading(root,title,subtitle,action){const box=el('header',null,{className:'page-heading'}),text=el('div');text.append(el('p','ОТДЕЛ ИНФОРМАЦИОННЫХ ТЕХНОЛОГИЙ',{className:'eyebrow'}),el('h2',title),el('p',subtitle));box.append(text);if(action)box.append(action);root.append(box);}
function ticketCards(root,data,actions){
    const toolbar=el('div',null,{className:'table-toolbar'}),search=el('input',null,{placeholder:'Поиск по заявкам: сотрудник, кабинет, проблема','aria-label':'Поиск по заявкам'}),count=el('span',null,{className:'count'}),list=el('div',null,{className:'ticket-list'});toolbar.append(search,count);root.append(toolbar,list);
    function draw(){const query=search.value.trim().toLowerCase();const filtered=data.filter(t=>[t.id,t.problem_desc,t.employee_info,t.location,t.executor_name].some(v=>String(v??'').toLowerCase().includes(query)));count.textContent='Заявок: '+filtered.length;list.replaceChildren();
        for(const ticket of filtered){const colors=['ticket-normal','ticket-warning-1h','ticket-warning-3h','ticket-urgent-6h','ticket-urgent-24h'];const color=colors.includes(ticket.color_class)?ticket.color_class:'ticket-normal';const card=el('article',null,{className:'ticket-card '+(ticket.status?'ticket-completed':color)}),header=el('div',null,{className:'ticket-header'}),identity=el('div',null,{className:'ticket-identity'});identity.append(el('strong',ticket.employee_info),el('span',ticket.location,{className:'location'}));header.append(identity,el('span','№ '+ticket.id,{className:'ticket-id'}));card.append(header,el('p',ticket.problem_desc,{className:'ticket-desc'}));if(ticket.comment)card.append(el('p',ticket.comment,{className:'ticket-note'}));const footer=el('div',null,{className:'ticket-footer'}),meta=el('div',null,{className:'ticket-meta'});meta.append(el('span',date(ticket.created_at)),el('span',ticket.status?'Выполнена':'В работе',{className:'status-pill '+(ticket.status?'completed':'')}));if(ticket.executor_name)meta.append(el('span','Выполнил: '+ticket.executor_name));const controls=el('div',null,{className:'actions'});controls.append(...actions(ticket));footer.append(meta,controls);card.append(footer);list.append(card);}
        if(!filtered.length)list.append(el('p',query?'По вашему запросу ничего не найдено.':'Заявок пока нет.',{className:'panel empty'}));
    }search.oninput=draw;draw();
}
function listing(root,data,columns,actions) {
    const panel=el('section',null,{className:'panel'}),toolbar=el('div',null,{className:'table-toolbar'}),search=el('input',null,{placeholder:'Поиск по таблице','aria-label':'Поиск'}),count=el('span',null,{className:'count'}),wrap=el('div',null,{className:'table-wrap'}),table=el('table'),head=el('thead'),tr=el('tr'),body=el('tbody');
    for(const [title] of columns)tr.append(el('th',title));if(actions)tr.append(el('th','Действия'));head.append(tr);table.append(head,body);wrap.append(table);toolbar.append(search,count);panel.append(toolbar,wrap);root.append(panel);
    function draw(){const query=search.value.toLowerCase();const filtered=data.filter(r=>columns.some(([,field])=>String(typeof field==='function'?field(r):r[field]??'').toLowerCase().includes(query)));count.textContent='Записей: '+filtered.length;body.replaceChildren();for(const r of filtered){const row=el('tr');for(const [,field] of columns)row.append(el('td',typeof field==='function'?field(r):r[field]??'—'));if(actions){const td=el('td');td.append(...actions(r));row.append(td);}body.append(row);}if(!filtered.length){const row=el('tr'),td=el('td','Записей пока нет или ничего не найдено.',{className:'empty'});td.colSpan=columns.length+(actions?1:0);row.append(td);body.append(row);}}
    search.oninput=draw;draw();
}
function field(name,label,type='text',props={}){return {name,label,type,...props};}
function closeEditor(){document.getElementById('editor').close();}
function edit(title,fields,save,values={}) {
    const dialog=document.getElementById('editor'),form=document.getElementById('editor-form'),root=document.getElementById('editor-fields'),error=document.getElementById('editor-error'),submit=document.getElementById('editor-save');
    document.getElementById('editor-title').textContent=title;root.replaceChildren();error.textContent='';submit.hidden=false;submit.disabled=false;
    const controls=[];
    for(const f of fields){const label=el('label',f.label),input=el(f.type==='textarea'?'textarea':f.type==='select'?'select':'input');if(input.tagName==='INPUT')input.type=f.type;input.name=f.name;for(const k of ['required','min','max','minLength','maxLength'])if(f[k]!==undefined)input[k]=f[k];if(f.type==='select')for(const [v,t] of f.options)input.add(new Option(t,v));input.value=values[f.name]??f.value??(f.type==='select'?f.options[0]?.[0]:'')??'';label.append(input);if(f.help){const help=el('small',f.help,{className:'field-help',id:'editor-help-'+f.name});input.setAttribute('aria-describedby',help.id);label.append(help);}root.append(label);controls.push({f,label,input});}
    const syncFields=()=>{const b=Object.fromEntries(new FormData(form));for(const {f,label,input} of controls){const visible=!f.visibleWhen||f.visibleWhen(b);label.hidden=!visible;input.disabled=!visible;}};
    form.onchange=syncFields;syncFields();
    form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;error.textContent='';try{await save(Object.fromEntries(new FormData(form)));dialog.close();}catch(err){error.textContent=err.message;}finally{submit.disabled=false;}};
    if(!dialog.open)dialog.showModal();
}
function detail(title,build){document.getElementById('editor-title').textContent=title;document.getElementById('editor-error').textContent='';document.getElementById('editor-save').hidden=true;document.getElementById('editor-form').onsubmit=e=>e.preventDefault();const root=document.getElementById('editor-fields');root.replaceChildren();build(root);const d=document.getElementById('editor');if(!d.open)d.showModal();}
function renderComments(root,comments){root.append(el('h3','Обсуждение'));for(const c of comments){const item=el('article',null,{className:'comment'});item.append(el('small',(c.admin_name||c.user_name||'Удалённая учётная запись')+' · '+date(c.created_at)+(c.is_public===false?' · Внутренний комментарий':'')),el('p',c.comment_text));root.append(item);}if(!comments.length)root.append(el('p','Комментариев пока нет.',{className:'muted'}));}
document.getElementById('editor-close').onclick=closeEditor;
document.getElementById('refresh-page').onclick=()=>app.switchTab(app.activeTab);
document.getElementById('logout').onclick=()=>app.logout();
function setLoginType(type){document.querySelector('#login-form [name="type"]').value=type;document.querySelectorAll('[data-account-type]').forEach(b=>{const active=b.dataset.accountType===type;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});document.getElementById('login-error').textContent='';}
document.querySelectorAll('[data-account-type]').forEach(b=>b.onclick=()=>setLoginType(b.dataset.accountType));
document.getElementById('login-form').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),submit=e.target.querySelector('button'),error=document.getElementById('login-error');submit.disabled=true;error.textContent='';try{const account=await app.api('/api/'+b.type+'/login','POST',{login_id:b.login_id,password:b.password});e.target.reset();app.enter(account,b.type);}catch(err){error.textContent=err.message;}finally{submit.disabled=false;}};
// Session restoration happens only after the extension script has installed the cartridge menu.
window.addEventListener('DOMContentLoaded',()=>app.api('/api/me').then(a=>app.enter(a,a.kind)).catch(()=>{}));
