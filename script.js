let users = [];
let objects = [];
let personnel = [];
let events = [];
let currentUser = JSON.parse(localStorage.getItem('pb_currentUser')) || null;
let currentAssignPersonId = null;
let currentEditObjectId = null;
let currentEditPersonId = null;

// При загрузке страницы сначала тянем данные с сервера
window.onload = async () => {
    await loadDataFromServer();
    if (currentUser) {
        // Проверяем, существует ли еще этот юзер на сервере
        const validUser = users.find(u => u.login === currentUser.login);
        if (validUser) {
            showApp();
        } else {
            logout();
        }
    } else {
        showAuth();
    }
};

// --- РАБОТА С СЕРВЕРОМ ---
async function loadDataFromServer() {
    try {
        const response = await fetch('api.php');
        const data = await response.json();
        users = data.users || [];
        objects = data.objects || [];
        personnel = data.personnel || [];
        events = data.events || [];
    } catch (e) {
        console.error("Ошибка загрузки данных с сервера", e);
    }
}

async function saveData() {
    const allData = { users, objects, personnel, events };
    try {
        await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(allData)
        });
    } catch (e) {
        console.error("Ошибка сохранения на сервер", e);
        alert("Ошибка сети: данные не сохранены на сервер!");
    }
}

// --- ВАЛИДАЦИЯ ---
const fioRegex = /^[А-Яа-яЁё]+\s+[А-Яа-яЁё]+(\s+[А-Яа-яЁё]+)?$/;
const phoneRegex = /^(\+7|8)[\s\-]?\(?[0-9]{3}\)?[\s\-]?[0-9]{3}[\s\-]?[0-9]{2}[\s\-]?[0-9]{2}$/;

function validateFIO(name) { return fioRegex.test(name.trim()); }
function validatePhone(phone) { return phoneRegex.test(phone.trim()); }

// --- ПОКАЗАТЬ/СКРЫТЬ ПАРОЛЬ ---
function togglePassword(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
        iconElement.classList.remove("fa-eye");
        iconElement.classList.add("fa-eye-slash");
    } else {
        input.type = "password";
        iconElement.classList.remove("fa-eye-slash");
        iconElement.classList.add("fa-eye");
    }
}

// --- АВТОРИЗАЦИЯ ---
function toggleAuth(type) {
    document.getElementById('login-box').classList.toggle('hidden', type !== 'login');
    document.getElementById('register-box').classList.toggle('hidden', type !== 'register');
}

document.getElementById('register-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const login = document.getElementById('reg-username').value;
    const pass = document.getElementById('reg-password').value;
    const passConf = document.getElementById('reg-password-confirm').value;

    if (!validateFIO(name)) return alert('Введите корректное ФИО на русском (Например: Иванов Иван)');
    if (pass !== passConf) return alert('Пароли не совпадают!');
    if (users.find(u => u.login === login)) return alert('Пользователь с таким логином уже существует!');

    users.push({ name, login, pass });
    saveData();
    alert('Регистрация успешна! Теперь войдите.');
    this.reset();
    toggleAuth('login');
});

document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const login = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;

    const user = users.find(u => u.login === login && u.pass === pass);
    if (user) {
        currentUser = user;
        localStorage.setItem('pb_currentUser', JSON.stringify(currentUser));
        this.reset();
        showApp();
    } else {
        alert('Неверный логин или пароль!');
    }
});

function logout() {
    currentUser = null;
    localStorage.removeItem('pb_currentUser');
    showAuth();
}

function showAuth() {
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('app-section').classList.add('hidden');
}

function showApp() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    document.getElementById('current-user-name').innerText = currentUser.name;
    renderObjects();
    renderPersonnel();
    renderEvents();
}

// --- НАВИГАЦИЯ ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tabId}-tab`).classList.remove('hidden');
    event.currentTarget.classList.add('active');
}

// --- ОБЪЕКТЫ ---
document.getElementById('add-object-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const contactName = document.getElementById('obj-contact-name').value;
    const contactPhone = document.getElementById('obj-contact-phone').value;

    if (!validateFIO(contactName)) return alert('ФИО ответственного должно содержать минимум Фамилию и Имя.');
    if (!validatePhone(contactPhone)) return alert('Введите корректный номер телефона.');

    const newObj = {
        id: Date.now(),
        name: document.getElementById('obj-name').value,
        address: document.getElementById('obj-address').value,
        contactName: contactName,
        contactPhone: contactPhone,
        status: 'В норме'
    };
    objects.push(newObj);
    saveData();
    this.reset();
    renderObjects();
});

