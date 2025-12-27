/**
 * SISTEMA AGRIMANAGER - ARQUIVO PRINCIPAL JAVASCRIPT
 * Versão Corrigida: AudioContext Fix + renderReports Restaurado
 */

window.app = {
    // --- ESTADO GLOBAL ---
    state: {
        currentUser: null,
        currentView: 'dashboard',
        alertIntervalId: null,
        lastGeneratedCode: null,
        currentReportType: null 
    },

    // --- CAMADA DE DADOS (LOCALSTORAGE) ---
    db: {
        schema: {
            settings: {
                alertLeadTime: 24, 
                alertInterval: 60, 
                soundEnabled: true,
                visualEnabled: true,
                supportPhone: '5511999999999' 
            },
            license: {
                daysRemaining: 30, 
                lastCheckDate: null, 
                totalDaysAdded: 30
            },
            users: [],
            farms: [], plots: [], crops: [], 
            cycles: [], 
            inputs: [], 
            stock_movements: [], 
            production: [], 
            financials: [],
            machinery: [],
            maintenances: []
        },

        init() {
            if (!localStorage.getItem('agri_data')) {
                const initialData = JSON.parse(JSON.stringify(this.schema));
                initialData.users.push({
                    id: 'admin01', name: 'Administrador', email: 'admin@agri.com', pass: 'admin123', provider: 'local'
                });
                initialData.farms.push({id: 'f1', name: 'Fazenda Santa Luzia', owner: 'João Silva', area: 500, location: 'Mato Grosso'});
                initialData.license.lastCheckDate = new Date().toISOString().split('T')[0];
                localStorage.setItem('agri_data', JSON.stringify(initialData));
            } else {
                let data = JSON.parse(localStorage.getItem('agri_data'));
                if(!data.stock_movements) data.stock_movements = [];
                if(!data.cycles) data.cycles = [];
                if(!data.machinery) data.machinery = [];
                if(!data.maintenances) data.maintenances = [];
                if(!data.settings) data.settings = this.schema.settings;
                
                if(!data.license) {
                    data.license = { daysRemaining: 30, lastCheckDate: new Date().toISOString().split('T')[0], totalDaysAdded: 30 };
                }
                
                localStorage.setItem('agri_data', JSON.stringify(data));
            }
        },

        get(table) {
            const data = JSON.parse(localStorage.getItem('agri_data'));
            return data[table] || [];
        },
        
        getSettings() {
            const data = JSON.parse(localStorage.getItem('agri_data'));
            return data.settings || this.schema.settings;
        },

        getLicense() {
            const data = JSON.parse(localStorage.getItem('agri_data'));
            return data.license;
        },

        saveLicense(licData) {
            const data = JSON.parse(localStorage.getItem('agri_data'));
            data.license = licData;
            localStorage.setItem('agri_data', JSON.stringify(data));
        },

        saveSettings(newSettings) {
            const data = JSON.parse(localStorage.getItem('agri_data'));
            data.settings = { ...data.settings, ...newSettings };
            localStorage.setItem('agri_data', JSON.stringify(data));
            app.system.restartAlertLoop();
        },

        save(table, item) {
            const data = JSON.parse(localStorage.getItem('agri_data'));
            if (item.id) {
                const index = data[table].findIndex(x => x.id === item.id);
                if (index >= 0) data[table][index] = item;
                else data[table].push(item);
            } else {
                item.id = app.utils.uuid();
                data[table].push(item);
            }
            localStorage.setItem('agri_data', JSON.stringify(data));
            return item;
        },

        delete(table, id) {
            const data = JSON.parse(localStorage.getItem('agri_data'));
            data[table] = data[table].filter(x => x.id !== id);
            localStorage.setItem('agri_data', JSON.stringify(data));
        },
        
        getById(table, id) { return this.get(table).find(x => x.id === id); },
        
        findUser(email) { return this.get('users').find(u => u.email === email); },
        createUser(name, email, pass, provider = 'local') {
            if(this.findUser(email)) return false; 
            this.save('users', { name, email, pass, provider });
            return true;
        },

        seedDemoData() {
            let data = JSON.parse(localStorage.getItem('agri_data'));
            const dId = () => 'demo_' + Math.floor(Math.random() * 100000);
            const rItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
            const today = new Date().toISOString().split('T')[0];

            const demoFarms = [
                { name: 'Fazenda Esperança', owner: 'Mário Demo', area: 1200, location: 'Goiás' },
                { name: 'Sítio Novo Mundo', owner: 'Ana Demo', area: 350, location: 'Paraná' },
                { name: 'Agro Demo Tech', owner: 'Roberto Demo', area: 5000, location: 'Mato Grosso' },
                { name: 'Fazenda Vale Verde', owner: 'Lúcia Demo', area: 800, location: 'Minas Gerais' }
            ];
            demoFarms.forEach(f => { f.id = dId(); data.farms.push(f); });

            const demoPlots = [];
            const soilTypes = ['Argiloso', 'Arenoso', 'Misto'];
            demoFarms.forEach(f => {
                for(let i=1; i<=3; i++) {
                    const plot = {
                        id: dId(), farmId: f.id, name: `Talhão Demo ${i} - ${f.name.substr(0,10)}`, area: Math.floor(f.area / 4),
                        soilType: rItem(soilTypes), status: 'Ativo', notes: 'Registro gerado automaticamente.'
                    };
                    demoPlots.push(plot); data.plots.push(plot);
                }
            });

            const demoCrops = [];
            const cultures = ['Soja', 'Milho', 'Trigo', 'Café'];
            demoPlots.forEach(p => {
                const crop = {
                    id: dId(), name: `Safra Demo 2025 - ${p.name}`, culture: rItem(cultures), plotId: p.id,
                    status: 'Em andamento', plantingDate: '2024-11-01', expectedHarvestDate: '2025-03-15',
                    expectedProduction: p.area * 60, pricePerKg: 2.80 + (Math.random()), totalCost: 0, realProduction: 0
                };
                demoCrops.push(crop); data.crops.push(crop);
            });

            const demoMachines = [
                {id: dId(), name: 'Trator Demo 7200', type: 'Máquina', brand: 'John Deere', model: '7J', year: '2021', serial: 'DEMO123', status: 'Ativo', initialHour: 1000, currentHour: 1200, costPerHour: 180, maintenanceInterval: 500, nextMaintenanceType: 'Revisão', consumption: 15, notes: 'Demo'},
                {id: dId(), name: 'Colheitadeira Demo', type: 'Máquina', brand: 'New Holland', model: 'CR', year: '2022', serial: 'DEMO456', status: 'Ativo', initialHour: 500, currentHour: 650, costPerHour: 450, maintenanceInterval: 400, nextMaintenanceType: 'Filtros', consumption: 40, notes: 'Demo'},
                {id: dId(), name: 'Pulverizador Demo', type: 'Implemento', brand: 'Jacto', model: 'Uniport', year: '2020', serial: 'DEMO789', status: 'Ativo', initialHour: 0, currentHour: 0, costPerHour: 80, maintenanceInterval: 0, nextMaintenanceType: '', consumption: 0, notes: 'Demo'}
            ];
            demoMachines.forEach(m => data.machinery.push(m));

            const demoInputs = [
                {id: dId(), name: 'Semente Soja Demo', category: 'Outros', quantity: 200, unit: 'Saco', supplier: 'AgroDemo', price: 400, location: 'Galpão', purchaseDate: '2024-10-01'},
                {id: dId(), name: 'Adubo NPK Demo', category: 'Adubo', quantity: 5000, unit: 'Quilograma (kg)', supplier: 'FertDemo', price: 5, location: 'Galpão', purchaseDate: '2024-09-15'},
                {id: dId(), name: 'Diesel S10 Demo', category: 'Combustível', quantity: 1500, unit: 'Litro (L)', supplier: 'Posto Demo', price: 6.50, location: 'Tanque', purchaseDate: today}
            ];
            demoInputs.forEach(i => data.inputs.push(i));

            demoCrops.forEach(c => {
                const machine = demoMachines[0];
                const cycle = {
                    id: dId(), name: 'Plantio Demo', type: 'Plantio', status: 'Concluído',
                    startDate: c.plantingDate, endDate: c.plantingDate, safraId: c.id, plotId: c.plotId,
                    machineId: machine.id, hours: 10, cost: 10 * machine.costPerHour + 2000, description: 'Plantio gerado automaticamente'
                };
                data.cycles.push(cycle);
                data.financials.push({
                    id: dId(), date: c.plantingDate, type: 'expense', category: 'Operacional', 
                    description: `Custo Plantio: ${c.name}`, value: cycle.cost, status: 'Pago'
                });
                c.totalCost += cycle.cost;

                const prodQtd = c.expectedProduction * 0.95; 
                const prod = { id: dId(), date: today, safraId: c.id, quantity: prodQtd, unit: 'Saco' };
                data.production.push(prod);
                c.realProduction = prodQtd;
                
                const revenue = prodQtd * 100; 
                data.financials.push({
                    id: dId(), date: today, type: 'income', category: 'Venda de Safra', 
                    description: `Venda Parcial: ${c.name}`, value: revenue, status: 'Recebido'
                });
            });

            data.maintenances.push({
                id: dId(), machineId: demoMachines[0].id, type: 'Preventiva', date: '2024-08-01', hourmeter: 900, 
                description: 'Troca de Óleo Demo', parts: 'Filtro, Óleo', cost: 1200, supplier: 'Oficina Demo', status: 'Executada', nextMaintenance: '1400'
            });

            data.stock_movements.push({
                id: dId(), inputId: demoInputs[0].id, type: 'Entrada', quantity: 200, motive: 'Compra Inicial Demo', date: '2024-10-01'
            });

            localStorage.setItem('agri_data', JSON.stringify(data));
            alert('Dados de demonstração adicionados com sucesso! (Registros reais preservados)');
            location.reload();
        }
    },

    // --- SISTEMA DE LICENCIAMENTO ---
    license: {
        constA: 13, constB: 9, constC: 1954,
        checkStatus() {
            const lic = app.db.getLicense();
            const today = new Date().toISOString().split('T')[0];
            if (lic.lastCheckDate !== today) {
                const date1 = new Date(lic.lastCheckDate);
                const date2 = new Date(today);
                const diffDays = Math.ceil(Math.abs(date2 - date1) / (1000 * 60 * 60 * 24)); 
                if (diffDays > 0) { lic.daysRemaining -= diffDays; lic.lastCheckDate = today; app.db.saveLicense(lic); }
            }
            const statusEl = document.getElementById('license-status');
            if(statusEl) {
                if (lic.daysRemaining > 0) { statusEl.innerHTML = `<i class="fas fa-calendar-check"></i> Licença: ${lic.daysRemaining} dias`; statusEl.style.color = '#fff'; } 
                else { statusEl.innerHTML = `<i class="fas fa-lock"></i> Licença EXPIRADA`; statusEl.style.color = '#ff8a80'; }
            }
            if (lic.daysRemaining <= 0) { this.showLockScreen(); return false; }
            return true;
        },
        showLockScreen() {
            document.getElementById('app-layout').style.display = 'none';
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('lock-screen').style.display = 'flex';
        },
        generateCode() {
            app.state.lastGeneratedCode = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;
            return app.state.lastGeneratedCode;
        },
        initRequestFlow() {
            const days = prompt("Quantos dias deseja adquirir? (Informe múltiplo de 30: 30, 60, 90...)");
            if (!days) return null;
            const daysNum = parseInt(days);
            if (isNaN(daysNum) || daysNum <= 0 || daysNum % 30 !== 0) { alert("Erro: O número de dias deve ser um múltiplo de 30."); return null; }
            const code = this.generateCode();
            const settings = app.db.getSettings();
            const msg = encodeURIComponent(`Olá, gostaria de liberar o sistema AgriManager.\n\nCódigo: ${code}\nDias Solicitados: ${daysNum}`);
            window.open(`https://wa.me/${settings.supportPhone || ''}?text=${msg}`, '_blank');
            return code; 
        },
        requestDaysLockScreen() { this.initRequestFlow(); },
        validate(inputCode, inputPass) {
            const X = parseInt(inputCode); const Y = parseInt(inputPass); 
            if (!X || !Y) return false;
            const baseCalculation = ((X + this.constA) * this.constB) + this.constC;
            const daysRequested = Y - baseCalculation;
            return (daysRequested > 0 && daysRequested % 30 === 0) ? daysRequested : false;
        },
        addDays(days) {
            const lic = app.db.getLicense();
            if(lic.daysRemaining < 0) lic.daysRemaining = 0;
            lic.daysRemaining += days;
            lic.lastCheckDate = new Date().toISOString().split('T')[0];
            app.db.saveLicense(lic);
            return lic.daysRemaining;
        },
        unlock(e) {
            e.preventDefault();
            const pass = document.getElementById('unlock-pass').value;
            const code = app.state.lastGeneratedCode;
            if (!code) { alert("Por favor, solicite um código primeiro."); return; }
            const days = this.validate(code, pass);
            if (days) {
                this.addDays(days); alert(`Sucesso! Adicionados ${days} dias de licença.`);
                document.getElementById('lock-screen').style.display = 'none'; app.auth.check();
            } else { alert('Código de liberação inválido ou número de dias incorreto (deve ser múltiplo de 30).'); }
        }
    },

    // --- SISTEMA DE ALERTAS (CORRIGIDO) ---
    system: {
        init() { this.restartAlertLoop(); },
        restartAlertLoop() {
            if (app.state.alertIntervalId) clearInterval(app.state.alertIntervalId);
            const settings = app.db.getSettings();
            const intervalMs = (settings.alertInterval || 60) * 60 * 1000;
            this.checkAlerts(); 
            app.state.alertIntervalId = setInterval(() => { this.checkAlerts(); }, intervalMs);
        },
        checkAlerts() {
            const settings = app.db.getSettings();
            if(!settings.visualEnabled && !settings.soundEnabled) return;
            const maintenances = app.db.get('maintenances');
            const machinery = app.db.get('machinery');
            const today = new Date();
            let hasAlert = false;

            maintenances.forEach(m => {
                if (m.status !== 'Executada' && m.date) {
                    const mDate = new Date(m.date);
                    const diffHours = (mDate - today) / (1000 * 60 * 60); 
                    if (diffHours <= settings.alertLeadTime) {
                        const machineName = app.db.getById('machinery', m.machineId)?.name || 'Máquina desconhecida';
                        this.triggerAlert(`Manutenção Próxima: ${machineName}`, `Prevista para ${app.utils.formatDate(m.date)} (${m.type})`, diffHours < 0);
                        hasAlert = true;
                    }
                }
            });

            machinery.forEach(mac => {
                if (mac.currentHour && mac.maintenanceInterval > 0) {
                    const lastMnt = maintenances.filter(m => m.machineId === mac.id && m.status === 'Executada').sort((a,b) => new Date(b.date) - new Date(a.date))[0];
                    if (lastMnt && lastMnt.nextMaintenance) {
                        const remaining = parseFloat(lastMnt.nextMaintenance) - parseFloat(mac.currentHour || 0);
                        if (remaining <= 50 && remaining > 0) {
                            this.triggerAlert(`Manutenção por Horímetro: ${mac.name}`, `Faltam ${remaining}h`, false); hasAlert = true;
                        } else if (remaining <= 0) {
                            this.triggerAlert(`Manutenção Vencida: ${mac.name}`, `Ultrapassou ${Math.abs(remaining)}h`, true); hasAlert = true;
                        }
                    }
                }
            });
            if (hasAlert && settings.soundEnabled) this.playSound();
        },
        triggerAlert(title, message, isCritical) {
            const container = document.getElementById('alert-container');
            const toast = document.createElement('div');
            toast.className = `alert-toast ${isCritical ? 'critical' : ''}`;
            toast.innerHTML = `<div class="alert-content"><h4>${title}</h4><p>${message}</p></div><i class="fas fa-times close-alert" onclick="this.parentElement.remove()"></i>`;
            container.appendChild(toast);
        },
        // CORREÇÃO AQUI: Tratamento de erro para AudioContext bloqueado
        playSound() {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                
                const ctx = new AudioContext();
                // Verifica estado suspenso (comum quando não há interação do usuário)
                if (ctx.state === 'suspended') {
                    ctx.resume().catch(() => {});
                }
                
                const osc = ctx.createOscillator();
                osc.type = 'sine'; 
                osc.frequency.setValueAtTime(880, ctx.currentTime); 
                osc.connect(ctx.destination); 
                osc.start(); 
                osc.stop(ctx.currentTime + 0.5); 
            } catch(e) {
                // Silencia erro de autoplay para não travar a aplicação
                console.warn("Alerta sonoro bloqueado pelo navegador (falta de interação do usuário).");
            }
        }
    },

    // --- UTILITÁRIOS ---
    utils: {
        uuid: () => Date.now().toString(36) + Math.random().toString(36).substr(2),
        formatCurrency: (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val),
        formatDate: (dateStr) => { if(!dateStr) return '-'; const [y, m, d] = dateStr.split('-'); return `${d}/${m}/${y}`; }
    },

    // --- AUTENTICAÇÃO ---
    auth: {
        check() {
            const session = localStorage.getItem('agri_session');
            if (session) {
                app.state.currentUser = JSON.parse(session);
                if (!app.license.checkStatus()) return;
                document.getElementById('auth-screen').style.display = 'none';
                document.getElementById('lock-screen').style.display = 'none';
                document.getElementById('app-layout').style.display = 'flex';
                document.getElementById('user-display').innerText = app.state.currentUser.name;
                app.system.init(); 
                app.router.go('dashboard');
            } else {
                document.getElementById('auth-screen').style.display = 'flex';
                document.getElementById('app-layout').style.display = 'none';
                document.getElementById('lock-screen').style.display = 'none';
                this.switchView('login');
            }
        },
        switchView(viewName) {
            document.querySelectorAll('.auth-view').forEach(el => el.classList.remove('active'));
            document.getElementById(`view-${viewName}`).classList.add('active');
            document.querySelectorAll('form').forEach(f => f.reset());
        },
        login(e) {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            const user = app.db.findUser(email);
            if (user && user.pass === pass) this.createSession(user);
            else alert('E-mail ou senha incorretos.');
        },
        googleLogin() {
            const btn = document.querySelector('.btn-google');
            const txt = btn.innerHTML; btn.innerHTML = 'Conectando...';
            setTimeout(() => { this.createSession({ id: 'google_'+app.utils.uuid(), name: 'Usuário Google', email: 'google_user@gmail.com', provider: 'google' }); btn.innerHTML = txt; }, 1000);
        },
        register(e) {
            e.preventDefault();
            const form = e.target;
            if(app.db.createUser(form['reg-name'].value, form['reg-email'].value, form['reg-pass'].value)) {
                alert('Conta criada com sucesso! Você tem 30 dias de avaliação.');
                this.switchView('login');
            } else alert('E-mail já cadastrado.');
        },
        forgotPassword(e) { e.preventDefault(); alert('Link enviado.'); this.switchView('login'); },
        createSession(user) { localStorage.setItem('agri_session', JSON.stringify({ ...user, pass: null })); this.check(); },
        logout() { if(confirm('Sair?')) { localStorage.removeItem('agri_session'); window.location.reload(); } }
    },

    // --- ROTEAMENTO ---
    router: {
        go(route) {
            if (!app.license.checkStatus()) return;
            app.state.currentView = route;
            document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
            const navItem = document.getElementById(`nav-${route}`);
            if(navItem) navItem.classList.add('active');
            document.querySelector('aside').classList.remove('open');

            const container = document.getElementById('content-area');
            const title = document.getElementById('page-title');

            switch(route) {
                case 'dashboard': title.innerText = 'Dashboard Geral'; app.ui.renderDashboard(container); break;
                case 'financeiro': title.innerText = 'Gestão Financeira'; app.ui.renderFinancials(container); break;
                case 'fazendas': title.innerText = 'Gestão de Fazendas'; app.ui.renderEntityList(container, 'farms', 'Fazendas', ['Nome', 'Proprietário', 'Área (ha)', 'Local'], ['name', 'owner', 'area', 'location']); break;
                case 'talhoes': title.innerText = 'Gestão de Talhões'; app.ui.renderEntityList(container, 'plots', 'Talhões', ['Nome', 'Fazenda', 'Área (ha)', 'Solo', 'Status'], ['name', (row) => app.db.getById('farms', row.farmId)?.name || 'N/A', 'area', 'soilType', 'status']); break;
                case 'safras': title.innerText = 'Gestão de Safras'; app.ui.renderEntityList(container, 'crops', 'Safras', ['Nome', 'Cultura', 'Status'], ['name', 'culture', 'status']); break;
                case 'cycles': title.innerText = 'Ciclos e Tarefas'; app.ui.renderEntityList(container, 'cycles', 'Ciclos', ['Nome', 'Tipo', 'Status', 'Início'], ['name', 'type', (r) => `<span class="status-badge badge-info">${r.status}</span>`, (r)=>app.utils.formatDate(r.startDate)]); break;
                case 'producao': title.innerText = 'Controle de Produção'; app.ui.renderEntityList(container, 'production', 'Colheitas', ['Data', 'Safra', 'Qtd', 'Unidade'], [(r)=>app.utils.formatDate(r.date), (r)=>app.db.getById('crops', r.safraId)?.name || 'N/A', 'quantity', 'unit']); break;
                case 'insumos': title.innerText = 'Estoque de Insumos'; app.ui.renderEntityList(container, 'inputs', 'Insumos', ['Nome', 'Categoria', 'Estoque', 'Unidade', 'Fornecedor'], ['name', 'category', 'quantity', 'unit', 'supplier']); break;
                case 'stock': title.innerText = 'Movimentação de Estoque'; app.ui.renderEntityList(container, 'stock_movements', 'Movimentação', ['Data', 'Insumo', 'Tipo', 'Qtd', 'Motivo'], [(r)=> r.date ? app.utils.formatDate(r.date) : '-',(r)=> app.db.getById('inputs', r.inputId)?.name || 'N/A',(r)=> `<span class="status-badge ${r.type==='Entrada'?'badge-income':'badge-expense'}">${r.type}</span>`,'quantity','motive']); break;
                case 'machinery': title.innerText = 'Máquinas e Implementos'; app.ui.renderEntityList(container, 'machinery', 'Equipamento', ['Nome', 'Tipo', 'Custo/h', 'Horímetro', 'Status'], ['name', 'type', (r)=>app.utils.formatCurrency(r.costPerHour || 0), 'currentHour', 'status']); break;
                case 'maintenances': title.innerText = 'Manutenções'; app.ui.renderEntityList(container, 'maintenances', 'Manutenção', ['Equipamento', 'Tipo', 'Data', 'Custo', 'Status'], [(r)=>app.db.getById('machinery', r.machineId)?.name || 'N/A', 'type', (r)=>app.utils.formatDate(r.date), (r)=>app.utils.formatCurrency(r.cost), 'status']); break;

                case 'relatorios': title.innerText = 'Central de Relatórios'; app.ui.renderReports(container); break;
                case 'settings': title.innerText = 'Configurações e Licença'; app.ui.renderSettings(container); break;
            }
        }
    },

    // --- UI ---
    ui: {
        toggleSidebar() { document.querySelector('aside').classList.toggle('open'); },
        closeModal() { document.getElementById('generic-modal').style.display = 'none'; },

        // --- BACKUP & RESTORE ---
        downloadBackup() {
            const data = localStorage.getItem('agri_data');
            const blob = new Blob([data], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `backup_agrimanager_${new Date().toISOString().slice(0,10)}.json`; a.click();
        },
        triggerRestore() { document.getElementById('restore-input').click(); },
        restoreData(input) {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const json = JSON.parse(e.target.result);
                    if(json.farms && json.users) {
                        localStorage.setItem('agri_data', JSON.stringify(json));
                        alert('Dados restaurados com sucesso!');
                        location.reload();
                    } else alert('Arquivo inválido.');
                } catch(err) { alert('Erro: ' + err.message); }
            };
            reader.readAsText(file);
        },

        // --- LÓGICA DE DADOS PARA RELATÓRIOS ---
        getReportData(type) {
            let headers = [], body = [], title = '';
            
            const entityMap = {
                'users': 'Usuários', 'farms': 'Fazendas', 'plots': 'Talhões', 'crops': 'Safras',
                'cycles': 'Ciclos', 'inputs': 'Insumos', 'stock_movements': 'Movimentação Estoque',
                'machinery': 'Máquinas', 'maintenances': 'Manutenções', 'production': 'Produção', 'financials': 'Financeiro'
            };

            if (entityMap[type]) {
                const config = this.getEntityColumns(type);
                headers = config.headers;
                const data = app.db.get(type);
                body = data.map(item => config.fields.map(f => typeof f === 'function' ? f(item) : item[f]));
                title = `Relatório de ${entityMap[type]}`;
            } 
            else if (type === 'analysis_crop') {
                title = 'Analítico: Despesa x Receita (Safra)';
                headers = ['Safra', 'Custo Total', 'Receita Real', 'Margem'];
                const crops = app.db.get('crops');
                body = crops.map(c => {
                    const rev = c.realProduction * c.pricePerKg || 0;
                    const cost = c.totalCost || 0;
                    return [c.name, app.utils.formatCurrency(cost), app.utils.formatCurrency(rev), app.utils.formatCurrency(rev - cost)];
                });
            } else if (type === 'analysis_plot') {
                title = 'Analítico: Despesa x Receita (Talhão)';
                headers = ['Talhão', 'Custo Total', 'Receita Total', 'Resultado'];
                const plots = app.db.get('plots');
                const crops = app.db.get('crops');
                body = plots.map(p => {
                    const pCrops = crops.filter(c => c.plotId === p.id);
                    const cost = pCrops.reduce((acc, c) => acc + (c.totalCost || 0), 0);
                    const rev = pCrops.reduce((acc, c) => acc + ((c.realProduction * c.pricePerKg) || 0), 0);
                    return [p.name, app.utils.formatCurrency(cost), app.utils.formatCurrency(rev), app.utils.formatCurrency(rev - cost)];
                });
            }
            return { title, headers, body };
        },

        getEntityColumns(entity) {
            switch(entity) {
                case 'farms': return { headers: ['Nome', 'Proprietário', 'Área', 'Local'], fields: ['name', 'owner', 'area', 'location'] };
                case 'plots': return { headers: ['Nome', 'Fazenda', 'Área', 'Solo', 'Status'], fields: ['name', (i)=>app.db.getById('farms', i.farmId)?.name, 'area', 'soilType', 'status'] };
                case 'crops': return { headers: ['Nome', 'Cultura', 'Status', 'Plantio', 'Colheita Prev.'], fields: ['name', 'culture', 'status', 'plantingDate', 'expectedHarvestDate'] };
                case 'cycles': return { headers: ['Nome', 'Tipo', 'Status', 'Início', 'Fim'], fields: ['name', 'type', 'status', 'startDate', 'endDate'] };
                case 'production': return { headers: ['Data', 'Safra', 'Qtd', 'Unidade'], fields: ['date', (i)=>app.db.getById('crops', i.safraId)?.name, 'quantity', 'unit'] };
                case 'inputs': return { headers: ['Nome', 'Categoria', 'Estoque', 'Unidade', 'Fornecedor'], fields: ['name', 'category', 'quantity', 'unit', 'supplier'] };
                case 'financials': return { headers: ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor'], fields: ['date', 'type', 'category', 'description', (i)=>app.utils.formatCurrency(i.value)] };
                case 'stock_movements': return { headers: ['Data', 'Insumo', 'Tipo', 'Qtd', 'Motivo'], fields: ['date', (i)=>app.db.getById('inputs', i.inputId)?.name, 'type', 'quantity', 'motive'] };
                case 'machinery': return { headers: ['Nome', 'Tipo', 'Custo/h', 'Horas', 'Status'], fields: ['name', 'type', 'costPerHour', 'currentHour', 'status'] };
                case 'maintenances': return { headers: ['Equipamento', 'Tipo', 'Data', 'Custo', 'Status'], fields: [(i)=>app.db.getById('machinery', i.machineId)?.name, 'type', 'date', (i)=>app.utils.formatCurrency(i.cost), 'status'] };
                case 'users': return { headers: ['Nome', 'E-mail', 'Tipo'], fields: ['name', 'email', 'provider'] };
                default: return { headers: [], fields: [] };
            }
        },

        // --- GERAÇÃO DE PDF E DOCX ---
        generatePDF(type, returnBlob = false) {
            const { jsPDF } = window.jspdf; 
            const doc = new jsPDF();
            const data = this.getReportData(type);

            doc.setFillColor(46, 125, 50); 
            doc.rect(0, 0, 210, 20, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.text("AgriManager", 14, 13);
            doc.setFontSize(10);
            doc.text(`Gerado em: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 150, 13);

            doc.setTextColor(46, 125, 50);
            doc.setFontSize(14);
            doc.text(data.title.toUpperCase(), 14, 30);

            doc.autoTable({ 
                head: [data.headers], body: data.body, startY: 35, 
                theme: 'grid', headStyles: { fillColor: [46, 125, 50] },
                styles: { fontSize: 9, cellPadding: 3 }
            });

            const pageCount = doc.internal.getNumberOfPages();
            for(let i = 1; i <= pageCount; i++) {
                doc.setPage(i); doc.setFontSize(8); doc.setTextColor(100);
                doc.text('Página ' + i + ' de ' + pageCount, 105, 290, null, null, "center");
            }

            if (returnBlob) return doc.output('bloburl');
            doc.save(`${type}_agrimanager.pdf`);
        },

        exportEntityPDF(entity) {
             this.loadReportView(entity);
        },

        exportEntityDOCX(type) {
            const data = this.getReportData(type);
            let tableRows = data.body.map(row => {
                let tds = row.map(val => `<td>${val || '-'}</td>`).join('');
                return `<tr>${tds}</tr>`;
            }).join('');
            
            const html = `
                <html><head><meta charset='utf-8'></head><body>
                <h2 style="color:#2e7d32; font-family: sans-serif;">AgriManager - ${data.title}</h2>
                <p>Gerado em: ${new Date().toLocaleString()}</p>
                <table border="1" style="border-collapse:collapse;width:100%;font-family:sans-serif;">
                    <tr style="background:#2e7d32;color:white;font-weight:bold">
                        ${data.headers.map(h=>`<td style="padding:5px">${h}</td>`).join('')}
                    </tr>
                    ${tableRows}
                </table></body></html>`;
            
            const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
            const link = document.createElement('a'); 
            link.href = URL.createObjectURL(blob); link.download = `${type}_agrimanager.doc`; link.click();
        },

        // --- VIEWER DE RELATÓRIOS ---
        loadReportView(type) {
            app.state.currentReportType = type;
            const container = document.getElementById('report-content-area') || document.getElementById('content-area');
            const data = this.getReportData(type);
            
            let rows = data.body.length ? data.body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${data.headers.length}">Sem dados.</td></tr>`;
            const htmlTable = `<table class="report-table"><thead><tr>${data.headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;

            const viewerHtml = `
                <div class="d-flex">
                    <h3 style="color:var(--primary-dark)">${data.title}</h3>
                    <button class="btn btn-outline" onclick="app.router.go('relatorios')"><i class="fas fa-arrow-left"></i> Voltar</button>
                </div>
                
                <div class="report-toolbar">
                    <div class="report-toolbar-group">
                        <button class="btn btn-sm btn-active" id="btn-view-list" onclick="app.ui.toggleReportMode('list')"><i class="fas fa-list"></i> Listagem</button>
                        <button class="btn btn-sm btn-outline" id="btn-view-pdf" onclick="app.ui.toggleReportMode('pdf')"><i class="fas fa-file-pdf"></i> Visualizar PDF</button>
                    </div>
                    <div class="report-toolbar-group">
                        <button class="btn btn-sm btn-success" onclick="app.ui.generatePDF('${type}')"><i class="fas fa-download"></i> Baixar PDF</button>
                        <button class="btn btn-sm btn-info" onclick="app.ui.exportEntityDOCX('${type}')"><i class="fas fa-file-word"></i> Baixar DOCX</button>
                    </div>
                </div>

                <div id="view-list" class="view-section active card">
                    ${htmlTable}
                </div>
                <div id="view-pdf" class="view-section card">
                    <iframe id="pdf-frame" class="pdf-viewer-frame" title="Duplo clique para ampliar"></iframe>
                </div>
            `;
            container.innerHTML = viewerHtml;

            // ADICIONAR EVENT LISTENER PARA ZOOM NO PDF (Duplo Clique)
            const pdfContainer = document.getElementById('view-pdf');
            if(pdfContainer) {
                pdfContainer.addEventListener('dblclick', function() {
                    const iframe = document.getElementById('pdf-frame');
                    iframe.classList.toggle('pdf-fullscreen');
                });
            }
        },

        toggleReportMode(mode) {
            document.getElementById('btn-view-list').className = mode === 'list' ? 'btn btn-sm btn-active' : 'btn btn-sm btn-outline';
            document.getElementById('btn-view-pdf').className = mode === 'pdf' ? 'btn btn-sm btn-active' : 'btn btn-sm btn-outline';
            
            document.getElementById('view-list').classList.remove('active');
            document.getElementById('view-pdf').classList.remove('active');
            document.getElementById(`view-${mode}`).classList.add('active');

            if (mode === 'pdf') {
                const frame = document.getElementById('pdf-frame');
                frame.style.display = 'block';
                if (!frame.src || frame.src === 'about:blank') {
                    frame.src = this.generatePDF(app.state.currentReportType, true);
                }
            }
        },

        // CORREÇÃO: Função restaurada
        renderReports(container) {
            const sum = this.getFinancialSummary();
            
            container.innerHTML = `
                <div class="d-flex"><h3>Central de Relatórios</h3></div>
                
                <div class="report-grid" id="main-report-menu">
                    
                    <!-- 1. Consolidado (Dash rápido) -->
                    <div class="card report-section">
                        <h4><i class="fas fa-chart-pie"></i> Consolidado Geral</h4>
                        <table class="report-table">
                            <tr><td>Receita Bruta</td><td class="text-right text-income">${app.utils.formatCurrency(sum.totalIncome)}</td></tr>
                            <tr><td>Despesa Total</td><td class="text-right text-expense">${app.utils.formatCurrency(sum.totalExpense)}</td></tr>
                            <tr style="font-size: 1.1rem; border-top: 2px solid #eee;">
                                <td><strong>Saldo Líquido</strong></td>
                                <td class="text-right"><strong>${app.utils.formatCurrency(sum.totalIncome - sum.totalExpense)}</strong></td>
                            </tr>
                        </table>
                    </div>

                    <!-- 2. Relatórios Analíticos (Botões de Ação) -->
                    <div class="card report-section">
                        <h4><i class="fas fa-chart-line"></i> Relatórios Analíticos</h4>
                        <p style="font-size:0.9rem; color:#666; margin-bottom:1rem;">Análise detalhada de custos e receitas.</p>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <button class="btn btn-outline" onclick="app.ui.loadReportView('analysis_crop')"><i class="fas fa-seedling"></i> Despesa x Receita por Safra</button>
                            <button class="btn btn-outline" onclick="app.ui.loadReportView('analysis_plot')"><i class="fas fa-vector-square"></i> Despesa x Receita por Talhão</button>
                        </div>
                    </div>

                    <!-- 3. Relatórios Cadastrais (Listas Completas) -->
                    <div class="card report-section" style="grid-column: 1 / -1;">
                        <h4><i class="fas fa-list"></i> Relatórios de Cadastros</h4>
                        <p style="margin-bottom: 1rem; color: #666; font-size: 0.9rem;">Selecione para visualizar, imprimir ou exportar (PDF/DOCX).</p>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('users')">Usuários</button>
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('farms')">Fazendas</button>
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('plots')">Talhões</button>
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('crops')">Safras</button>
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('cycles')">Ciclos</button>
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('inputs')">Insumos</button>
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('stock_movements')">Estoque</button>
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('machinery')">Máquinas</button>
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('maintenances')">Manutenções</button>
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('production')">Produção</button>
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('financials')">Financeiro</button>
                        </div>
                    </div>
                </div>
                <!-- Container onde o viewer será renderizado se chamado -->
                <div id="report-content-area"></div>
            `;
        },

        renderDashboard(container) {
            const farms = app.db.get('farms');
            const financial = app.db.get('financials');
            const lic = app.db.getLicense();
            const totalArea = farms.reduce((acc, f) => acc + Number(f.area || 0), 0);
            const totalCost = financial.filter(f => f.type === 'expense').reduce((acc, e) => acc + Number(e.value || 0), 0);
            const totalRevenue = financial.filter(f => f.type === 'income').reduce((acc, e) => acc + Number(e.value || 0), 0);
            
            container.innerHTML = `
                <div class="dashboard-grid">
                    <div class="card"><h3>Fazendas / Área</h3><div class="value">${farms.length} / ${totalArea}ha</div><i class="fas fa-warehouse icon"></i></div>
                    <div class="card"><h3>Receita Total</h3><div class="value" style="color: var(--success)">${app.utils.formatCurrency(totalRevenue)}</div><i class="fas fa-coins icon"></i></div>
                    <div class="card"><h3>Despesa Total</h3><div class="value" style="color: var(--danger)">${app.utils.formatCurrency(totalCost)}</div><i class="fas fa-money-bill-wave icon"></i></div>
                    <div class="card" style="border-left: 5px solid ${lic.daysRemaining > 0 ? 'var(--primary-color)' : 'var(--danger)'}">
                        <h3>Licença de Uso</h3>
                        <div class="value" style="font-size: 1.5rem;">${lic.daysRemaining} Dias</div>
                        <small style="color: #666;">Status: ${lic.daysRemaining > 0 ? 'Ativo' : 'Expirado'}</small>
                        <i class="fas fa-key icon"></i>
                    </div>
                </div>
                <div class="charts-container"><div class="chart-box"><canvas id="chartFinancial"></canvas></div><div class="chart-box"><canvas id="chartProduction"></canvas></div></div>
            `;
            setTimeout(() => this.initCharts(app.db.get('production'), financial), 100);
        },

        initCharts(prodData, finData) {
            const income = finData.filter(x=>x.type==='income').reduce((acc,x)=>acc+Number(x.value),0);
            const expense = finData.filter(x=>x.type==='expense').reduce((acc,x)=>acc+Number(x.value),0);
            new Chart(document.getElementById('chartFinancial'), { type: 'doughnut', data: { labels: ['Receitas', 'Despesas'], datasets: [{ data: [income, expense], backgroundColor: ['#388e3c', '#d32f2f'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Balanço Financeiro' } } } });
            new Chart(document.getElementById('chartProduction'), { type: 'bar', data: { labels: prodData.map(p => app.utils.formatDate(p.date)), datasets: [{ label: 'Produção', data: prodData.map(p => p.quantity), backgroundColor: '#2e7d32' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Registros de Produção' } } } });
        },

        renderFinancials(container) {
            const data = app.db.get('financials');
            let html = `<div class="d-flex"><div><input type="text" placeholder="Buscar..." class="form-control" style="width: 250px;" onkeyup="app.ui.filterTable(this)"></div>
                    <div><button class="btn btn-outline" onclick="app.ui.exportEntityPDF('financials')" title="PDF"><i class="fas fa-file-pdf"></i></button><button class="btn btn-outline" onclick="app.ui.exportEntityDOCX('financials')" title="DOCX"><i class="fas fa-file-word"></i></button><button class="btn btn-primary" onclick="app.ui.openForm('financials')"><i class="fas fa-plus"></i> Novo Lançamento</button></div></div>
                <div class="table-container"><table id="dataTable"><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Status</th><th class="text-right">Ações</th></tr></thead><tbody>`;
            if(data.length === 0) html += `<tr><td colspan="7" style="text-align:center; padding: 2rem;">Nenhum lançamento.</td></tr>`;
            data.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(item => {
                const isInc = item.type === 'income';
                html += `<tr><td>${app.utils.formatDate(item.date)}</td><td><span class="status-badge ${isInc ? 'badge-income' : 'badge-expense'}">${isInc ? 'Receita' : 'Despesa'}</span></td><td>${item.category}</td><td>${item.description}</td><td class="${isInc ? 'text-income' : 'text-expense'}">${app.utils.formatCurrency(item.value)}</td><td>${item.status}</td><td class="text-right"><button class="btn btn-sm btn-outline" onclick="app.ui.openForm('financials', '${item.id}')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger" onclick="app.ui.deleteItem('financials', '${item.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
            });
            html += `</tbody></table></div>`;
            container.innerHTML = html;
        },

        renderEntityList(container, entityKey, entityName, headers, fields) {
            const data = app.db.get(entityKey);
            const btnLabel = entityKey === 'stock_movements' ? 'Nova Movimentação' : `Novo ${entityName}`;
            const btnIcon = entityKey === 'stock_movements' ? 'fas fa-exchange-alt' : 'fas fa-plus';
            const clickAction = entityKey === 'stock_movements' ? `app.ui.openForm('stock_movement')` : `app.ui.openForm('${entityKey}')`;
            let html = `<div class="d-flex"><div><input type="text" placeholder="Buscar..." class="form-control" style="width: 250px;" onkeyup="app.ui.filterTable(this)"></div>
                    <div><button class="btn btn-outline" onclick="app.ui.exportEntityPDF('${entityKey}')" title="PDF"><i class="fas fa-file-pdf"></i></button><button class="btn btn-outline" onclick="app.ui.exportEntityDOCX('${entityKey}')" title="DOCX"><i class="fas fa-file-word"></i></button><button class="btn btn-primary" onclick="${clickAction}"><i class="${btnIcon}"></i> ${btnLabel}</button></div></div>
                <div class="table-container"><table id="dataTable"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}<th class="text-right">Ações</th></tr></thead><tbody>`;
            if (data.length === 0) html += `<tr><td colspan="${headers.length + 1}" style="text-align:center; padding: 2rem;">Nenhum registro.</td></tr>`;
            else data.reverse().forEach(item => {
                html += `<tr>`;
                fields.forEach(field => { let val = typeof field === 'function' ? field(item) : item[field]; html += `<td>${val}</td>`; });
                html += `<td class="text-right">`;
                if(entityKey !== 'stock_movements') html += `<button class="btn btn-sm btn-outline" onclick="app.ui.openForm('${entityKey}', '${item.id}')"><i class="fas fa-edit"></i></button>`;
                html += `<button class="btn btn-sm btn-danger" onclick="app.ui.deleteItem('${entityKey}', '${item.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
            });
            html += `</tbody></table></div>`;
            container.innerHTML = html;
        },

        renderSettings(container) {
            const s = app.db.getSettings();
            const lic = app.db.getLicense();
            
            container.innerHTML = `
                <div style="display: grid; gap: 2rem;">
                    
                    <!-- LICENSING SECTION -->
                    <div class="card" style="max-width: 600px; margin: 0 auto; width: 100%; border-left: 5px solid var(--accent-color);">
                        <h3><i class="fas fa-key"></i> Licença de Uso</h3>
                        <div style="display:flex; justify-content:space-between; margin:1rem 0; background:#f9f9f9; padding:10px; border-radius:4px;">
                            <span>Dias Restantes: <strong>${lic.daysRemaining}</strong></span>
                            <span>Status: <strong style="color:${lic.daysRemaining > 0 ? 'var(--success)' : 'var(--danger)'}">${lic.daysRemaining > 0 ? 'Ativo' : 'Expirado'}</strong></span>
                        </div>
                        
                        <form onsubmit="app.ui.addLicenseDays(event)" style="border-top:1px solid #eee; padding-top:1rem;">
                            
                            <!-- Passo 1: Gerar Código Aleatório -->
                            <div class="form-group">
                                <label>1. Código do Sistema</label>
                                <div style="display:flex; gap:5px;">
                                    <input type="text" id="req-code" class="form-control" readonly placeholder="Clique em Gerar" style="font-weight:bold; letter-spacing:1px;">
                                    <button type="button" class="btn btn-outline" onclick="app.ui.generateReqCodeOnly()"><i class="fas fa-sync"></i> Gerar Número</button>
                                </div>
                            </div>

                            <!-- Passo 2: Informar Dias e Enviar -->
                            <div class="form-group">
                                <label>2. Dias de Crédito Pretendidos</label>
                                <div style="display:flex; gap:5px;">
                                    <input type="number" id="req-days" class="form-control" placeholder="Ex: 30, 60, 90..." step="30" oninput="app.ui.checkDaysInput(this)">
                                    <button type="button" class="btn btn-success" onclick="app.ui.sendWhatsappRequest()"><i class="fab fa-whatsapp"></i> Enviar WhatsApp</button>
                                </div>
                                <small id="days-warning" style="color:var(--danger); display:none; margin-top:5px;">* O número de dias deve ser múltiplo de 30.</small>
                            </div>

                            <!-- Passo 3: Contra-senha -->
                            <div class="form-group">
                                <label>3. Contra-senha</label>
                                <input type="number" name="counterPass" class="form-control" required placeholder="Digite o código recebido">
                            </div>

                            <button type="submit" class="btn btn-primary" style="width:100%"><i class="fas fa-check-circle"></i> Validar Senha</button>
                        </form>
                    </div>

                    <!-- ALERTS CONFIG -->
                    <div class="card" style="max-width: 600px; margin: 0 auto; width: 100%;">
                        <h3><i class="fas fa-bell"></i> Configuração de Alertas</h3>
                        <form onsubmit="app.ui.saveSettings(event)" style="margin-top:1rem;">
                            <div class="grid-2-col">
                                <div class="form-group">
                                    <label>Antecedência de Alerta (Horas)</label>
                                    <input type="number" name="alertLeadTime" class="form-control" value="${s.alertLeadTime}" required>
                                </div>
                                <div class="form-group">
                                    <label>Repetição do Aviso (Minutos)</label>
                                    <input type="number" name="alertInterval" class="form-control" value="${s.alertInterval}" required>
                                </div>
                            </div>
                            <div class="grid-2-col">
                                <div class="form-group" style="display:flex; align-items:center; gap:10px;">
                                    <input type="checkbox" name="soundEnabled" id="chk-sound" ${s.soundEnabled?'checked':''} style="width:20px; height:20px;">
                                    <label for="chk-sound" style="margin:0;">Ativar Alerta Sonoro</label>
                                </div>
                                <div class="form-group" style="display:flex; align-items:center; gap:10px;">
                                    <input type="checkbox" name="visualEnabled" id="chk-visual" ${s.visualEnabled?'checked':''} style="width:20px; height:20px;">
                                    <label for="chk-visual" style="margin:0;">Ativar Alerta Visual</label>
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary" style="width:100%">Salvar Preferências</button>
                        </form>
                    </div>

                    <div class="card" style="max-width: 600px; margin: 0 auto; width: 100%;">
                        <h3><i class="fas fa-database"></i> Ambiente de Testes</h3>
                        <p style="margin: 1rem 0; color: #666;">Gera registros de exemplo sem apagar seus dados atuais. Ideal para conhecer o sistema.</p>
                        <button class="btn btn-warning" style="width: 100%;" onclick="if(confirm('Isso adicionará dados de demonstração ao seu banco atual. Continuar?')){ app.db.seedDemoData(); }"><i class="fas fa-magic"></i> Gerar Dados Demo</button>
                    </div>
                    <div class="card" style="max-width: 600px; margin: 0 auto; width: 100%;">
                        <h3><i class="fas fa-hdd"></i> Backup e Restauração</h3>
                        <div style="display: flex; gap: 1rem; margin-top:1rem;"><button class="btn btn-primary" style="flex: 1;" onclick="app.ui.downloadBackup()"><i class="fas fa-download"></i> Backup Dados</button><button class="btn btn-outline" style="flex: 1;" onclick="app.ui.triggerRestore()"><i class="fas fa-upload"></i> Restaurar Dados</button></div>
                    </div>
                </div>`;
        },

        // --- LÓGICA DE UI DA LICENÇA ---
        
        generateReqCodeOnly() {
            const code = app.license.generateCode();
            document.getElementById('req-code').value = code;
        },

        checkDaysInput(input) {
            const val = parseInt(input.value);
            const warning = document.getElementById('days-warning');
            if (val > 0 && val % 30 !== 0) {
                warning.style.display = 'block';
            } else {
                warning.style.display = 'none';
            }
        },

        sendWhatsappRequest() {
            const code = app.state.lastGeneratedCode;
            if (!code) {
                alert("Por favor, clique em 'Gerar Número' primeiro.");
                return;
            }

            const daysInput = document.getElementById('req-days');
            const daysNum = parseInt(daysInput.value);

            if (isNaN(daysNum) || daysNum <= 0 || daysNum % 30 !== 0) {
                alert("O número de dias deve ser um múltiplo de 30 (ex: 30, 60, 90).");
                return;
            }

            const settings = app.db.getSettings();
            const msg = encodeURIComponent(`Olá, gostaria de liberar o sistema AgriManager.\n\nCódigo: ${code}\nDias Solicitados: ${daysNum}`);
            window.open(`https://wa.me/${settings.supportPhone || ''}?text=${msg}`, '_blank');
        },

        addLicenseDays(e) {
            e.preventDefault();
            const reqCode = app.state.lastGeneratedCode;
            if(!reqCode) { alert('Gere o código de solicitação primeiro.'); return; }
            
            const counterPass = e.target.counterPass.value;
            const days = app.license.validate(reqCode, counterPass);
            
            if(days) {
                app.license.addDays(days);
                alert(`Sucesso! Licença estendida em ${days} dias.`);
                app.router.go('settings'); 
            } else {
                alert('Contra-senha inválida.');
            }
        },

        saveSettings(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const newSettings = {
                alertLeadTime: Number(formData.get('alertLeadTime')),
                alertInterval: Number(formData.get('alertInterval')),
                soundEnabled: formData.get('soundEnabled') === 'on',
                visualEnabled: formData.get('visualEnabled') === 'on'
            };
            app.db.saveSettings(newSettings);
            alert('Configurações salvas!');
        },

        // RELATÓRIOS
        getFinancialSummary() {
            const financials = app.db.get('financials');
            const summary = { income: {}, expense: {}, totalIncome: 0, totalExpense: 0 };
            
            financials.forEach(f => {
                const val = parseFloat(f.value) || 0;
                if(f.type === 'income') {
                    summary.income[f.category] = (summary.income[f.category] || 0) + val;
                    summary.totalIncome += val;
                } else {
                    summary.expense[f.category] = (summary.expense[f.category] || 0) + val;
                    summary.totalExpense += val;
                }
            });
            return summary;
        },

        filterTable(input) {
            const filter = input.value.toUpperCase();
            const tr = document.getElementById("dataTable").getElementsByTagName("tr");
            for (let i = 1; i < tr.length; i++) {
                let visible = false;
                const tds = tr[i].getElementsByTagName("td");
                for(let j=0; j<tds.length; j++){ if (tds[j] && tds[j].innerText.toUpperCase().indexOf(filter) > -1) visible = true; }
                tr[i].style.display = visible ? "" : "none";
            }
        },

        updateStockInfo(select) {
            const id = select.value;
            const input = app.db.getById('inputs', id);
            document.getElementById('current-stock-display').value = input ? `${input.quantity} ${input.unit || ''}` : '';
        },

        saveSelectedMachine(select) {
            const val = select.value;
            if(val) localStorage.setItem('agri_pref_machine', val);
        },

        // LÓGICA DE SUGESTÃO DE CUSTO
        calcCycleCost() {
            const machSelect = document.getElementById('cycle-machine-select');
            const hoursInput = document.getElementById('cycle-hours-input');
            const costInput = document.getElementById('cycle-cost-input');
            
            if(machSelect && hoursInput && costInput) {
                const machineId = machSelect.value;
                const hours = parseFloat(hoursInput.value) || 0;
                
                if(machineId && hours > 0) {
                    const machine = app.db.getById('machinery', machineId);
                    if(machine && machine.costPerHour) {
                        // Sugere valor
                        costInput.value = (parseFloat(machine.costPerHour) * hours).toFixed(2);
                    }
                }
            }
        },

        toggleFinancialMachineFields(select) {
            const container = document.getElementById('financial-machine-fields');
            const valInput = document.getElementsByName('value')[0];
            if (select.value === 'Horas de Máquina') {
                container.classList.remove('hidden');
                valInput.setAttribute('readonly', true);
                valInput.value = '0.00';
                const prefMachine = localStorage.getItem('agri_pref_machine');
                if(prefMachine) {
                    const machSelect = document.getElementById('fin-machine-select');
                    if(machSelect) { machSelect.value = prefMachine; app.ui.calcMachineCost(); }
                }
            } else {
                container.classList.add('hidden');
                valInput.removeAttribute('readonly');
                valInput.value = '';
            }
        },
        calcMachineCost() {
            const select = document.getElementById('fin-machine-select');
            const machineId = select.value;
            app.ui.saveSelectedMachine(select); 

            const hours = parseFloat(document.getElementById('fin-machine-hours').value) || 0;
            const machine = app.db.getById('machinery', machineId);
            const valInput = document.getElementsByName('value')[0];
            
            if (machine && hours > 0) {
                const cost = hours * (parseFloat(machine.costPerHour) || 0);
                valInput.value = cost.toFixed(2);
            } else {
                valInput.value = '0.00';
            }
        },
        
        openForm(entity, id = null) {
            const item = id ? app.db.getById(entity, id) : {};
            const modal = document.getElementById('generic-modal');
            const title = document.getElementById('modal-title');
            title.innerText = id ? 'Editar Registro' : 'Novo Registro';
            if(entity === 'stock_movement') title.innerText = 'Movimentação de Estoque';
            
            const prefMachine = localStorage.getItem('agri_pref_machine');

            const getOptions = (table, labelKey, selectedId, autoSelectPref = false) => {
                return app.db.get(table).map(x => {
                    let isSelected = selectedId == x.id;
                    if(!selectedId && autoSelectPref && x.id === prefMachine) isSelected = true;
                    return `<option value="${x.id}" ${isSelected ? 'selected' : ''}>${x[labelKey]}</option>`;
                }).join('');
            };

            const getSimpleSelect = (name, label, options, selectedVal, extraAttr = '') => {
                const opts = options.map(o => `<option value="${o}" ${selectedVal === o ? 'selected' : ''}>${o}</option>`).join('');
                return `<div class="form-group"><label>${label}</label><select name="${name}" class="form-control" ${extraAttr} required>${opts}</select></div>`;
            };

            let fieldsHtml = '';
            switch(entity) {
                case 'farms': fieldsHtml = `${this.inputHtml('text', 'name', 'Nome', item.name, true)}${this.inputHtml('text', 'owner', 'Proprietário', item.owner)}${this.inputHtml('number', 'area', 'Área (ha)', item.area)}${this.inputHtml('text', 'location', 'Local', item.location)}`; break;
                case 'plots': fieldsHtml = `<div class="form-group"><label>Fazenda</label><select name="farmId" class="form-control" required><option value="">Selecione...</option>${getOptions('farms', 'name', item.farmId)}</select></div>${this.inputHtml('text', 'name', 'Identificação', item.name, true)}${this.inputHtml('number', 'area', 'Área', item.area)}${getSimpleSelect('soilType', 'Solo', ['Argiloso', 'Arenoso', 'Misto', 'Humoso'], item.soilType)}${getSimpleSelect('status', 'Status', ['Ativo', 'Em preparo', 'Em descanso', 'Inativo'], item.status || 'Ativo')}${this.inputHtml('textarea', 'notes', 'Obs', item.notes)}`; break;
                
                case 'financials': 
                    fieldsHtml = `
                        ${this.inputHtml('date', 'date', 'Data', item.date, true)}
                        <div class="form-group"><label>Tipo</label><select name="type" class="form-control"><option value="expense" ${item.type!='income'?'selected':''}>Despesa</option><option value="income" ${item.type=='income'?'selected':''}>Receita</option></select></div>
                        <div class="form-group">
                            <label>Categoria</label>
                            <select name="category" class="form-control" onchange="app.ui.toggleFinancialMachineFields(this)">
                                <option>Venda de Safra</option>
                                <option>Insumos</option>
                                <option>Mão de Obra</option>
                                <option>Manutenção</option>
                                <option>Horas de Máquina</option>
                                <option>Operacional</option>
                                <option>Combustível</option>
                                <option>Outros</option>
                            </select>
                        </div>
                        <div id="financial-machine-fields" class="card hidden" style="background:#f9f9f9; padding:10px; margin-bottom:10px;">
                            <p style="font-size:0.8rem; font-weight:bold; color:var(--primary-color);">Cálculo Automático</p>
                            <div class="form-group"><label>Máquina</label><select id="fin-machine-select" class="form-control" onchange="app.ui.calcMachineCost()"><option value="">Selecione...</option>${getOptions('machinery', 'name', null, true)}</select></div>
                            <div class="form-group"><label>Horas Trabalhadas</label><input type="number" id="fin-machine-hours" class="form-control" oninput="app.ui.calcMachineCost()"></div>
                        </div>

                        ${this.inputHtml('text', 'description', 'Descrição', item.description)}
                        ${this.inputHtml('number', 'value', 'Valor (R$)', item.value)}
                        <div class="form-group"><label>Status</label><select name="status" class="form-control"><option>Pago</option><option>Recebido</option><option>Pendente</option></select></div>
                    `; 
                    break;
                    
                case 'stock_movement': fieldsHtml = `<div class="form-group"><label>Insumo</label><select name="inputId" class="form-control" required onchange="app.ui.updateStockInfo(this)"><option value="">Selecione...</option>${getOptions('inputs', 'name', item.inputId)}</select></div><div class="form-group"><label>Estoque Atual</label><input type="text" id="current-stock-display" class="form-control" readonly></div><div class="form-group"><label>Tipo</label><select name="type" class="form-control"><option>Entrada</option><option>Saída</option></select></div><div class="grid-2-col"><div class="form-group"><label>Safra</label><select name="safraId" class="form-control"><option value="">Selecione...</option>${getOptions('crops', 'name', item.safraId)}</select></div></div>${this.inputHtml('text', 'motive', 'Motivo', '')}${this.inputHtml('number', 'quantity', 'Qtd', '', true)}`; break;
                
                case 'inputs':
                    fieldsHtml = `
                        ${this.inputHtml('text', 'name', 'Nome do Insumo', item.name, true)}
                        <div class="grid-2-col">
                            ${getSimpleSelect('category', 'Categoria', ['Fungicida', 'Inseticida', 'Adubo', 'Corretivo', 'Combustível', 'Outros'], item.category)}
                            ${getSimpleSelect('unit', 'Unidade', ['Quilograma (kg)', 'Litro (L)', 'Saco', 'Unidade', 'Tonelada'], item.unit)}
                        </div>
                        <div class="grid-2-col">
                            ${this.inputHtml('number', 'quantity', 'Quantidade (Qtd.)', item.quantity)}
                            ${this.inputHtml('text', 'location', 'Local de Armazenamento', item.location)}
                        </div>
                        <div class="grid-2-col">
                            ${this.inputHtml('text', 'supplier', 'Fornecedor', item.supplier)}
                            ${this.inputHtml('date', 'purchaseDate', 'Data de Compra', item.purchaseDate)}
                        </div>
                        <div class="grid-2-col">
                            ${this.inputHtml('number', 'price', 'Preço Unitário', item.price)}
                            ${this.inputHtml('text', 'batch', 'Lote', item.batch)}
                        </div>
                        <div class="grid-2-col">
                            ${this.inputHtml('date', 'expiryDate', 'Data de Validade', item.expiryDate)}
                            ${this.inputHtml('text', 'registry', 'Registro ANVISA / MAPA', item.registry)}
                        </div>
                    `;
                    break;
                    
                case 'crops': fieldsHtml = `${this.inputHtml('text', 'name', 'Nome', item.name, true)}${getSimpleSelect('culture', 'Cultura', ['Soja', 'Milho', 'Algodão', 'Café', 'Outro'], item.culture)}<div class="form-group"><label>Talhão</label><select name="plotId" class="form-control"><option value="">Selecione...</option>${getOptions('plots', 'name', item.plotId)}</select></div>${getSimpleSelect('status', 'Status', ['Planejada', 'Em andamento', 'Finalizada'], item.status)}${this.inputHtml('date', 'plantingDate', 'Plantio', item.plantingDate)}${this.inputHtml('date', 'expectedHarvestDate', 'Colheita Prev.', item.expectedHarvestDate)}${this.inputHtml('date', 'realHarvestDate', 'Colheita Real', item.realHarvestDate)}${this.inputHtml('number', 'expectedProduction', 'Prod. Esperada', item.expectedProduction)}${this.inputHtml('number', 'realProduction', 'Prod. Real', item.realProduction, false, 'oninput="app.ui.calcCropRevenue()"')}${this.inputHtml('number', 'pricePerKg', 'Preço/kg', item.pricePerKg, false, 'oninput="app.ui.calcCropRevenue()"')}${this.inputHtml('number', 'totalCost', 'Custo Total', item.totalCost)}<div class="form-group"><label>Receita</label><input type="text" id="calc-revenue" class="form-control" readonly></div>`; break;
                
                case 'cycles': 
                    fieldsHtml = `
                        ${this.inputHtml('text', 'name', 'Nome', item.name, true)}
                        ${getSimpleSelect('type', 'Tipo', ['Plantio', 'Manutenção', 'Colheita', 'Preparo'], item.type)}
                        ${getSimpleSelect('status', 'Status', ['Em andamento', 'Pendente', 'Concluído'], item.status)}
                        <div class="grid-2-col">
                            <div class="form-group"><label>Safra</label><select name="safraId" class="form-control"><option value="">Selecione...</option>${getOptions('crops', 'name', item.safraId)}</select></div>
                            <div class="form-group"><label>Talhão</label><select name="plotId" class="form-control"><option value="">Selecione...</option>${getOptions('plots', 'name', item.plotId)}</select></div>
                        </div>
                        <div class="form-section-title"><i class="fas fa-tractor"></i> Recursos e Custos</div>
                        <div class="grid-2-col">
                            <div class="form-group">
                                <label>Máquina</label>
                                <select name="machineId" id="cycle-machine-select" class="form-control" onchange="app.ui.saveSelectedMachine(this); app.ui.calcCycleCost()">
                                    <option value="">Selecione...</option>
                                    ${getOptions('machinery', 'name', item.machineId, true)}
                                </select>
                            </div>
                            <div class="form-group"><label>Implemento</label><select name="implementId" class="form-control"><option value="">Selecione...</option>${getOptions('machinery', 'name', item.implementId)}</select></div>
                        </div>
                        <div class="grid-2-col">
                            <div class="form-group"><label>Horas Trab.</label><input type="number" name="hours" id="cycle-hours-input" class="form-control" value="${item.hours || ''}" oninput="app.ui.calcCycleCost()"></div>
                            <div class="form-group"><label>Custo Operacional (R$)</label><input type="number" name="cost" id="cycle-cost-input" class="form-control" value="${item.cost || ''}" step="any"></div>
                        </div>
                        ${this.inputHtml('date', 'startDate', 'Início', item.startDate)}
                        ${this.inputHtml('date', 'endDate', 'Fim', item.endDate)}
                        ${this.inputHtml('textarea', 'description', 'Desc.', item.description)}
                    `; 
                    break;
                    
                case 'production': fieldsHtml = `${this.inputHtml('date', 'date', 'Data', item.date, true)}<div class="form-group"><label>Safra</label><select name="safraId" class="form-control" required><option value="">Selecione...</option>${getOptions('crops', 'name', item.safraId)}</select></div>${this.inputHtml('number', 'quantity', 'Qtd', item.quantity)}${this.inputHtml('text', 'unit', 'Un', item.unit)}`; break;
                
                case 'machinery':
                    fieldsHtml = `
                        ${this.inputHtml('text', 'name', 'Nome / Identificação', item.name, true)}
                        <div class="grid-2-col">
                            ${getSimpleSelect('type', 'Tipo', ['Máquina', 'Implemento'], item.type)}
                            ${getSimpleSelect('status', 'Status', ['Ativo', 'Em manutenção', 'Inativo'], item.status)}
                        </div>
                        <div class="grid-2-col">
                            ${this.inputHtml('text', 'brand', 'Marca', item.brand)}
                            ${this.inputHtml('text', 'model', 'Modelo', item.model)}
                        </div>
                        <div class="grid-2-col">
                            ${this.inputHtml('number', 'year', 'Ano', item.year)}
                            ${this.inputHtml('text', 'serial', 'Nº Série / Patrimônio', item.serial)}
                        </div>
                        <div class="form-section-title"><i class="fas fa-cogs"></i> Controle e Custo</div>
                        <div class="grid-2-col">
                            ${this.inputHtml('number', 'costPerHour', 'Custo por Hora (R$/h)', item.costPerHour)}
                            ${this.inputHtml('number', 'consumption', 'Consumo Médio (L)', item.consumption)}
                        </div>
                        <div class="grid-2-col">
                            ${this.inputHtml('number', 'initialHour', 'Horímetro Inicial', item.initialHour)}
                            ${this.inputHtml('number', 'currentHour', 'Horímetro Atual (Trabalhado)', item.currentHour || item.initialHour)}
                        </div>
                        <div class="form-section-title"><i class="fas fa-wrench"></i> Manutenção Programada</div>
                        <div class="grid-2-col">
                            ${this.inputHtml('number', 'maintenanceInterval', 'Intervalo (em horas)', item.maintenanceInterval)}
                            ${this.inputHtml('text', 'nextMaintenanceType', 'Tipo Próxima Manutenção', item.nextMaintenanceType)}
                        </div>
                        ${this.inputHtml('textarea', 'notes', 'Observações', item.notes)}
                    `;
                    break;

                case 'maintenances':
                    fieldsHtml = `
                        <div class="form-group">
                            <label>Máquina / Implemento</label>
                            <select name="machineId" class="form-control" required onchange="app.ui.saveSelectedMachine(this)">
                                <option value="">Selecione...</option>
                                ${getOptions('machinery', 'name', item.machineId, true)}
                            </select>
                        </div>
                        <div class="grid-2-col">
                            ${getSimpleSelect('type', 'Tipo Manutenção', ['Preventiva', 'Corretiva', 'Revisão'], item.type)}
                            ${getSimpleSelect('status', 'Status', ['Planejada', 'Executada'], item.status)}
                        </div>
                        <div class="grid-2-col">
                            ${this.inputHtml('date', 'date', 'Data', item.date, true)}
                            ${this.inputHtml('number', 'hourmeter', 'Horímetro na Manutenção', item.hourmeter)}
                        </div>
                        ${this.inputHtml('textarea', 'description', 'Descrição do Serviço', item.description)}
                        ${this.inputHtml('textarea', 'parts', 'Peças Utilizadas', item.parts)}
                        <div class="grid-2-col">
                            ${this.inputHtml('number', 'cost', 'Custo Total (R$)', item.cost)}
                            ${this.inputHtml('text', 'supplier', 'Fornecedor / Oficina', item.supplier)}
                        </div>
                        ${this.inputHtml('number', 'nextMaintenance', 'Próxima Manutenção (Horímetro Alvo)', item.nextMaintenance)}
                    `;
                    break;
            }

            const entityTarget = entity === 'stock_movement' ? 'stock_movements' : entity;
            document.getElementById('modal-body').innerHTML = `<form onsubmit="app.ui.saveForm(event, '${entityTarget}', '${id || ''}')">${fieldsHtml}<div class="text-right" style="margin-top: 1rem;"><button type="button" class="btn btn-outline" onclick="app.ui.closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div></form>`;
            modal.style.display = 'flex';
        },

        inputHtml(type, name, label, value, required = false, extraAttrs = '') {
            value = value || '';
            if(type === 'textarea') return `<div class="form-group"><label>${label}</label><textarea name="${name}" class="form-control" rows="3" ${extraAttrs}>${value}</textarea></div>`;
            return `<div class="form-group"><label>${label}</label><input type="${type}" name="${name}" class="form-control" value="${value}" ${required?'required':''} step="any" ${extraAttrs}></div>`;
        },
        saveForm(e, entity, id) { 
            e.preventDefault(); 
            const formData = new FormData(e.target); 
            const data = Object.fromEntries(formData.entries()); 
            if(id) data.id = id; 
            
            if(entity === 'stock_movements') { 
                data.date = new Date().toISOString().split('T')[0]; 
                const input = app.db.getById('inputs', data.inputId); 
                if(input) { 
                    const qty = parseFloat(data.quantity); 
                    let currentQty = parseFloat(input.quantity) || 0; 
                    if(data.type === 'Entrada') currentQty += qty; else currentQty -= qty; 
                    input.quantity = currentQty; 
                    app.db.save('inputs', input); 
                } 
            } 
            
            if (entity === 'maintenances' && data.status === 'Executada' && data.cost > 0 && !id) {
                    app.db.save('financials', {
                        date: data.date, type: 'expense', category: 'Manutenção', 
                        description: `Manutenção Auto: ${data.description}`, value: data.cost, status: 'Pago'
                    });
            }

            app.db.save(entity, data); 
            app.ui.closeModal(); 
            
            if (entity === 'maintenances' || entity === 'machinery') app.system.checkAlerts();

            if(entity === 'stock_movements') app.router.go('stock'); else app.router.go(app.state.currentView); 
        },
        deleteItem(entity, id) { if(confirm('Tem certeza que deseja excluir?')) { app.db.delete(entity, id); app.router.go(app.state.currentView); } }
    }
};

window.onload = () => { app.db.init(); app.auth.check(); };