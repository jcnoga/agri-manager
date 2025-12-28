/**
 * SISTEMA AGRIMANAGER - ARQUIVO PRINCIPAL JAVASCRIPT
 * Versão: Híbrida (LocalStorage + Firebase Sync)
 * Atualizações: Correção de Persistência de Dados Demo e Isolamento de Usuário
 */

window.app = {
    // --- CONFIGURAÇÃO E IDENTIFICAÇÃO DA APLICAÇÃO ---
    config: {
        // Este ID será substituído pelo UID do usuário ao fazer login para garantir privacidade
        appId: null, 
        
        firebase: {
          apiKey: "AIzaSyAY06PHLqEUCBzg9SjnH4N6xe9ZzM8OLvo",
          authDomain: "projeto-bfed3.firebaseapp.com",
          projectId: "projeto-bfed3",
          storageBucket: "projeto-bfed3.firebasestorage.app",
          messagingSenderId: "785289237066",
          appId: "1:785289237066:web:78bc967e8ac002b1d5ccb3"
        }
    },

    // --- ESTADO GLOBAL ---
    state: {
        currentUser: null,
        currentView: 'dashboard',
        alertIntervalId: null,
        lastGeneratedCode: null,
        currentReportType: null,
        isOnline: navigator.onLine
    },

    // --- MÓDULO DE NUVEM (SINCRONIZAÇÃO E FILA DE EMAILS) ---
    cloud: {
        db: null,
        auth: null,
        init() {
            try {
                if (typeof firebase === 'undefined') {
                    console.warn("SDK do Firebase não encontrado. Rodando em modo Offline.");
                    return;
                }
                if (!firebase.apps.length) {
                    firebase.initializeApp(app.config.firebase);
                }
                this.db = firebase.firestore();
                this.auth = firebase.auth();
                
                this.auth.onAuthStateChanged(user => {
                    if (user) {
                        // --- CORREÇÃO DE SEGURANÇA: ISOLAMENTO DE DADOS ---
                        // Define o ID do App como o UID do usuário. 
                        // Assim, ele só lê/escreve na própria pasta 'users/{UID}'.
                        app.config.appId = user.uid;
                        
                        console.log(`✅ Firebase: Conectado como ${user.email}`);
                        console.log(`🔒 Pasta do Usuário Segura: users/${app.config.appId}`);
                        
                        this.syncDown();
                    } else {
                        console.log("Firebase: Desconectado");
                    }
                });
            } catch (e) {
                console.warn("Firebase não configurado ou erro de inicialização. Modo Offline ativo.", e);
            }
        },

        // Salva Pedido de E-mail na Nuvem (Para processamento Backend)
        async queueEmail(emailData) {
            const mailItem = {
                id: app.utils.uuid(),
                to: emailData.to,
                message: {
                    subject: emailData.subject,
                    text: emailData.body,
                    html: emailData.body.replace(/\n/g, '<br>')
                },
                status: 'pending',
                createdAt: new Date().toISOString(),
                retryCount: 0
            };

            if (this.db && app.config.appId) {
                try {
                    // ALTERADO PARA CAMINHO SEGURO DO USUÁRIO
                    await this.db.collection('users')
                        .doc(app.config.appId)
                        .collection('mail_queue')
                        .doc(mailItem.id)
                        .set(mailItem);
                    console.log("☁️ E-mail enviado para a fila da nuvem com sucesso.");
                } catch (e) {
                    console.error("Erro ao enfileirar e-mail (Cloud):", e);
                }
            } else {
                console.warn("Offline: E-mail não pôde ser enfileirado na nuvem instantaneamente.");
            }
        },

        async save(table, item) {
            if (!this.db || !app.state.currentUser || !app.config.appId) return;
            // Não sincroniza se for conta local pura sem conexão
            if (app.state.currentUser.provider === 'local' && !this.auth.currentUser) return;

            try {
                // ALTERADO PARA CAMINHO SEGURO DO USUÁRIO
                // Retorna a promise para que quem chamar possa aguardar (usado no seedDemoData)
                return await this.db.collection('users')
                    .doc(app.config.appId)
                    .collection(table)
                    .doc(item.id)
                    .set(item, { merge: true });
            } catch (e) { console.error("Erro ao sincronizar salvamento:", e); }
        },

        async delete(table, id) {
            if (!this.db || !app.state.currentUser || !app.config.appId) return;
            try {
                // ALTERADO PARA CAMINHO SEGURO DO USUÁRIO
                await this.db.collection('users')
                    .doc(app.config.appId)
                    .collection(table)
                    .doc(id)
                    .delete();
            } catch (e) { console.error("Erro ao sincronizar exclusão:", e); }
        },

        async syncDown() {
            if (!this.db || !app.config.appId) return;
            const tables = Object.keys(app.db.schema).filter(k => Array.isArray(app.db.schema[k]));
            
            // Limpa dados locais antes de baixar (para evitar mistura entre usuários se estiver no mesmo PC)
            // Agora garantimos que usamos a estrutura local correta
            let localData = JSON.parse(localStorage.getItem('agri_data')) || JSON.parse(JSON.stringify(app.db.schema));
            
            for (const table of tables) {
                try {
                    // ALTERADO PARA CAMINHO SEGURO DO USUÁRIO
                    const snapshot = await this.db.collection('users')
                        .doc(app.config.appId)
                        .collection(table)
                        .get();
                    
                    if (!snapshot.empty) {
                        const remoteData = [];
                        snapshot.forEach(doc => remoteData.push(doc.data()));
                        
                        // Atualiza local com o que veio da nuvem
                        localData[table] = remoteData;
                    }
                } catch (e) { console.error(`Erro syncDown tabela ${table}:`, e); }
            }

            // Sincronizar também configurações e licença que ficam em subcoleção system
            try {
                const sysRef = this.db.collection('users').doc(app.config.appId).collection('system');
                
                const settingsDoc = await sysRef.doc('settings').get();
                if(settingsDoc.exists) localData.settings = settingsDoc.data();

                const licenseDoc = await sysRef.doc('license').get();
                if(licenseDoc.exists) localData.license = licenseDoc.data();

            } catch(e) { console.error("Erro syncDown System:", e); }

            localStorage.setItem('agri_data', JSON.stringify(localData));
            
            // Atualiza a tela atual
            if(app.state.currentView) app.router.go(app.state.currentView);
            console.log("Sincronização Cloud (Segura) -> Local concluída.");
        }
    },

    // --- CAMADA DE DADOS (LOCALSTORAGE) ---
    db: {
        schema: {
            settings: {
                alertLeadTime: 24, 
                alertInterval: 60, 
                soundEnabled: true,
                visualEnabled: true,
                supportPhone: '5511999999999',
                // CONFIGURAÇÕES PADRÃO (LEMBRETES)
                defAlarmLead: 14,      
                defAlarmRepeat: 5,     
                defAlarmOverdue: 10,   
                defEmailTarget: '',    
                defEmailLead: 1,       
                defEmailRepeat: 1,     
                defEmailOverdue: 1,    
                defEmailMax: 3,        
                cleanupDays: 30        
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
            maintenances: [],
            reminders: []
        },

        init() {
            app.cloud.init();

            if (!localStorage.getItem('agri_data')) {
                const initialData = JSON.parse(JSON.stringify(this.schema));
                // Usuário local padrão apenas para fallback
                initialData.users.push({
                    id: 'admin01', name: 'Administrador', email: 'admin@agri.com', pass: 'admin123', provider: 'local'
                });
                initialData.license.lastCheckDate = new Date().toISOString().split('T')[0];
                localStorage.setItem('agri_data', JSON.stringify(initialData));
            } else {
                let data = JSON.parse(localStorage.getItem('agri_data'));
                // Migrations: Garante que arrays novos existam
                if(!data.stock_movements) data.stock_movements = [];
                if(!data.cycles) data.cycles = [];
                if(!data.machinery) data.machinery = [];
                if(!data.maintenances) data.maintenances = [];
                if(!data.reminders) data.reminders = []; 
                
                if(!data.settings) data.settings = this.schema.settings;
                
                // Merge configurações
                const s = this.schema.settings;
                const d = data.settings;
                if(d.defAlarmLead === undefined) d.defAlarmLead = s.defAlarmLead;
                if(d.defAlarmRepeat === undefined) d.defAlarmRepeat = s.defAlarmRepeat;
                if(d.cleanupDays === undefined) d.cleanupDays = s.cleanupDays;

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
            // Sincroniza em local seguro
            if(app.cloud.db && app.config.appId) {
                app.cloud.db.collection('users').doc(app.config.appId)
                    .collection('system').doc('license').set(licData).catch(()=>{});
            }
        },

        saveSettings(newSettings) {
            const data = JSON.parse(localStorage.getItem('agri_data'));
            data.settings = { ...data.settings, ...newSettings };
            localStorage.setItem('agri_data', JSON.stringify(data));
            app.system.restartAlertLoop();
            // Sincroniza em local seguro
            if(app.cloud.db && app.config.appId) {
                app.cloud.db.collection('users').doc(app.config.appId)
                    .collection('system').doc('settings').set(data.settings).catch(()=>{});
            }
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
            app.cloud.save(table, item);
            return item;
        },

        delete(table, id) {
            const data = JSON.parse(localStorage.getItem('agri_data'));
            data[table] = data[table].filter(x => x.id !== id);
            localStorage.setItem('agri_data', JSON.stringify(data));
            app.cloud.delete(table, id);
        },
        
        getById(table, id) { return this.get(table).find(x => x.id === id); },
        
        findUser(email) { return this.get('users').find(u => u.email === email); },
        
        createUser(name, email, pass, provider = 'local', uid = null) {
            if(this.findUser(email)) return false; 
            const newUser = { id: uid || app.utils.uuid(), name, email, pass, provider };
            this.save('users', newUser);
            return true;
        },

        // --- FUNÇÃO DADOS DEMO ROBUSTA COM PERSISTÊNCIA CORRIGIDA ---
        async seedDemoData() {
            if(!confirm("Isso irá adicionar diversos registros de demonstração (Fazendas, Safras, Financeiro, etc) ao seu banco de dados atual.\n\nDeseja continuar?")) return;

            // Array para coletar as promises de salvamento na nuvem e garantir persistência antes do reload
            const savePromises = [];

            // Utilitários
            const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
            const dId = () => 'demo_' + Date.now() + '_' + rand(1, 9999);
            const today = new Date().toISOString().split('T')[0];
            const futureDate = (days) => {
                const d = new Date(); d.setDate(d.getDate() + days);
                return d.toISOString().split('T')[0];
            };

            // 1. FAZENDAS
            const farmNames = ['Fazenda Santa Fé', 'Sítio Alvorada', 'Agropecuária Boa Vista', 'Fazenda Vale do Sol'];
            const createdFarms = [];
            for (let i = 0; i < 4; i++) {
                const farm = {
                    id: dId(),
                    name: farmNames[i],
                    owner: app.state.currentUser ? app.state.currentUser.name : 'Usuário Demo',
                    area: rand(100, 5000),
                    location: randItem(['Mato Grosso', 'Goiás', 'Paraná', 'Bahia'])
                };
                app.db.save('farms', farm);
                // Força o salvamento explícito na nuvem e guarda a promise
                savePromises.push(app.cloud.save('farms', farm));
                createdFarms.push(farm);
            }

            // 2. TALHÕES
            const createdPlots = [];
            if (createdFarms.length > 0) {
                for (let i = 0; i < 5; i++) {
                    const farm = randItem(createdFarms);
                    const plot = {
                        id: dId(),
                        name: `Talhão ${rand(1, 20)}`,
                        farmId: farm.id,
                        area: Math.floor(farm.area / rand(4, 10)),
                        soilType: randItem(['Argiloso', 'Arenoso', 'Misto']),
                        status: 'Em uso'
                    };
                    app.db.save('plots', plot);
                    savePromises.push(app.cloud.save('plots', plot));
                    createdPlots.push(plot);
                }
            }

            // 3. MÁQUINAS
            const createdMachines = [];
            const machineTypes = [
                {n: 'Trator JD 7200', t: 'Máquina', cost: 250}, 
                {n: 'Colheitadeira NH', t: 'Máquina', cost: 450}, 
                {n: 'Plantadeira 12L', t: 'Implemento', cost: 0}
            ];
            machineTypes.forEach(m => {
                const machine = {
                    id: dId(),
                    name: m.n,
                    type: m.t,
                    costPerHour: m.cost,
                    currentHour: rand(100, 5000),
                    maintenanceInterval: 250,
                    status: 'Ativo'
                };
                app.db.save('machinery', machine);
                savePromises.push(app.cloud.save('machinery', machine));
                createdMachines.push(machine);
            });

            // 4. INSUMOS
            const inputTypes = [
                {n: 'Semente de Soja', c: 'Semente', u: 'sc'},
                {n: 'NPK 04-14-08', c: 'Fertilizante', u: 'ton'},
                {n: 'Diesel S10', c: 'Combustível', u: 'lt'}
            ];
            inputTypes.forEach(inp => {
                const item = {
                    id: dId(),
                    name: inp.n,
                    category: inp.c,
                    quantity: rand(50, 500),
                    unit: inp.u,
                    supplier: 'AgroComércio Demo'
                };
                app.db.save('inputs', item);
                savePromises.push(app.cloud.save('inputs', item));
            });

            // 5. SAFRAS & PRODUÇÃO & FINANCEIRO
            if (createdPlots.length > 0) {
                const cultures = ['Soja', 'Milho'];
                for (let i = 0; i < 3; i++) {
                    const plot = randItem(createdPlots);
                    const crop = {
                        id: dId(),
                        name: `${randItem(cultures)} Demo`,
                        plotId: plot.id,
                        culture: 'Soja',
                        status: 'Colhida',
                        plantingDate: today,
                        expectedHarvestDate: futureDate(120),
                        totalCost: rand(5000, 50000)
                    };
                    app.db.save('crops', crop);
                    savePromises.push(app.cloud.save('crops', crop));

                    // Produção
                    const prod = {
                        id: dId(),
                        safraId: crop.id,
                        date: today,
                        quantity: rand(100, 1000),
                        unit: 'sc'
                    };
                    app.db.save('production', prod);
                    savePromises.push(app.cloud.save('production', prod));
                    
                    // Receita
                    const fin = {
                        id: dId(),
                        date: today,
                        type: 'income',
                        category: 'Venda de Safra',
                        description: `Venda Parcial ${crop.name}`,
                        value: rand(50000, 200000),
                        status: 'Recebido'
                    };
                    app.db.save('financials', fin);
                    savePromises.push(app.cloud.save('financials', fin));
                }
            }

            // 6. LEMBRETES
            const settings = app.db.getSettings();
            const reminder = {
                id: dId(),
                name: '⚠️ Teste de Email Demo',
                description: 'Lembrete automático criado para testar o envio de e-mails.',
                date: today,
                time: new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
                category: 'Administrativo',
                value: 0,
                status: 'Pendente',
                emailEnabled: true,
                alarmConfig: {
                    lead: settings.defAlarmLead,
                    repeat: settings.defAlarmRepeat,
                    overdueRepeat: settings.defAlarmOverdue
                },
                stats: { emailCount: 0, lastEmailDate: null }
            };
            app.db.save('reminders', reminder);
            savePromises.push(app.cloud.save('reminders', reminder));

            // Feedback visual e espera pela persistência
            if(savePromises.length > 0) {
                const btn = document.querySelector('button[onclick="app.db.seedDemoData()"]');
                if(btn) {
                    btn.disabled = true;
                    btn.innerText = "Salvando na Nuvem...";
                }
                
                try {
                    // Aguarda todas as operações de escrita no Firebase terminarem
                    await Promise.all(savePromises);
                } catch(e) {
                    console.error("Erro ao salvar dados demo na nuvem:", e);
                }
            }

            alert('Dados demo gerados e salvos com sucesso!');
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
            const msg = encodeURIComponent(`Olá, gostaria de liberar o sistema AgriManager (AppID: ${app.config.appId}).\n\nCódigo: ${code}\nDias Solicitados: ${daysNum}`);
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

    // --- SISTEMA DE ALERTAS E LEMBRETES ---
    system: {
        init() { this.restartAlertLoop(); },
        restartAlertLoop() {
            if (app.state.alertIntervalId) clearInterval(app.state.alertIntervalId);
            const settings = app.db.getSettings();
            const intervalMs = (settings.alertInterval || 60) * 60 * 1000;
            this.checkAlerts(); 
            this.checkReminders(); // Verifica imediatamente
            
            app.state.alertIntervalId = setInterval(() => { 
                this.checkAlerts(); 
                this.checkReminders();
            }, intervalMs);
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

        // FUNÇÃO DE EXECUÇÃO DE LEMBRETES (E-MAILS E ALERTAS)
        checkReminders() {
            const reminders = app.db.get('reminders');
            const settings = app.db.getSettings();
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            let updated = false;

            // 1. Limpeza Automática
            const cleanupDate = new Date();
            cleanupDate.setDate(cleanupDate.getDate() - (parseInt(settings.cleanupDays) || 30));
            
            const initialCount = reminders.length;
            const activeReminders = reminders.filter(r => {
                const rDate = new Date(r.date + 'T' + (r.time || '00:00'));
                if (rDate < cleanupDate && r.status === 'Concluído') return false;
                return true;
            });

            if (activeReminders.length !== initialCount) {
                console.log(`🧹 Limpeza Automática: ${initialCount - activeReminders.length} lembretes removidos.`);
                reminders.length = 0; reminders.push(...activeReminders);
                updated = true;
            }

            // 2. Verificação de Alertas e E-mails
            activeReminders.forEach(r => {
                if (r.status === 'Concluído') return;

                const targetTime = new Date(r.date + 'T' + (r.time || '00:00'));
                const diffMs = targetTime - now;
                const diffMin = Math.floor(diffMs / 60000); 
                
                const dateOnlyTarget = new Date(r.date + 'T00:00:00');
                const dateOnlyNow = new Date(todayStr + 'T00:00:00');
                const diffDays = Math.ceil((dateOnlyTarget - dateOnlyNow) / (1000 * 60 * 60 * 24));

                // --- A. Lógica de Alarme (App Aberto) ---
                if (r.alarmConfig) {
                    const lead = parseInt(r.alarmConfig.lead) || 15;
                    const repeat = parseInt(r.alarmConfig.repeat) || 5;
                    const overdueRepeat = parseInt(r.alarmConfig.overdueRepeat) || 10;
                    
                    let shouldTrigger = false;

                    if (diffMin <= lead && diffMin > 0) {
                        const last = r.stats?.lastAlarm ? new Date(r.stats.lastAlarm) : 0;
                        if ((now - last) >= (repeat * 60000)) shouldTrigger = true;
                    }
                    else if (diffMin <= 0) {
                        const last = r.stats?.lastAlarm ? new Date(r.stats.lastAlarm) : 0;
                        if ((now - last) >= (overdueRepeat * 60000)) shouldTrigger = true;
                    }

                    if (shouldTrigger) {
                        const prefix = diffMin <= 0 ? '[ATRASADO] ' : '';
                        this.triggerAlert(`${prefix}${r.name}`, `${r.description || ''} <br>Vencimento: ${r.time}`, diffMin <= 0);
                        if (!r.stats) r.stats = {};
                        r.stats.lastAlarm = now.toISOString();
                        updated = true;
                    }
                }

                // --- B. Lógica de E-mail (Enfileiramento) ---
                if (r.emailEnabled) {
                    const cfg = {
                        lead: settings.defEmailLead || 1,
                        repeat: settings.defEmailRepeat || 1,
                        overdue: settings.defEmailOverdue || 1,
                        max: settings.defEmailMax || 3,
                        target: settings.defEmailTarget
                    };

                    if (!r.stats) r.stats = {};
                    if (!r.stats.emailCount) r.stats.emailCount = 0;
                    if (!r.stats.lastEmailDate) r.stats.lastEmailDate = null;

                    let shouldQueueEmail = false;
                    let emailType = '';

                    // Regra 1: Envio Antecipado
                    if (diffDays === cfg.lead && r.stats.lastEmailDate !== todayStr) {
                        shouldQueueEmail = true;
                        emailType = 'Antecipado';
                    }
                    // Regra 2: No Dia do Vencimento (Prioritário)
                    else if (diffDays === 0 && r.stats.lastEmailDate !== todayStr) {
                        shouldQueueEmail = true;
                        emailType = 'Vencimento';
                    }
                    // Regra 3: Atrasado
                    else if (diffDays < 0) {
                        const daysPast = Math.abs(diffDays);
                        if ((daysPast % cfg.overdue === 0) && 
                            r.stats.lastEmailDate !== todayStr && 
                            r.stats.emailCount < cfg.max) {
                            shouldQueueEmail = true;
                            emailType = 'Atrasado';
                        }
                    }

                    if (shouldQueueEmail && cfg.target) {
                        // Enfileira o e-mail na nuvem
                        app.cloud.queueEmail({
                            to: cfg.target,
                            subject: `[AgriManager] Lembrete ${emailType}: ${r.name}`,
                            body: `Olá,\n\nCompromisso: ${r.name}\nData: ${app.utils.formatDate(r.date)} às ${r.time}\nStatus: ${emailType}`
                        });

                        r.stats.lastEmailDate = todayStr;
                        if (emailType === 'Atrasado') r.stats.emailCount++;
                        
                        console.log(`📧 E-mail enfileirado: ${emailType} - ${r.name}`);
                        updated = true;
                    }
                }
            });

            if (updated) {
                const allData = JSON.parse(localStorage.getItem('agri_data'));
                allData.reminders = activeReminders;
                localStorage.setItem('agri_data', JSON.stringify(allData));
                // Salva na nuvem para atualizar os status e evitar reenvio
                if(app.cloud.db) activeReminders.forEach(r => app.cloud.save('reminders', r));
            }
        },

        triggerAlert(title, message, isCritical) {
            const container = document.getElementById('alert-container');
            const toast = document.createElement('div');
            toast.className = `alert-toast ${isCritical ? 'critical' : ''}`;
            toast.innerHTML = `<div class="alert-content"><h4>${title}</h4><p>${message}</p></div><i class="fas fa-times close-alert" onclick="this.parentElement.remove()"></i>`;
            container.appendChild(toast);
        },
        playSound() {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                const ctx = new AudioContext();
                if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
                const osc = ctx.createOscillator();
                osc.type = 'sine'; 
                osc.frequency.setValueAtTime(880, ctx.currentTime); 
                osc.connect(ctx.destination); 
                osc.start(); 
                osc.stop(ctx.currentTime + 0.5); 
            } catch(e) { console.warn("Alerta sonoro bloqueado pelo navegador."); }
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
                
                // Fallback para appId caso a conexão caia, usando o ID do usuário da sessão
                if(!app.config.appId) app.config.appId = app.state.currentUser.id;

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
        
        async login(e) {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            const btn = e.target.querySelector('button');
            const originalText = btn.innerText;

            btn.innerText = 'Verificando...';

            // 1. Tenta Firebase Auth (Prioritário)
            if (app.cloud.auth) {
                try {
                    const userCredential = await app.cloud.auth.signInWithEmailAndPassword(email, pass);
                    const fbUser = userCredential.user;
                    
                    // SEGURANÇA: Limpa dados locais antigos antes de iniciar nova sessão
                    localStorage.removeItem('agri_data');
                    app.db.init(); // Reinicia DB limpo

                    const sessionUser = {
                        id: fbUser.uid,
                        name: fbUser.displayName || email.split('@')[0],
                        email: fbUser.email,
                        provider: 'firebase'
                    };
                    this.createSession(sessionUser);
                    return;
                } catch (error) {
                    console.error("Erro Firebase:", error);
                }
            }

            // 2. Fallback para usuário local (Modo Offline)
            const localUser = app.db.findUser(email);
            if (localUser && localUser.provider === 'local' && localUser.pass === pass) {
                 this.createSession(localUser);
                 return;
            }
            
            btn.innerText = originalText;
            alert('E-mail ou senha incorretos.');
        },
        async googleLogin() {
            const btn = document.querySelector('.btn-google');
            const txt = btn.innerHTML; 
            btn.innerHTML = 'Conectando ao Google...';

            if (app.cloud.auth) {
                try {
                    const provider = new firebase.auth.GoogleAuthProvider();
                    const result = await app.cloud.auth.signInWithPopup(provider);
                    
                    // SEGURANÇA: Limpa dados locais antigos
                    localStorage.removeItem('agri_data');
                    app.db.init();

                    const user = result.user;
                    const sessionUser = {
                        id: user.uid,
                        name: user.displayName,
                        email: user.email,
                        provider: 'google'
                    };
                    this.createSession(sessionUser);
                } catch (error) {
                    alert("Erro no login Google: " + error.message);
                    btn.innerHTML = txt;
                }
            } else {
                alert("Modo Offline não suporta Google Login.");
                btn.innerHTML = txt;
            }
        },
        async register(e) {
            e.preventDefault();
            const form = e.target;
            const name = form['reg-name'].value;
            const email = form['reg-email'].value;
            const pass = form['reg-pass'].value;

            if (app.cloud.auth) {
                try {
                    const userCredential = await app.cloud.auth.createUserWithEmailAndPassword(email, pass);
                    await userCredential.user.updateProfile({ displayName: name });
                    
                    alert('Conta criada na Nuvem com sucesso! Faça login para continuar.');
                    this.switchView('login');
                    return;
                } catch (error) {
                    if(error.code !== 'auth/invalid-email') {
                         alert('Erro ao criar conta: ' + error.message);
                         return;
                    }
                }
            }

            // Fallback Local
            if(app.db.createUser(name, email, pass, 'local')) {
                alert('Conta local criada com sucesso!');
                this.switchView('login');
            } else alert('E-mail já cadastrado.');
        },
        forgotPassword(e) { 
            e.preventDefault(); 
            const email = document.getElementById('forgot-email').value;
            if(app.cloud.auth) {
                app.cloud.auth.sendPasswordResetEmail(email)
                    .then(() => alert('Link de redefinição enviado para seu e-mail.'))
                    .catch((err) => alert('Erro: ' + err.message));
            } else {
                alert('Modo Offline: Simulação de envio de link.'); 
            }
            this.switchView('login'); 
        },
        createSession(user) { 
            localStorage.setItem('agri_session', JSON.stringify({ ...user, pass: null })); 
            this.check(); 
        },
        logout() { 
            if(confirm('Sair?')) { 
                if(app.cloud.auth) app.cloud.auth.signOut();
                // LIMPEZA DE SEGURANÇA: Remove sessão e dados locais
                localStorage.removeItem('agri_session'); 
                localStorage.removeItem('agri_data'); 
                window.location.reload(); 
            } 
        }
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
                case 'lembretes': title.innerText = 'Lembretes e Alertas'; app.ui.renderEntityList(container, 'reminders', 'Lembrete', ['Título', 'Data', 'Hora', 'Categoria', 'Valor', 'Status'], ['name', (r)=>app.utils.formatDate(r.date), 'time', 'category', (r)=> r.value ? app.utils.formatCurrency(r.value) : '-', 'status']); break;
                case 'relatorios': title.innerText = 'Central de Relatórios'; app.ui.renderReports(container); break;
                case 'settings': title.innerText = 'Configurações e Licença'; app.ui.renderSettings(container); break;
            }
        }
    },

    // --- UI ---
    ui: {
        toggleSidebar() { document.querySelector('aside').classList.toggle('open'); },
        closeModal() { document.getElementById('generic-modal').style.display = 'none'; },

        downloadBackup() {
            const data = localStorage.getItem('agri_data');
            const blob = new Blob([data], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `backup_agrimanager_${app.config.appId}_${new Date().toISOString().slice(0,10)}.json`; a.click();
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
                        if(confirm('Dados locais restaurados. Deseja sincronizar e sobrescrever a Nuvem?')) {
                            Object.keys(json).forEach(table => {
                                if(Array.isArray(json[table])) {
                                    json[table].forEach(item => app.cloud.save(table, item));
                                }
                            });
                        }
                        alert('Dados restaurados com sucesso!');
                        location.reload();
                    } else alert('Arquivo inválido.');
                } catch(err) { alert('Erro: ' + err.message); }
            };
            reader.readAsText(file);
        },

        getReportData(type) {
            let headers = [], body = [], title = '';
            const entityMap = {
                'users': 'Usuários', 'farms': 'Fazendas', 'plots': 'Talhões', 'crops': 'Safras',
                'cycles': 'Ciclos', 'inputs': 'Insumos', 'stock_movements': 'Movimentação Estoque',
                'machinery': 'Máquinas', 'maintenances': 'Manutenções', 'production': 'Produção', 'financials': 'Financeiro',
                'reminders': 'Lembretes'
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
                case 'reminders': return { 
                    headers: ['Título', 'Data', 'Hora', 'Categoria', 'Valor', 'Status'], 
                    fields: ['name', (r)=>app.utils.formatDate(r.date), 'time', 'category', (r)=> r.value ? app.utils.formatCurrency(r.value) : '-', 'status'] 
                };
                default: return { headers: [], fields: [] };
            }
        },

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

        exportEntityPDF(entity) { this.loadReportView(entity); },

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

        renderReports(container) {
             const sum = this.getFinancialSummary();
            
            container.innerHTML = `
                <div class="d-flex"><h3>Central de Relatórios</h3></div>
                
                <div class="report-grid" id="main-report-menu">
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
                    <div class="card report-section">
                        <h4><i class="fas fa-chart-line"></i> Relatórios Analíticos</h4>
                        <p style="font-size:0.9rem; color:#666; margin-bottom:1rem;">Análise detalhada de custos e receitas.</p>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <button class="btn btn-outline" onclick="app.ui.loadReportView('analysis_crop')"><i class="fas fa-seedling"></i> Despesa x Receita por Safra</button>
                            <button class="btn btn-outline" onclick="app.ui.loadReportView('analysis_plot')"><i class="fas fa-vector-square"></i> Despesa x Receita por Talhão</button>
                        </div>
                    </div>
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
                            <button class="btn btn-outline btn-sm" onclick="app.ui.loadReportView('reminders')">Lembretes</button>
                        </div>
                    </div>
                </div>
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
                        <small style="color: #666;">Status: ${lic.daysRemaining > 0 ? 'Ativo' : 'Expirado'} <br> AppID: ${app.config.appId}</small>
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
            
            // --- VERIFICAÇÃO DE ADMIN (jcnvap@gmail.com) ---
            let adminSection = '';
            if (app.state.currentUser && app.state.currentUser.email === 'jcnvap@gmail.com') {
                adminSection = `
                    <div class="card" style="max-width: 600px; margin: 2rem auto 0 auto; width: 100%; border-left: 5px solid #000; background-color: #fff3cd;">
                        <h3 style="color: #856404;"><i class="fas fa-user-shield"></i> Área de Testes (Restrito)</h3>
                        <p style="margin: 1rem 0; font-size: 0.9rem; color: #856404;">
                            Funcionalidade exclusiva para limpeza de ambiente de testes.
                        </p>
                        <button class="btn btn-danger" style="width: 100%; font-weight: bold;" onclick="app.ui.adminResetData()">
                            <i class="fas fa-bomb"></i> Zerar Cadastros (exceto login)
                        </button>
                    </div>
                `;
            }
            
            container.innerHTML = `
                <div style="display: grid; gap: 2rem;">
                    
                    <!-- LICENÇA -->
                    <div class="card" style="max-width: 600px; margin: 0 auto; width: 100%; border-left: 5px solid var(--accent-color);">
                        <h3><i class="fas fa-key"></i> Licença de Uso</h3>
                        <div style="display:flex; justify-content:space-between; margin:1rem 0; background:#f9f9f9; padding:10px; border-radius:4px;">
                            <span>Dias: <strong>${lic.daysRemaining}</strong></span>
                            <span>Status: <strong style="color:${lic.daysRemaining > 0 ? 'var(--success)' : 'var(--danger)'}">${lic.daysRemaining > 0 ? 'Ativo' : 'Expirado'}</strong></span>
                        </div>
                        <form onsubmit="app.ui.addLicenseDays(event)" style="border-top:1px solid #eee; padding-top:1rem;">
                            <div class="form-group">
                                <label>1. Código do Sistema</label>
                                <div style="display:flex; gap:5px;">
                                    <input type="text" id="req-code" class="form-control" readonly placeholder="Clique em Gerar">
                                    <button type="button" class="btn btn-outline" onclick="app.ui.generateReqCodeOnly()"><i class="fas fa-sync"></i> Gerar</button>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>2. Dias / 3. Contra-senha</label>
                                <div style="display:flex; gap:5px;">
                                    <input type="number" id="req-days" class="form-control" placeholder="Dias" step="30" oninput="app.ui.checkDaysInput(this)">
                                    <input type="number" name="counterPass" class="form-control" required placeholder="Senha">
                                </div>
                                <button type="button" class="btn btn-success" style="margin-top:5px; width:100%" onclick="app.ui.sendWhatsappRequest()">WhatsApp</button>
                            </div>
                            <button type="submit" class="btn btn-primary" style="width:100%; margin-top:5px;">Validar</button>
                        </form>
                    </div>

                    <!-- CLOUD INFO -->
                    <div class="card" style="max-width: 600px; margin: 0 auto; width: 100%;">
                        <h3><i class="fas fa-cloud"></i> Status da Nuvem</h3>
                        <p style="margin: 1rem 0; font-size:0.9rem;">
                            <strong>App ID:</strong> ${app.config.appId} | 
                            <strong>Sync:</strong> ${app.cloud.db ? '<span style="color:var(--success)">Online</span>' : '<span style="color:var(--danger)">Offline</span>'}
                        </p>
                    </div>

                    <!-- CONFIGURAÇÃO PADRÃO DE ALERTAS -->
                    <div class="card" style="max-width: 600px; margin: 0 auto; width: 100%;">
                        <h3><i class="fas fa-bell"></i> Padrões de Alertas e Lembretes</h3>
                        <form onsubmit="app.ui.saveSettings(event)" style="margin-top:1rem;">
                            
                            <div class="grid-2-col">
                                <div class="form-group" style="display:flex; align-items:center; gap:5px;">
                                    <input type="checkbox" name="soundEnabled" id="chk-sound" ${s.soundEnabled?'checked':''}>
                                    <label for="chk-sound" style="margin:0;">Som</label>
                                </div>
                                <div class="form-group" style="display:flex; align-items:center; gap:5px;">
                                    <input type="checkbox" name="visualEnabled" id="chk-visual" ${s.visualEnabled?'checked':''}>
                                    <label for="chk-visual" style="margin:0;">Visual</label>
                                </div>
                            </div>
                            
                            <div class="form-section-title"><i class="fas fa-desktop"></i> Alarme (App Aberto)</div>
                            <div class="grid-2-col">
                                <div class="form-group"><label>Iniciar (min antes)</label><input type="number" name="defAlarmLead" class="form-control" value="${s.defAlarmLead}"></div>
                                <div class="form-group"><label>Repetir (cada min)</label><input type="number" name="defAlarmRepeat" class="form-control" value="${s.defAlarmRepeat}"></div>
                            </div>
                            <div class="form-group"><label>Se atrasado (cada min)</label><input type="number" name="defAlarmOverdue" class="form-control" value="${s.defAlarmOverdue}"></div>

                            <div class="form-section-title"><i class="fas fa-envelope"></i> E-mail Padrão</div>
                            <div class="form-group"><label>E-mail de destino</label><input type="email" name="defEmailTarget" class="form-control" value="${s.defEmailTarget || ''}" placeholder="ex: gerente@fazenda.com"></div>
                            <div class="grid-2-col">
                                <div class="form-group"><label>Iniciar (dias antes)</label><input type="number" name="defEmailLead" class="form-control" value="${s.defEmailLead}"></div>
                                <div class="form-group"><label>Repetir (dias)</label><input type="number" name="defEmailRepeat" class="form-control" value="${s.defEmailRepeat}"></div>
                            </div>
                            <div class="grid-2-col">
                                <div class="form-group"><label>Atrasado (dias)</label><input type="number" name="defEmailOverdue" class="form-control" value="${s.defEmailOverdue}"></div>
                                <div class="form-group"><label>Máx. Envios</label><input type="number" name="defEmailMax" class="form-control" value="${s.defEmailMax}"></div>
                            </div>

                            <div class="form-section-title"><i class="fas fa-trash"></i> Limpeza e Tarefas</div>
                            <div class="form-group"><label>Excluir vencidos há (dias)</label><input type="number" name="cleanupDays" class="form-control" value="${s.cleanupDays}"></div>

                            <button type="submit" class="btn btn-primary" style="width:100%; margin-top:10px;">Salvar Padrões</button>
                        </form>

                        <div style="margin-top: 2rem; border-top: 1px dashed #ccc; padding-top: 1rem;">
                            <h4>Gerenciamento de Tarefas</h4>
                            <button class="btn btn-outline" style="width:100%; margin-top:10px;" onclick="app.ui.deleteCompletedReminders()">
                                <i class="fas fa-check-double"></i> Limpar Todas as Concluídas
                            </button>
                        </div>
                    </div>

                    <!-- BOTÃO DADOS DEMO E BACKUP -->
                    <div class="card" style="max-width: 600px; margin: 0 auto; width: 100%;">
                        <h3><i class="fas fa-hdd"></i> Sistema</h3>
                        <div style="display: flex; gap: 1rem; margin-top:1rem;">
                            <button class="btn btn-warning" style="flex: 1;" onclick="app.db.seedDemoData()">Dados Demo</button>
                            <button class="btn btn-primary" style="flex: 1;" onclick="app.ui.downloadBackup()">Backup</button>
                            <button class="btn btn-outline" style="flex: 1;" onclick="app.ui.triggerRestore()">Restaurar</button>
                        </div>
                    </div>

                    ${adminSection}
                </div>`;
        },

        generateReqCodeOnly() {
            const code = app.license.generateCode();
            document.getElementById('req-code').value = code;
        },

        checkDaysInput(input) {
            const val = parseInt(input.value);
            const warning = document.getElementById('days-warning');
            if (val > 0 && val % 30 !== 0) { warning.style.display = 'block'; } else { warning.style.display = 'none'; }
        },

        sendWhatsappRequest() {
            const code = app.state.lastGeneratedCode;
            if (!code) { alert("Por favor, clique em 'Gerar Número' primeiro."); return; }
            const daysInput = document.getElementById('req-days');
            const daysNum = parseInt(daysInput.value);
            if (isNaN(daysNum) || daysNum <= 0 || daysNum % 30 !== 0) { alert("O número de dias deve ser um múltiplo de 30."); return; }
            const settings = app.db.getSettings();
            const msg = encodeURIComponent(`Olá, gostaria de liberar o sistema AgriManager (AppID: ${app.config.appId}).\n\nCódigo: ${code}\nDias Solicitados: ${daysNum}`);
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
            } else { alert('Contra-senha inválida.'); }
        },

        saveSettings(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const oldSettings = app.db.getSettings();
            
            const newSettings = {
                soundEnabled: formData.get('soundEnabled') === 'on',
                visualEnabled: formData.get('visualEnabled') === 'on',
                
                defAlarmLead: Number(formData.get('defAlarmLead')),
                defAlarmRepeat: Number(formData.get('defAlarmRepeat')),
                defAlarmOverdue: Number(formData.get('defAlarmOverdue')),
                
                defEmailTarget: formData.get('defEmailTarget'),
                defEmailLead: Number(formData.get('defEmailLead')),
                defEmailRepeat: Number(formData.get('defEmailRepeat')),
                defEmailOverdue: Number(formData.get('defEmailOverdue')),
                defEmailMax: Number(formData.get('defEmailMax')),
                
                cleanupDays: Number(formData.get('cleanupDays')),
                alertLeadTime: oldSettings.alertLeadTime || 24,
                alertInterval: oldSettings.alertInterval || 60
            };
            app.db.saveSettings(newSettings);
            alert('Padrões de configuração salvos com sucesso!');
        },

        // --- FUNÇÃO DE LIMPEZA ADMIN ---
        adminResetData() {
            if (!app.state.currentUser || app.state.currentUser.email !== 'jcnvap@gmail.com') {
                alert("Acesso negado.");
                return;
            }

            if (!confirm("⚠️ ATENÇÃO EXTREMA ⚠️\n\nIsso apagará PERMANENTEMENTE seus dados cadastrais (Fazendas, Financeiro, etc).\n\nTem certeza que deseja zerar os cadastros?")) {
                return;
            }

            try {
                const tablesToClear = [
                    'farms', 'plots', 'crops', 'cycles', 'inputs', 
                    'stock_movements', 'production', 'financials', 
                    'machinery', 'maintenances', 'reminders'
                ];

                const currentData = JSON.parse(localStorage.getItem('agri_data'));

                tablesToClear.forEach(table => {
                    // Limpa na Nuvem (se conectado) e se tiver AppID definido
                    if (app.cloud.db && currentData[table] && Array.isArray(currentData[table])) {
                        currentData[table].forEach(item => {
                            // Alterado para deletar no caminho seguro users/{uid}
                            app.cloud.delete(table, item.id);
                        });
                    }
                    // Limpa Localmente
                    currentData[table] = [];
                });

                localStorage.setItem('agri_data', JSON.stringify(currentData));
                alert("Limpeza concluída com sucesso! A página será recarregada.");
                window.location.reload();

            } catch (error) {
                console.error(error);
                alert("Erro ao tentar zerar dados: " + error.message);
            }
        },

        deleteCompletedReminders() {
            if(confirm('Deseja remover todos os lembretes marcados como "Concluído"?')) {
                const all = app.db.get('reminders');
                const pending = all.filter(r => r.status !== 'Concluído');
                const removedCount = all.length - pending.length;
                
                const data = JSON.parse(localStorage.getItem('agri_data'));
                data.reminders = pending;
                localStorage.setItem('agri_data', JSON.stringify(data));
                
                if(app.cloud.db) {
                    const completed = all.filter(r => r.status === 'Concluído');
                    completed.forEach(r => app.cloud.delete('reminders', r.id));
                }
                
                alert(`${removedCount} lembretes concluídos foram removidos.`);
                if(app.state.currentView === 'lembretes') app.router.go('lembretes');
            }
        },

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
            const settings = app.db.getSettings();

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
                case 'plots': fieldsHtml = `${this.inputHtml('text', 'name', 'Nome', item.name, true)}<div class="form-group"><label>Fazenda</label><select name="farmId" class="form-control" required><option value="">Selecione...</option>${getOptions('farms', 'name', item.farmId)}</select></div>${this.inputHtml('number', 'area', 'Área (ha)', item.area)}${this.inputHtml('text', 'soilType', 'Tipo de Solo', item.soilType)}${getSimpleSelect('status', 'Status', ['Disponível', 'Em uso', 'Em recuperação'], item.status)}`; break;
                case 'crops': fieldsHtml = `${this.inputHtml('text', 'name', 'Nome da Safra', item.name, true)}<div class="form-group"><label>Talhão</label><select name="plotId" class="form-control" required><option value="">Selecione...</option>${getOptions('plots', 'name', item.plotId)}</select></div>${this.inputHtml('text', 'culture', 'Cultura', item.culture)}${getSimpleSelect('status', 'Status', ['Planejada', 'Plantada', 'Em crescimento', 'Colhida', 'Finalizada'], item.status)}${this.inputHtml('date', 'plantingDate', 'Data Plantio', item.plantingDate)}${this.inputHtml('date', 'expectedHarvestDate', 'Colheita Prevista', item.expectedHarvestDate)}${this.inputHtml('number', 'totalCost', 'Custo Estimado', item.totalCost)}`; break;
                case 'inputs': fieldsHtml = `${this.inputHtml('text', 'name', 'Nome', item.name, true)}${getSimpleSelect('category', 'Categoria', ['Semente', 'Fertilizante', 'Defensivo', 'Combustível', 'Outro'], item.category)}${this.inputHtml('number', 'quantity', 'Qtd Atual', item.quantity)}${this.inputHtml('text', 'unit', 'Unidade (kg, lt, sc)', item.unit)}${this.inputHtml('text', 'supplier', 'Fornecedor', item.supplier)}`; break;
                case 'stock_movement': fieldsHtml = `<div class="form-group"><label>Insumo</label><select name="inputId" class="form-control" required onchange="app.ui.updateStockInfo(this)"><option value="">Selecione...</option>${getOptions('inputs', 'name', item.inputId)}</select></div><div class="form-group"><label>Estoque Atual</label><input type="text" id="current-stock-display" class="form-control" readonly></div><div class="form-group"><label>Tipo</label><select name="type" class="form-control"><option>Entrada</option><option>Saída</option></select></div><div class="grid-2-col"><div class="form-group"><label>Safra</label><select name="safraId" class="form-control"><option value="">Selecione...</option>${getOptions('crops', 'name', item.safraId)}</select></div></div>${this.inputHtml('text', 'motive', 'Motivo', '')}${this.inputHtml('number', 'quantity', 'Qtd', '', true)}`; break;
                case 'production': fieldsHtml = `${this.inputHtml('date', 'date', 'Data', item.date, true)}<div class="form-group"><label>Safra</label><select name="safraId" class="form-control" required><option value="">Selecione...</option>${getOptions('crops', 'name', item.safraId)}</select></div>${this.inputHtml('number', 'quantity', 'Quantidade', item.quantity, true)}${this.inputHtml('text', 'unit', 'Unidade (sc, ton)', item.unit)}`; break;
                case 'maintenances': fieldsHtml = `<div class="form-group"><label>Equipamento</label><select name="machineId" class="form-control" required><option value="">Selecione...</option>${getOptions('machinery', 'name', item.machineId)}</select></div>${getSimpleSelect('type', 'Tipo', ['Preventiva', 'Corretiva', 'Preditiva'], item.type)}${this.inputHtml('date', 'date', 'Data', item.date, true)}${this.inputHtml('textarea', 'description', 'Descrição do Serviço', item.description)}${this.inputHtml('number', 'cost', 'Custo Total', item.cost)}${this.inputHtml('number', 'nextMaintenance', 'Próxima Manutenção (Horímetro)', item.nextMaintenance)}${getSimpleSelect('status', 'Status', ['Agendada', 'Executada', 'Cancelada'], item.status)}`; break;
                case 'cycles': fieldsHtml = `${this.inputHtml('text', 'name', 'Nome/Tarefa', item.name, true)}${getSimpleSelect('type', 'Tipo', ['Preparação', 'Plantio', 'Manejo', 'Colheita'], item.type)}<div class="form-group"><label>Safra</label><select name="cropId" class="form-control"><option value="">Selecione...</option>${getOptions('crops', 'name', item.cropId)}</select></div><div class="grid-2-col">${this.inputHtml('date', 'startDate', 'Início', item.startDate)}${this.inputHtml('date', 'endDate', 'Fim', item.endDate)}</div>${getSimpleSelect('status', 'Status', ['Pendente', 'Em andamento', 'Concluído'], item.status)}<div class="form-section-title"><i class="fas fa-calculator"></i> Custos</div><div class="grid-2-col"><div class="form-group"><label>Máquina</label><select id="cycle-machine-select" name="machineId" class="form-control" onchange="app.ui.calcCycleCost()"><option value="">Selecione...</option>${getOptions('machinery', 'name', item.machineId)}</select></div>${this.inputHtml('number', 'machineHours', 'Horas', item.machineHours, false, 'id="cycle-hours-input" oninput="app.ui.calcCycleCost()"')}</div>${this.inputHtml('number', 'cost', 'Custo Estimado (R$)', item.cost, false, 'id="cycle-cost-input"')}`; break;
                
                case 'reminders':
                    const defAlarmL = item.alarmConfig ? item.alarmConfig.lead : settings.defAlarmLead;
                    const defAlarmR = item.alarmConfig ? item.alarmConfig.repeat : settings.defAlarmRepeat;
                    const defAlarmO = item.alarmConfig ? item.alarmConfig.overdueRepeat : settings.defAlarmOverdue;
                    
                    fieldsHtml = `
                        <div class="form-section-title"><i class="fas fa-edit"></i> Dados do Compromisso</div>
                        ${this.inputHtml('text', 'name', 'Título*', item.name, true, 'placeholder="Ex: Reunião com João"')}
                        ${this.inputHtml('textarea', 'description', 'Descrição', item.description)}
                        <div class="grid-2-col">
                            ${this.inputHtml('date', 'date', 'Data*', item.date, true)}
                            ${this.inputHtml('time', 'time', 'Hora*', item.time, true)}
                        </div>
                        <div class="form-group">
                            <label>Categoria</label>
                            <select name="category" class="form-control">
                                <option value="Geral" ${item.category==='Geral'?'selected':''}>Geral</option>
                                <option value="Financeiro" ${item.category==='Financeiro'?'selected':''}>Financeiro</option>
                                <option value="Operacional" ${item.category==='Operacional'?'selected':''}>Operacional</option>
                                <option value="Administrativo" ${item.category==='Administrativo'?'selected':''}>Administrativo</option>
                            </select>
                        </div>
                        <div class="grid-2-col">
                            ${this.inputHtml('number', 'value', 'Valor (R$)', item.value)}
                            <div class="form-group">
                                <label>Status</label>
                                <select name="status" class="form-control">
                                    <option value="Pendente" ${item.status!=='Concluído'?'selected':''}>Pendente</option>
                                    <option value="Concluído" ${item.status==='Concluído'?'selected':''}>Concluído</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-section-title"><i class="fas fa-bell"></i> Configurações de Notificação</div>
                        <div class="form-group" style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                            <input type="checkbox" name="emailEnabled" id="chk-email" style="width:20px; height:20px;" ${item.emailEnabled ? 'checked' : ''}>
                            <label for="chk-email" style="margin:0;">Enviar e-mails de lembrete</label>
                        </div>
                        
                        <div class="card" style="padding:15px; background:#f0f4c3; border:1px solid #dce775;">
                            <h4 style="margin-bottom:10px; color:#555; font-size:0.9rem;"><i class="fas fa-desktop"></i> Alarme (App Aberto)</h4>
                            <div class="grid-2-col">
                                <div class="form-group"><label>Acionar (min antes)</label><input type="number" name="al_lead" class="form-control" value="${defAlarmL}"></div>
                                <div class="form-group"><label>Repetir (min)</label><input type="number" name="al_repeat" class="form-control" value="${defAlarmR}"></div>
                            </div>
                            <div class="form-group"><label>Se atrasado: Repetir (min)</label><input type="number" name="al_overdue" class="form-control" value="${defAlarmO}"></div>
                            <small style="color:#666;">* Valores padrão carregados de Configurações</small>
                        </div>
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

            if (entity === 'reminders') {
                data.emailEnabled = formData.get('emailEnabled') === 'on';
                data.alarmConfig = {
                    lead: Number(formData.get('al_lead')),
                    repeat: Number(formData.get('al_repeat')),
                    overdueRepeat: Number(formData.get('al_overdue'))
                };
                delete data.al_lead; delete data.al_repeat; delete data.al_overdue;
            }

            app.db.save(entity, data); 
            app.ui.closeModal(); 
            
            if (entity === 'maintenances' || entity === 'machinery') app.system.checkAlerts();
            if (entity === 'reminders') app.system.checkReminders(); 
            if(entity === 'stock_movements') app.router.go('stock'); else app.router.go(app.state.currentView); 
        },
        deleteItem(entity, id) { if(confirm('Tem certeza que deseja excluir?')) { app.db.delete(entity, id); app.router.go(app.state.currentView); } }
    }
};

window.onload = () => { app.db.init(); app.auth.check(); };