function renderObjects() {
    const tbody = document.querySelector('#objects-table tbody');
    tbody.innerHTML = '';
    objects.forEach(obj => {
        const tr = document.createElement('tr');
        const isAlarm = obj.status === 'Тревога';
        tr.innerHTML = `
            <td><strong>${obj.name}</strong><br><small class="text-muted">${obj.address}</small></td>
            <td><span class="badge ${isAlarm ? 'badge-alarm' : 'badge-ok'}">${obj.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-danger" onclick="triggerAlarm(${obj.id})"><i class="fa-solid fa-bell"></i></button>
                    <button class="btn btn-sm btn-secondary" onclick="showObjectDetails(${obj.id})"><i class="fa-solid fa-eye"></i></button>
		    <button class="btn btn-sm btn-outline" onclick="openEditObjectModal(${obj.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-outline" onclick="deleteObject(${obj.id})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteObject(id) {
    if (confirm('Удалить объект?')) {
        objects = objects.filter(o => o.id !== id);
        saveData();
        renderObjects();
    }
}

function showObjectDetails(id) {
    const obj = objects.find(o => o.id === id);
    const content = document.getElementById('details-content');
    content.innerHTML = `
        <p><strong><i class="fa-solid fa-building"></i> Название:</strong> ${obj.name}</p>
        <p><strong><i class="fa-solid fa-map-location-dot"></i> Адрес:</strong> ${obj.address}</p>
        <p><strong><i class="fa-solid fa-user-tie"></i> Ответственный:</strong> ${obj.contactName}</p>
        <p><strong><i class="fa-solid fa-phone"></i> Телефон:</strong> ${obj.contactPhone}</p>
        <p><strong><i class="fa-solid fa-circle-info"></i> Статус:</strong> <span class="badge ${obj.status === 'Тревога' ? 'badge-alarm' : 'badge-ok'}">${obj.status}</span></p>
    `;
    document.getElementById('details-modal').classList.remove('hidden');
}

function triggerAlarm(id) {
    const obj = objects.find(o => o.id === id);
    if(obj.status === 'Тревога') return alert('Тревога уже активна!');
    
    const reason = prompt('Причина тревоги:', 'Сработала пожарная сигнализация');
    if (reason === null) return;
    
    obj.status = 'Тревога';
    events.unshift({
        id: Date.now(),
        objectId: obj.id,
        objectName: obj.name,
        address: obj.address,
        reason: reason || 'Неизвестная причина',
        status: 'alarm',
        date: new Date().toLocaleString()
    });
    
    saveData();
    renderObjects();
    renderEvents();
    alert(`ВНИМАНИЕ! Объект "${obj.name}" в режиме ТРЕВОГИ!`);
}

// --- ПЕРСОНАЛ ---
document.getElementById('add-personnel-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('pers-name').value;
    const phone = document.getElementById('pers-phone').value;

    if (!validateFIO(name)) return alert('ФИО должно содержать минимум Фамилию и Имя.');
    if (!validatePhone(phone)) return alert('Некорректный номер телефона.');

    const newPers = {
        id: Date.now(),
        name: name,
        position: document.getElementById('pers-position').value,
        phone: phone,
        status: 'Свободен',
        assignedTo: null
    };
    personnel.push(newPers);
    saveData();
    this.reset();
    renderPersonnel();
});

function renderPersonnel() {
    const tbody = document.querySelector('#personnel-table tbody');
    tbody.innerHTML = '';
    personnel.forEach(p => {
        const tr = document.createElement('tr');
        let statusBadge = p.status === 'Свободен' ? 'badge-free' : 'badge-busy';
        let statusText = p.status;
        if (p.assignedTo) {
            const obj = objects.find(o => o.id == p.assignedTo);
            statusText = `На объекте: ${obj ? obj.name : 'Удален'}`;
        }
        
        tr.innerHTML = `
            <td><strong>${p.name}</strong><br><small><i class="fa-solid fa-phone"></i> ${p.phone}</small></td>
            <td>${p.position}</td>
            <td><span class="badge ${statusBadge}">${statusText}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-secondary" onclick="openAssignModal(${p.id})"><i class="fa-solid fa-location-dot"></i> Назначить</button>
		    <button class="btn btn-sm btn-outline" onclick="openEditPersonModal(${p.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-outline" onclick="deletePerson(${p.id})"><i class="fa-solid fa-trash"></i></button>

                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deletePerson(id) {
    if (confirm('Удалить сотрудника?')) {
        personnel = personnel.filter(p => p.id !== id);
        saveData();
        renderPersonnel();
    }
}

function openAssignModal(personId) {
    currentAssignPersonId = personId;
    const select = document.getElementById('assign-object-select');
    select.innerHTML = '<option value="none">-- Снять с объекта --</option>';
    objects.forEach(obj => {
        select.innerHTML += `<option value="${obj.id}">${obj.name} (${obj.status})</option>`;
    });
    document.getElementById('assign-modal').classList.remove('hidden');
}

document.getElementById('confirm-assign-btn').addEventListener('click', () => {
    const objId = document.getElementById('assign-object-select').value;
    const person = personnel.find(p => p.id === currentAssignPersonId);
    
    if (objId === 'none') {
        person.assignedTo = null;
        person.status = 'Свободен';
    } else {
        person.assignedTo = objId;
        person.status = 'На выезде';
    }
    
    saveData();
    renderPersonnel();
    closeModal('assign-modal');
});

// --- СОБЫТИЯ ---
function renderEvents() {
    const list = document.getElementById('events-list');
    list.innerHTML = '';
    
    if (events.length === 0) {
        list.innerHTML = '<p class="text-muted">Происшествий нет.</p>';
        return;
    }

    events.forEach(ev => {
        const div = document.createElement('div');
        div.className = `event-card ${ev.status === 'alarm' ? 'event-alarm' : 'event-resolved'}`;
        
        let actionHTML = ev.status === 'alarm' 
            ? `<button class="btn btn-success" onclick="resolveEvent(${ev.id}, ${ev.objectId})"><i class="fa-solid fa-check"></i> Урегулировано</button>` 
            : `<span class="badge badge-ok"><i class="fa-solid fa-shield-check"></i> Безопасно</span>`;

        div.innerHTML = `
            <div class="event-details">
                <p><strong><i class="fa-regular fa-clock"></i> Время:</strong> ${ev.date}</p>
                <p><strong><i class="fa-solid fa-location-crosshairs"></i> Объект:</strong> ${ev.objectName} <small>(${ev.address})</small></p>
                <p><strong><i class="fa-solid fa-circle-exclamation"></i> Причина:</strong> ${ev.reason}</p>
            </div>
            <div class="event-actions">
                ${actionHTML}
            </div>
        `;
        list.appendChild(div);
    });
}

function resolveEvent(eventId, objectId) {
    const ev = events.find(e => e.id === eventId);
    if (ev) ev.status = 'resolved';

    const obj = objects.find(o => o.id === objectId);
    if (obj) obj.status = 'В норме';

    personnel.forEach(p => {
        if(p.assignedTo == objectId) {
            p.assignedTo = null;
            p.status = 'Свободен';
        }
    });

    saveData();
    renderObjects();
    renderPersonnel();
    renderEvents();
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// --- РЕДАКТИРОВАНИЕ ОБЪЕКТОВ ---
function openEditObjectModal(id) {
    const obj = objects.find(o => o.id === id);
    currentEditObjectId = id;
    document.getElementById('edit-obj-name').value = obj.name;
    document.getElementById('edit-obj-address').value = obj.address;
    document.getElementById('edit-obj-contact-name').value = obj.contactName;
    document.getElementById('edit-obj-contact-phone').value = obj.contactPhone;
    document.getElementById('edit-object-modal').classList.remove('hidden');
}

document.getElementById('edit-object-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const contactName = document.getElementById('edit-obj-contact-name').value;
    const contactPhone = document.getElementById('edit-obj-contact-phone').value;

    if (!validateFIO(contactName)) return alert('ФИО ответственного должно содержать минимум Фамилию и Имя.');
    if (!validatePhone(contactPhone)) return alert('Введите корректный номер телефона.');

    const obj = objects.find(o => o.id === currentEditObjectId);
    obj.name = document.getElementById('edit-obj-name').value;
    obj.address = document.getElementById('edit-obj-address').value;
    obj.contactName = contactName;
    obj.contactPhone = contactPhone;

    saveData();
    renderObjects();
    closeModal('edit-object-modal');
});

// --- РЕДАКТИРОВАНИЕ ПЕРСОНАЛА ---
function openEditPersonModal(id) {
    const p = personnel.find(pers => pers.id === id);
    currentEditPersonId = id;
    document.getElementById('edit-pers-name').value = p.name;
    document.getElementById('edit-pers-position').value = p.position;
    document.getElementById('edit-pers-phone').value = p.phone;
    document.getElementById('edit-personnel-modal').classList.remove('hidden');
}

document.getElementById('edit-personnel-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('edit-pers-name').value;
    const phone = document.getElementById('edit-pers-phone').value;

    if (!validateFIO(name)) return alert('ФИО должно содержать минимум Фамилию и Имя.');
    if (!validatePhone(phone)) return alert('Некорректный номер телефона.');

    const p = personnel.find(pers => pers.id === currentEditPersonId);
    p.name = name;
    p.position = document.getElementById('edit-pers-position').value;
    p.phone = phone;

    saveData();
    renderPersonnel();
    closeModal('edit-personnel-modal');
});