# Установка ОИТ на Ubuntu без Docker

Эта инструкция предназначена для отдельной виртуальной машины с Ubuntu. Все серверные команды выполняются в SSH-сессии (например, через PuTTY) от обычного пользователя с правами `sudo`. Для первой установки нужен интернет. Существующая рабочая PostgreSQL автоматически не импортируется; если в старой системе есть данные, сначала требуется их отдельный перенос.

## 1. Подключение и загрузка исходников

В PuTTY укажите IP виртуальной машины, порт 22 и тип SSH. Войдите под своей учётной записью. Затем установите инструменты:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config curl git
```

Получите отдельную ветку проекта:

```bash
git clone --branch codex/rust-cartridge-inventory --single-branch https://github.com/JomsVik/OIT.git ~/oit-source
cd ~/oit-source
```

Если репозиторий закрытый, используйте свою настроенную авторизацию GitHub или перенесите архив проекта через SCP / WinSCP и откройте его распакованный каталог. Пароли и токены не вставляйте в URL репозитория.

## 2. Установка Rust и сборка

Установите Rust через официальный установщик под обычным пользователем, без `sudo`:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/oit-install-rust.sh
sh /tmp/oit-install-rust.sh -y
. "$HOME/.cargo/env"
rustc --version
cargo test --locked
cargo build --release --locked
```

Требуется Rust 1.95 или новее. Сборка может занять несколько минут. Node.js и отдельная СУБД не нужны. SQLite и файлы интерфейса встроены в приложение.

## 3. Пользователь, каталоги и приложение

```bash
id oit >/dev/null 2>&1 || sudo useradd --system --user-group --home-dir /var/lib/oit --shell /usr/sbin/nologin oit
sudo install -d -m 755 /opt/oit
sudo install -d -m 700 /etc/oit
sudo install -d -o oit -g oit -m 700 /var/lib/oit
sudo install -d -o oit -g oit -m 700 /var/lib/oit/backups
sudo install -m 755 target/release/oit-portal /opt/oit/oit-portal
```

При первой установке создайте настройки. Если файл уже существует, редактируйте его, не заменяя:

```bash
sudo test -f /etc/oit/oit.env || sudo install -m 600 .env.example /etc/oit/oit.env
sudo nano /etc/oit/oit.env
```

Укажите:

```dotenv
BOOTSTRAP_LOGIN=director
BOOTSTRAP_PASSWORD=ЗАДАЙТЕ_СВОЙ_ПАРОЛЬ
DATABASE_PATH=/var/lib/oit/oit.sqlite3
BIND_ADDR=0.0.0.0:3000
COOKIE_SECURE=false
```

Замените значение `BOOTSTRAP_PASSWORD` на свой пароль длиной от 12 до 72 байт. Для удобства используйте латинские буквы и цифры. Для этого файла подходят такие символы без кавычек; не используйте пробелы или `$` в первом пароле. Сохраните: Ctrl+O, Enter, Ctrl+X. Значения `LISTEN_IP` и `PORT` относятся к Docker и при нативном запуске не используются.

`BOOTSTRAP_PASSWORD` применяется только к новой пустой базе. Изменение этого значения позже не меняет пароль существующего директора: пароли меняются в разделе управления учётными записями.

## 4. Автозапуск через systemd

```bash
sudo install -m 644 deploy/oit.service /etc/systemd/system/oit.service
sudo systemctl daemon-reload
sudo systemctl enable --now oit
sudo systemctl status oit --no-pager
curl --fail http://127.0.0.1:3000/api/health
```

В ответе health ожидается `"status":"ok"`. Откройте на рабочем компьютере `http://IP_ВИРТУАЛКИ:3000`, выберите «Администратор» и войдите как `director` с заданным паролем. База и таблицы создаются автоматически. После выхода из PuTTY и перезагрузки виртуальной машины служба продолжает работать.

Если сервер отвечает локально, а с компьютера сайт не открывается, проверьте адрес виртуальной машины, сетевой режим виртуализации, маршрутизацию и правила доступа к TCP-порту 3000. Для рабочего контура ограничьте доступ сетью организации.

## 5. Где находятся файлы

| Что | Путь |
| --- | --- |
| Приложение с интерфейсом | `/opt/oit/oit-portal` |
| Настройки | `/etc/oit/oit.env` |
| База | `/var/lib/oit/oit.sqlite3` |
| Резервные копии | `/var/lib/oit/backups/` |
| Служба | `/etc/systemd/system/oit.service` |
| Исходники | `~/oit-source` |

Файлы SQLite `-wal` и `-shm` рядом с базой — часть её работы. Не удаляйте их у работающей службы.

## 6. Резервное копирование

Согласованную копию можно создавать без остановки сервера:

```bash
sudo -u oit env DATABASE_PATH=/var/lib/oit/oit.sqlite3 \
  /opt/oit/oit-portal backup "/var/lib/oit/backups/oit-$(date -u +%Y%m%dT%H%M%SZ).sqlite3"
```

Сохраните копию также вне виртуальной машины. Для переноса на другой сервер установите там приложение, остановите службу, поместите резервную копию в `/var/lib/oit/oit.sqlite3`, задайте владельца `oit:oit` и режим 600, затем запустите службу. В копии находятся учётные записи, заявки, оборудование, остатки и история.

Для восстановления на текущей машине сначала создайте backup, остановите сервис (`sudo systemctl stop oit`) и перенесите текущую базу вместе с её `-wal` / `-shm`, если они остались, в отдельный новый каталог. Затем установите выбранную резервную копию как `/var/lib/oit/oit.sqlite3`, задайте владельца `oit:oit` и режим 600. Запустите `sudo systemctl start oit` и проверьте health. Не накладывайте старые WAL-файлы на восстановленную копию.

## 7. Обновление из этой ветки

Сначала сделайте резервную копию командой из раздела выше. Затем:

```bash
cd ~/oit-source
git pull --ff-only origin codex/rust-cartridge-inventory
. "$HOME/.cargo/env"
cargo test --locked
cargo build --release --locked
sudo systemctl stop oit
sudo cp /opt/oit/oit-portal /opt/oit/oit-portal.previous
sudo install -m 755 target/release/oit-portal /opt/oit/oit-portal
sudo systemctl start oit
curl --fail http://127.0.0.1:3000/api/health
```

Настройки и база при обновлении не заменяются. Миграции применяются при запуске. Возврат старого бинарника после миграций может потребовать восстановления соответствующей копии БД, поэтому сохраняйте их вместе.

## 8. Диагностика и Nginx

```bash
sudo journalctl -u oit -n 100 --no-pager
sudo systemctl restart oit
sudo ss -ltnp | grep ':3000'
```

Если порт 3000 занят, задайте свободный порт в `BIND_ADDR`, перезапустите службу и используйте этот порт в адресе сайта и health-проверке.

Для доступа через имя сервера и HTTPS можно использовать Nginx: пример находится в `deploy/nginx.conf`. При таком варианте задайте `BIND_ADDR=127.0.0.1:3000`, настройте сертификат организации в Nginx, сохраните передачу заголовка Host и установите `COOKIE_SECURE=true`. После изменения настроек перезапустите службу. Для прямого HTTP-доступа `COOKIE_SECURE` остаётся `false`.

## Приёмка после установки

Проверьте вход, создание модели картриджа, привязку другого штрихкода к той же модели, приход 2 шт., выдачу 1 шт. и остаток 1 шт. Сделайте резервную копию. В интерфейсе «Порог пополнения» служит напоминанием о закупке и не ограничивает выдачу. Для пользователя поля роли и телефона ОИТ скрыты; они появляются только для сотрудника ОИТ.

Сборка и автоматические тесты проверены на Windows. Запуск службы непосредственно на Ubuntu в среде разработки не выполнялся; окончательная проверка производится на целевой виртуальной машине.
