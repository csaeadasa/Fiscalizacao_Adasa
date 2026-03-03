// ======== Fix 100vh no mobile (barra do navegador) ========
function setAppHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);
setAppHeight();

// ======== Global State ========
let allFiscalizacoes = [];
let filteredFiscalizacoes = [];
let currentFiscalizacao = null;
let map = null;
let markerClusterGroup = null;
let markers = {};
let isSelectingLocation = false;
let tempMarker = null;
let deleteTarget = null;

const defaultConfig = {
  app_title: 'Sistema de Fiscalizações',
  subtitle: 'Monitoramento em Tempo Real'
};

const regionCoordinates = {
  'Plano Piloto': [-15.7942, -47.8822],
  'Gama': [-16.0192, -48.0617],
  'Taguatinga': [-15.8364, -48.0564],
  'Brazlândia': [-15.6759, -48.2125],
  'Sobradinho': [-15.6500, -47.7878],
  'Planaltina': [-15.6204, -47.6482],
  'Paranoá': [-15.7735, -47.7767],
  'Núcleo Bandeirante': [-15.8714, -47.9675],
  'Ceilândia': [-15.8197, -48.1117],
  'Guará': [-15.8333, -47.9833],
  'Cruzeiro': [-15.7942, -47.9311],
  'Samambaia': [-15.8789, -48.0992],
  'Santa Maria': [-16.0197, -48.0028],
  'São Sebastião': [-15.9025, -47.7631],
  'Recanto das Emas': [-15.9167, -48.0667],
  'Lago Sul': [-15.8333, -47.8500],
  'Riacho Fundo': [-15.8833, -48.0167],
  'Lago Norte': [-15.7333, -47.8500],
  'Candangolândia': [-15.8500, -47.9500],
  'Águas Claras': [-15.8333, -48.0333],
  'Riacho Fundo II': [-15.9000, -48.0500],
  'Sudoeste/Octogonal': [-15.8000, -47.9167],
  'Varjão': [-15.7167, -47.8667],
  'Park Way': [-15.9000, -47.9500],
  'SCIA/Estrutural': [-15.7833, -47.9833],
  'Sobradinho II': [-15.6333, -47.8000],
  'Jardim Botânico': [-15.8667, -47.8000],
  'Itapoã': [-15.7500, -47.7667],
  'SIA': [-15.8167, -47.9500],
  'Vicente Pires': [-15.8000, -48.0333],
  'Fercal': [-15.6000, -47.9000],
  'Sol Nascente/Pôr do Sol': [-15.8000, -48.1333],
  'Arniqueira': [-15.8500, -48.0333]
};

const dataHandler = {
  onDataChanged(data) {
    allFiscalizacoes = data;
    updateFiltersOptions();
    applyFilters();
    updateDashboard();
  }
};

async function initDataSDK() {
  const result = await window.dataSdk.init(dataHandler);
  if (!result.isOk) showToast('Erro ao inicializar sistema de dados', 'error');
  updateStorageModeStatus();
  return result;
}

function updateStorageModeStatus() {
  const status = document.getElementById('storage-mode-status');
  const select = document.getElementById('storage-mode-select');
  if (!status || !select || !window.dataSdk) return;

  const selectedMode = window.dataSdk.getStorageMode();
  const apiConfigured = window.dataSdk.isApiConfigured();
  const lastSource = window.dataSdk.getLastSource();

  select.value = selectedMode;

  if (selectedMode === 'api' && !apiConfigured) {
    status.textContent = 'API nao configurada';
    return;
  }

  if (selectedMode === 'api' && lastSource !== 'api') {
    status.textContent = 'API indisponivel';
    return;
  }

  status.textContent = selectedMode === 'api' ? 'API ativa' : 'Salvo no navegador';
}

async function handleStorageModeChange(event) {
  const nextMode = event.target.value === 'api' ? 'api' : 'local';

  if (nextMode === 'api' && !window.dataSdk.isApiConfigured()) {
    window.dataSdk.setStorageMode('local');
    updateStorageModeStatus();
    showToast('Configure a URL da API antes de usar esse modo', 'warning');
    return;
  }

  window.dataSdk.setStorageMode(nextMode);
  showLoading(nextMode === 'api' ? 'Conectando API...' : 'Carregando dados locais...');

  const result = await initDataSDK();

  hideLoading();

  if (!result.isOk) {
    showToast('Erro ao trocar o modo de salvamento', 'error');
    return;
  }

  if (nextMode === 'api' && result.source !== 'api') {
    showToast('API indisponivel. Dados locais carregados.', 'warning');
    return;
  }

  showToast(
    result.source === 'api' ? 'Modo API externa ativado' : 'Modo local ativado',
    'success'
  );
}

function initStorageModeSelector() {
  const select = document.getElementById('storage-mode-select');
  if (!select) return;

  if (window.dataSdk && !window.dataSdk.isApiConfigured() && window.dataSdk.getStorageMode() === 'api') {
    window.dataSdk.setStorageMode('local');
  }

  select.value = window.dataSdk?.getStorageMode?.() || 'local';
  select.addEventListener('change', handleStorageModeChange);
  updateStorageModeStatus();
}

// ======== Map ========
function initMap() {
  map = L.map('map').setView([-15.7942, -47.8822], 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  markerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  map.addLayer(markerClusterGroup);

  map.on('click', handleMapClick);
}

function toggleFiltersPanel(open) {
  const drawer = document.getElementById('filters-drawer');
  const overlay = document.getElementById('filters-overlay');
  if (!drawer || !overlay) return;

  if (open) {
    overlay.classList.remove('hidden');
    drawer.classList.remove('-translate-x-full');
    document.body.classList.add('overflow-hidden');
  } else {
    overlay.classList.add('hidden');
    drawer.classList.add('-translate-x-full');
    document.body.classList.remove('overflow-hidden');
  }
}
window.toggleFiltersPanel = toggleFiltersPanel;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') toggleFiltersPanel(false);
});

// ======== Markers ========
function createMarkerIcon(situacao) {
  let color;
  switch (situacao) {
    case 'Em Andamento': color = '#f59e0b'; break;
    case 'Concluída': color = '#10b981'; break;
    case 'Pendente': color = '#ef4444'; break;
    default: color = '#3b82f6';
  }

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, ${color}dd, ${color});
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="transform: rotate(45deg); font-size: 14px;">📋</div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
}

function updateMapMarkers() {
  markerClusterGroup.clearLayers();
  markers = {};

  filteredFiscalizacoes.forEach(fisc => {
    if (fisc.latitude && fisc.longitude) {
      const marker = L.marker([fisc.latitude, fisc.longitude], {
        icon: createMarkerIcon(fisc.situacao)
      });

      marker.bindPopup(createPopupContent(fisc), {
        maxWidth: 300,
        className: 'custom-popup'
      });

      marker.on('click', () => showDetailPanel(fisc));

      markerClusterGroup.addLayer(marker);
      markers[fisc.__backendId] = marker;
    }
  });

  if (filteredFiscalizacoes.length > 0 && Object.keys(markers).length > 0) {
    const bounds = markerClusterGroup.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
  }
}

function createPopupContent(fisc) {
  const statusClass = fisc.situacao === 'Em Andamento' ? 'status-andamento' :
                      fisc.situacao === 'Concluída' ? 'status-concluida' : 'status-pendente';

  return `
    <div style="padding: 16px; font-family: 'Plus Jakarta Sans', sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <span style="font-weight:700;font-size:16px;color:#1e293b;">${fisc.id}</span>
        <span class="${statusClass}" style="font-size:11px;padding:3px 8px;">${fisc.situacao}</span>
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Região:</strong> ${fisc.regiao_administrativa || '-'}
      </div>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
        <strong>Processo:</strong> ${fisc.processo_sei || '-'}
      </div>
      ${fisc.indice_conformidade ? `
        <div style="margin-top:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:12px;color:#64748b;">Conformidade</span>
            <span style="font-size:12px;font-weight:600;color:#1e293b;">${fisc.indice_conformidade}%</span>
          </div>
          <div style="background:#e2e8f0;border-radius:4px;height:6px;overflow:hidden;">
            <div style="background:linear-gradient(90deg,#3b82f6,#2563eb);height:100%;width:${fisc.indice_conformidade}%;"></div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// ======== Map click selection ========
function handleMapClick(e) {
  if (!isSelectingLocation) return;

  const { lat, lng } = e.latlng;

  if (tempMarker) map.removeLayer(tempMarker);

  tempMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'temp-marker',
      html: `
        <div style="
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          border-radius: 50%;
          border: 4px solid white;
          box-shadow: 0 4px 15px rgba(59, 130, 246, 0.5);
          animation: pulse 1.5s infinite;
        "></div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    })
  }).addTo(map);

  document.getElementById('form-lat').value = lat.toFixed(6);
  document.getElementById('form-lng').value = lng.toFixed(6);

  disableMapSelection();
  document.getElementById('form-modal').classList.remove('hidden');
}

function enableMapSelection() {
  isSelectingLocation = true;
  document.getElementById('form-modal').classList.add('hidden');
  document.getElementById('map-hint').classList.remove('hidden');
  map.getContainer().style.cursor = 'crosshair';
}
window.enableMapSelection = enableMapSelection;

function disableMapSelection() {
  isSelectingLocation = false;
  document.getElementById('map-hint').classList.add('hidden');
  map.getContainer().style.cursor = '';
}

// ======== Filters ========
function updateFiltersOptions() {
  const regioes = [...new Set(allFiscalizacoes.map(f => f.regiao_administrativa).filter(Boolean))].sort();
  const anos = [...new Set(allFiscalizacoes.map(f => f.ano).filter(Boolean))].sort((a, b) => b - a);

  const regiaoSelect = document.getElementById('filter-regiao');
  const currentRegiao = regiaoSelect.value;
  regiaoSelect.innerHTML = '<option value="">Todas as Regiões</option>';
  regioes.forEach(r => {
    const option = document.createElement('option');
    option.value = r;
    option.textContent = r;
    if (r === currentRegiao) option.selected = true;
    regiaoSelect.appendChild(option);
  });

  const anoSelect = document.getElementById('filter-ano');
  const currentAno = anoSelect.value;
  anoSelect.innerHTML = '<option value="">Todos os Anos</option>';
  anos.forEach(a => {
    const option = document.createElement('option');
    option.value = a;
    option.textContent = a;
    if (String(a) === currentAno) option.selected = true;
    anoSelect.appendChild(option);
  });
}

function applyFilters() {
  const search = document.getElementById('filter-search').value.toLowerCase();
  const regiao = document.getElementById('filter-regiao').value;
  const situacao = document.getElementById('filter-situacao').value;
  const ano = document.getElementById('filter-ano').value;
  const conformidade = parseInt(document.getElementById('filter-conformidade').value, 10);

  filteredFiscalizacoes = allFiscalizacoes.filter(f => {
    if (search && !f.id?.toLowerCase().includes(search) &&
        !f.processo_sei?.toLowerCase().includes(search) &&
        !f.destinatario?.toLowerCase().includes(search)) return false;

    if (regiao && f.regiao_administrativa !== regiao) return false;
    if (situacao && f.situacao !== situacao) return false;
    if (ano && String(f.ano) !== ano) return false;
    if (conformidade && (!f.indice_conformidade || f.indice_conformidade < conformidade)) return false;
    return true;
  });

  updateMapMarkers();
  renderFiscalizacoesList();
  document.getElementById('count-badge').textContent = filteredFiscalizacoes.length;
}
window.applyFilters = applyFilters;

function clearFilters() {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-regiao').value = '';
  document.getElementById('filter-situacao').value = '';
  document.getElementById('filter-ano').value = '';
  document.getElementById('filter-conformidade').value = 0;
  document.getElementById('conformidade-label').textContent = '0%+';
  applyFilters();
}
window.clearFilters = clearFilters;

function updateConformidadeLabel() {
  const value = document.getElementById('filter-conformidade').value;
  document.getElementById('conformidade-label').textContent = `${value}%+`;
}
window.updateConformidadeLabel = updateConformidadeLabel;

function renderFiscalizacoesList() {
  const container = document.getElementById('fiscalizacoes-list');

  if (filteredFiscalizacoes.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-500">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <p class="text-sm">Nenhuma fiscalização encontrada</p>
        <p class="text-xs mt-1">Ajuste os filtros ou adicione uma nova</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredFiscalizacoes.map(fisc => {
    const statusClass = fisc.situacao === 'Em Andamento' ? 'status-andamento' :
                        fisc.situacao === 'Concluída' ? 'status-concluida' : 'status-pendente';

    return `
      <div class="p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 cursor-pointer transition-colors border border-slate-700/50"
           onclick="focusFiscalizacao('${fisc.__backendId}')">
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold text-sm">${fisc.id}</span>
          <span class="${statusClass}" style="font-size: 10px; padding: 2px 8px;">${fisc.situacao}</span>
        </div>
        <p class="text-xs text-slate-400 truncate">${fisc.regiao_administrativa || 'Sem região'}</p>
        ${fisc.indice_conformidade ? `
          <div class="mt-2 flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div class="h-full bg-blue-500 rounded-full" style="width: ${fisc.indice_conformidade}%"></div>
            </div>
            <span class="text-xs text-blue-400">${fisc.indice_conformidade}%</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function focusFiscalizacao(backendId) {
  const fisc = allFiscalizacoes.find(f => f.__backendId === backendId);
  if (!fisc) return;

  if (fisc.latitude && fisc.longitude && markers[backendId]) {
    map.setView([fisc.latitude, fisc.longitude], 15);
    markers[backendId].openPopup();
  }
  showDetailPanel(fisc);

  // no mobile, fecha drawer pra liberar mapa/painel
  toggleFiltersPanel(false);
}
window.focusFiscalizacao = focusFiscalizacao;

// ======== Detail Panel ========
function createDetailField(label, value) {
  return `
    <div class="bg-slate-800/50 rounded-lg p-3">
      <p class="text-xs text-slate-500 mb-1">${label}</p>
      <p class="text-sm font-medium text-slate-200">${value || '-'}</p>
    </div>
  `;
}

function showDetailPanel(fisc) {
  currentFiscalizacao = fisc;
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');

  const statusClass = fisc.situacao === 'Em Andamento' ? 'status-andamento' :
                      fisc.situacao === 'Concluída' ? 'status-concluida' : 'status-pendente';

  document.getElementById('detail-title').textContent = fisc.id;
  document.getElementById('delete-detail-btn').onclick = () => confirmDelete(fisc);

  content.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-center">
        <span class="${statusClass} text-base">${fisc.situacao}</span>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Informações Básicas</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Nº Processo SEI', fisc.processo_sei)}
          ${createDetailField('Ano', fisc.ano)}
          ${createDetailField('Região', fisc.regiao_administrativa)}
          ${createDetailField('Destinatário', fisc.destinatario)}
        </div>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Classificação</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Tipo', fisc.direta_indireta)}
          ${createDetailField('Programação', fisc.programada)}
        </div>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Documento</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${createDetailField('Tipo', fisc.tipo_documento)}
          ${createDetailField('Nº SEI', fisc.sei_documento)}
          ${createDetailField('Data', fisc.data ? new Date(fisc.data).toLocaleDateString('pt-BR') : null)}
        </div>

        ${fisc.objetivo ? `
          <div class="mt-3">
            <p class="text-xs text-slate-500 mb-1">Objetivo</p>
            <p class="text-sm text-slate-300 bg-slate-800/50 rounded-lg p-3">${fisc.objetivo}</p>
          </div>
        ` : ''}
      </div>

      ${(fisc.latitude && fisc.longitude) ? `
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Localização</h3>
          <div class="bg-slate-800/50 rounded-lg p-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p class="text-xs text-slate-500">Latitude</p>
                <p class="text-sm font-mono text-slate-300">${fisc.latitude}</p>
              </div>
              <div>
                <p class="text-xs text-slate-500">Longitude</p>
                <p class="text-sm font-mono text-slate-300">${fisc.longitude}</p>
              </div>
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  panel.classList.remove('hidden');
}
window.showDetailPanel = showDetailPanel;

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.add('hidden');
  currentFiscalizacao = null;
}
window.closeDetailPanel = closeDetailPanel;

// ======== Add/Edit Modal ========
function openAddModal() {
  document.getElementById('modal-title').innerHTML = `
    <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
    </svg>
    Nova Fiscalização
  `;
  document.getElementById('submit-text').textContent = 'Salvar Fiscalização';
  document.getElementById('fiscalizacao-form').reset();
  document.getElementById('form-backend-id').value = '';
  document.getElementById('form-ano').value = new Date().getFullYear();
  document.getElementById('form-modal').classList.remove('hidden');
}
window.openAddModal = openAddModal;

function editCurrentFiscalizacao() {
  if (!currentFiscalizacao) return;

  document.getElementById('modal-title').innerHTML = `
    <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
    </svg>
    Editar Fiscalização
  `;
  document.getElementById('submit-text').textContent = 'Atualizar Fiscalização';

  document.getElementById('form-backend-id').value = currentFiscalizacao.__backendId;
  document.getElementById('form-id').value = currentFiscalizacao.id || '';
  document.getElementById('form-processo-sei').value = currentFiscalizacao.processo_sei || '';
  document.getElementById('form-ano').value = currentFiscalizacao.ano || '';
  document.getElementById('form-regiao').value = currentFiscalizacao.regiao_administrativa || '';
  document.getElementById('form-lat').value = currentFiscalizacao.latitude || '';
  document.getElementById('form-lng').value = currentFiscalizacao.longitude || '';
  document.getElementById('form-situacao').value = currentFiscalizacao.situacao || '';
  document.getElementById('form-direta').value = currentFiscalizacao.direta_indireta || '';
  document.getElementById('form-programada').value = currentFiscalizacao.programada || '';
  document.getElementById('form-conformidade').value = currentFiscalizacao.indice_conformidade || '';
  document.getElementById('form-tipo-doc').value = currentFiscalizacao.tipo_documento || '';
  document.getElementById('form-sei-doc').value = currentFiscalizacao.sei_documento || '';
  document.getElementById('form-data').value = currentFiscalizacao.data || '';
  document.getElementById('form-objetivo').value = currentFiscalizacao.objetivo || '';
  document.getElementById('form-destinatario').value = currentFiscalizacao.destinatario || '';
  document.getElementById('form-constatacoes').value = currentFiscalizacao.constatacoes || '';
  document.getElementById('form-nao-conformes').value = currentFiscalizacao.constatacoes_nao_conformes || '';
  document.getElementById('form-recomendacoes').value = currentFiscalizacao.recomendacoes || '';
  document.getElementById('form-determinacoes').value = currentFiscalizacao.determinacoes || '';
  document.getElementById('form-tn').value = currentFiscalizacao.termos_notificacao || '';
  document.getElementById('form-ai').value = currentFiscalizacao.autos_infracao || '';
  document.getElementById('form-tac').value = currentFiscalizacao.termos_ajuste || '';

  closeDetailPanel();
  document.getElementById('form-modal').classList.remove('hidden');
}
window.editCurrentFiscalizacao = editCurrentFiscalizacao;

function closeModal() {
  document.getElementById('form-modal').classList.add('hidden');
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
  disableMapSelection();
}
window.closeModal = closeModal;

// ======== Submit (create/update) ========
async function handleSubmit(event) {
  event.preventDefault();

  const backendId = document.getElementById('form-backend-id').value;
  const isEditing = !!backendId;

  if (!isEditing && allFiscalizacoes.length >= 999) {
    showToast('Limite de 999 fiscalizações atingido. Exclua algumas para continuar.', 'error');
    return;
  }

  let lat = parseFloat(document.getElementById('form-lat').value);
  let lng = parseFloat(document.getElementById('form-lng').value);
  const regiao = document.getElementById('form-regiao').value;

  if ((!lat || !lng) && regiao && regionCoordinates[regiao]) {
    const [baseLat, baseLng] = regionCoordinates[regiao];
    lat = baseLat + (Math.random() - 0.5) * 0.02;
    lng = baseLng + (Math.random() - 0.5) * 0.02;
  }

  const fiscData = {
    id: document.getElementById('form-id').value,
    processo_sei: document.getElementById('form-processo-sei').value,
    ano: parseInt(document.getElementById('form-ano').value, 10) || null,
    objetivo: document.getElementById('form-objetivo').value,
    regiao_administrativa: regiao,
    situacao: document.getElementById('form-situacao').value,
    tipo_documento: document.getElementById('form-tipo-doc').value,
    destinatario: document.getElementById('form-destinatario').value,
    direta_indireta: document.getElementById('form-direta').value,
    programada: document.getElementById('form-programada').value,
    sei_documento: document.getElementById('form-sei-doc').value,
    data: document.getElementById('form-data').value,
    constatacoes: document.getElementById('form-constatacoes').value,
    constatacoes_nao_conformes: parseInt(document.getElementById('form-nao-conformes').value, 10) || null,
    recomendacoes: document.getElementById('form-recomendacoes').value,
    determinacoes: document.getElementById('form-determinacoes').value,
    termos_notificacao: parseInt(document.getElementById('form-tn').value, 10) || null,
    autos_infracao: parseInt(document.getElementById('form-ai').value, 10) || null,
    termos_ajuste: parseInt(document.getElementById('form-tac').value, 10) || null,
    indice_conformidade: parseFloat(document.getElementById('form-conformidade').value) || null,
    latitude: lat || null,
    longitude: lng || null
  };

  showLoading(isEditing ? 'Atualizando...' : 'Salvando...');

  let result;
  if (isEditing) {
    const existingRecord = allFiscalizacoes.find(f => f.__backendId === backendId);
    if (existingRecord) {
      result = await window.dataSdk.update({ ...existingRecord, ...fiscData, __backendId: backendId });
    } else {
      result = { isOk: false };
    }
  } else {
    result = await window.dataSdk.create(fiscData);
  }

  hideLoading();

  if (result && result.isOk) {
    showToast(isEditing ? 'Fiscalização atualizada!' : 'Fiscalização criada!', 'success');
    closeModal();
  } else {
    showToast('Erro ao salvar fiscalização', 'error');
  }
}
window.handleSubmit = handleSubmit;

// ======== Delete ========
function confirmDelete(fisc) {
  deleteTarget = fisc;
  document.getElementById('delete-confirm').classList.remove('hidden');
  document.getElementById('confirm-delete-btn').onclick = executeDelete;
}
window.confirmDelete = confirmDelete;

function cancelDelete() {
  deleteTarget = null;
  document.getElementById('delete-confirm').classList.add('hidden');
}
window.cancelDelete = cancelDelete;

async function executeDelete() {
  if (!deleteTarget) return;

  document.getElementById('delete-confirm').classList.add('hidden');
  showLoading('Excluindo...');

  const result = await window.dataSdk.delete(deleteTarget);

  hideLoading();

  if (result.isOk) {
    showToast('Fiscalização excluída!', 'success');
    closeDetailPanel();
  } else {
    showToast('Erro ao excluir fiscalização', 'error');
  }

  deleteTarget = null;
}

// ======== Dashboard ========
function toggleDashboard() {
  const panel = document.getElementById('dashboard-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) updateDashboard();
}
window.toggleDashboard = toggleDashboard;

function updateDashboard() {
  const total = allFiscalizacoes.length;
  const andamento = allFiscalizacoes.filter(f => f.situacao === 'Em Andamento').length;
  const concluida = allFiscalizacoes.filter(f => f.situacao === 'Concluída').length;
  const pendente = allFiscalizacoes.filter(f => f.situacao === 'Pendente').length;

  const conformidades = allFiscalizacoes.filter(f => f.indice_conformidade).map(f => f.indice_conformidade);
  const avgConformidade = conformidades.length > 0
    ? Math.round(conformidades.reduce((a, b) => a + b, 0) / conformidades.length)
    : 0;

  const totalAI = allFiscalizacoes.reduce((sum, f) => sum + (f.autos_infracao || 0), 0);
  const totalTN = allFiscalizacoes.reduce((sum, f) => sum + (f.termos_notificacao || 0), 0);

  document.getElementById('metric-total').textContent = total;
  document.getElementById('metric-andamento').textContent = andamento;
  document.getElementById('metric-concluida').textContent = concluida;
  document.getElementById('metric-pendente').textContent = pendente;
  document.getElementById('metric-conformidade').textContent = `${avgConformidade}%`;
  document.getElementById('metric-ai').textContent = totalAI;
  document.getElementById('metric-tn').textContent = totalTN;

  const maxStatus = Math.max(andamento, concluida, pendente, 1);
  document.getElementById('chart-situacao').innerHTML = `
    <div class="flex flex-col items-center">
      <div class="w-16 bg-slate-700 rounded-t-lg relative" style="height: ${(andamento / maxStatus) * 150}px; min-height: 20px;">
        <div class="absolute inset-0 bg-gradient-to-t from-amber-500 to-yellow-400 rounded-t-lg"></div>
      </div>
      <p class="text-xl font-bold mt-2 text-amber-400">${andamento}</p>
      <p class="text-xs text-slate-400">Andamento</p>
    </div>
    <div class="flex flex-col items-center">
      <div class="w-16 bg-slate-700 rounded-t-lg relative" style="height: ${(concluida / maxStatus) * 150}px; min-height: 20px;">
        <div class="absolute inset-0 bg-gradient-to-t from-emerald-500 to-green-400 rounded-t-lg"></div>
      </div>
      <p class="text-xl font-bold mt-2 text-emerald-400">${concluida}</p>
      <p class="text-xs text-slate-400">Concluída</p>
    </div>
    <div class="flex flex-col items-center">
      <div class="w-16 bg-slate-700 rounded-t-lg relative" style="height: ${(pendente / maxStatus) * 150}px; min-height: 20px;">
        <div class="absolute inset-0 bg-gradient-to-t from-red-500 to-rose-400 rounded-t-lg"></div>
      </div>
      <p class="text-xl font-bold mt-2 text-red-400">${pendente}</p>
      <p class="text-xs text-slate-400">Pendente</p>
    </div>
  `;

  const regionCounts = {};
  allFiscalizacoes.forEach(f => {
    if (f.regiao_administrativa) regionCounts[f.regiao_administrativa] = (regionCounts[f.regiao_administrativa] || 0) + 1;
  });

  const sortedRegions = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
  const maxRegion = sortedRegions.length > 0 ? sortedRegions[0][1] : 1;

  document.getElementById('chart-regiao').innerHTML = sortedRegions.length > 0
    ? sortedRegions.map(([region, count]) => `
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400 w-32 truncate">${region}</span>
        <div class="flex-1 h-5 bg-slate-700 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500"
               style="width: ${(count / maxRegion) * 100}%"></div>
        </div>
        <span class="text-sm font-semibold text-blue-400 min-w-[30px] text-right">${count}</span>
      </div>
    `).join('')
    : '<p class="text-center text-slate-500 py-8">Nenhuma região cadastrada</p>';
}

// ======== Export ========
function exportToCSV() {
  if (allFiscalizacoes.length === 0) {
    showToast('Nenhuma fiscalização para exportar', 'warning');
    return;
  }

  const headers = [
    'ID', 'Processo SEI', 'Ano', 'Objetivo', 'Região', 'Situação',
    'Tipo Documento', 'Destinatário', 'Direta/Indireta', 'Programada',
    'SEI Documento', 'Data', 'Constatações', 'Não Conformes',
    'Recomendações', 'Determinações', 'TN', 'AI', 'TAC',
    'Conformidade', 'Latitude', 'Longitude'
  ];

  const rows = allFiscalizacoes.map(f => [
    f.id, f.processo_sei, f.ano, f.objetivo, f.regiao_administrativa,
    f.situacao, f.tipo_documento, f.destinatario, f.direta_indireta,
    f.programada, f.sei_documento, f.data, f.constatacoes,
    f.constatacoes_nao_conformes, f.recomendacoes, f.determinacoes,
    f.termos_notificacao, f.autos_infracao, f.termos_ajuste,
    f.indice_conformidade, f.latitude, f.longitude
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `fiscalizacoes_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  showToast('Arquivo exportado!', 'success');
}
window.exportToCSV = exportToCSV;

// ======== Toast / Loading ========
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');

  const colors = {
    success: 'bg-emerald-600',
    error: 'bg-red-600',
    warning: 'bg-amber-600',
    info: 'bg-blue-600'
  };

  const icons = {
    success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>',
    error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>',
    warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
    info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
  };

  toast.className = `${colors[type]} px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 fade-in`;
  toast.innerHTML = `
    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icons[type]}</svg>
    <span class="text-sm font-medium text-white">${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
window.showToast = showToast;

function showLoading(text = 'Carregando...') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

// ======== Import ========
function openImportModal() {
  document.getElementById('import-modal').classList.remove('hidden');
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-preview').classList.add('hidden');
}
window.openImportModal = openImportModal;

function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-preview').classList.add('hidden');
}
window.closeImportModal = closeImportModal;

function previewImport() {
  const text = document.getElementById('import-textarea').value.trim();
  if (!text) {
    showToast('Cole os dados primeiro', 'warning');
    return;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sample = lines.slice(0, 3).join('\n');
  const delim = sample.includes('\t') ? '\t' : ',';

  const previewBody = document.getElementById('preview-body');
  previewBody.innerHTML = '';

  const firstCells = lines[0].split(delim).map(s => (s ?? '').toString().trim());
  const hasHeader = firstCells.some(c => /id/i.test(c)) && firstCells.some(c => /processo|sei|nº/i.test(c));
  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < Math.min(startIndex + 5, lines.length); i++) {
    const cells = lines[i].split(delim);
    const row = document.createElement('tr');
    row.className = 'border-t border-slate-600';
    row.innerHTML = `
      <td class="px-2 py-2 text-slate-300">${cells[0] || '-'}</td>
      <td class="px-2 py-2 text-slate-300">${cells[4] || '-'}</td>
      <td class="px-2 py-2 text-slate-300">${cells[5] || '-'}</td>
      <td class="px-2 py-2 text-slate-300">${cells[19] || '-'}</td>
    `;
    previewBody.appendChild(row);
  }

  document.getElementById('import-preview').classList.remove('hidden');
}
window.previewImport = previewImport;

async function executeImport() {
  const text = document.getElementById('import-textarea').value.trim();
  if (!text) {
    showToast('Cole os dados primeiro', 'warning');
    return;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 1) {
    showToast('Dados inválidos', 'error');
    return;
  }

  const sample = lines.slice(0, 3).join('\n');
  const delim = sample.includes('\t') ? '\t' : ',';

  const norm = (v) => (v ?? '').toString().trim();

  const parseNumber = (v) => {
    const s = norm(v);
    if (!s || s === '#ERROR!') return null;
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const parseIntSafe = (v) => {
    const n = parseNumber(v);
    return n === null ? null : Math.trunc(n);
  };

  const parseDateToISO = (v) => {
    const s = norm(v);
    if (!s || s === '#ERROR!') return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [a, b, c] = s.split('/').map(x => parseInt(x, 10));
      let day, month;
      if (a > 12) { day = a; month = b; } else { month = a; day = b; }
      const yyyy = c;
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return '';
  };

  const firstCells = lines[0].split(delim).map(norm);
  const hasHeader =
    firstCells.some(c => /id/i.test(c)) &&
    firstCells.some(c => /processo|sei|nº/i.test(c));

  const startIndex = hasHeader ? 1 : 0;
  const dataLines = lines.slice(startIndex);

  if (dataLines.length < 1) {
    showToast('Dados inválidos', 'error');
    return;
  }

  const newCount = dataLines.length;
  if (allFiscalizacoes.length + newCount > 999) {
    showToast(`Você tem ${allFiscalizacoes.length} registros. Máximo é 999.`, 'error');
    return;
  }

  showLoading(`Importando ${newCount} registros...`);
  const btn = document.getElementById('import-btn');
  btn.disabled = true;

  let imported = 0;
  let failed = 0;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const cells = line.split(delim);

    if (cells.length < 6) { failed++; continue; }

    let regiaoRaw = norm(cells[4]);
    let regiao = regiaoRaw;

    const brasiliaCenter = { lat: -15.7942, lng: -47.8822 };

    if (/^distrito\s*federal$/i.test(regiaoRaw)) {
      regiao = 'Plano Piloto';
    }

    let lat = parseNumber(cells[20]);
    let lng = parseNumber(cells[21]);

    if ((!lat || !lng)) {
      if (regiao && regionCoordinates[regiao]) {
        const [baseLat, baseLng] = regionCoordinates[regiao];
        lat = baseLat + (Math.random() - 0.5) * 0.02;
        lng = baseLng + (Math.random() - 0.5) * 0.02;
      } else if (/^distrito\s*federal$/i.test(regiaoRaw)) {
        lat = brasiliaCenter.lat + (Math.random() - 0.5) * 0.02;
        lng = brasiliaCenter.lng + (Math.random() - 0.5) * 0.02;
      }
    }

    const fiscData = {
      id: norm(cells[0]),
      processo_sei: norm(cells[1]),
      ano: parseIntSafe(cells[2]),
      objetivo: norm(cells[3]),
      regiao_administrativa: regiao || null,
      situacao: norm(cells[5]),
      tipo_documento: norm(cells[6]),
      destinatario: norm(cells[7]),
      direta_indireta: norm(cells[8]),
      programada: norm(cells[9]),
      sei_documento: norm(cells[10]),
      data: parseDateToISO(cells[11]),
      constatacoes: norm(cells[12]),
      constatacoes_nao_conformes: parseIntSafe(cells[13]),
      recomendacoes: norm(cells[14]),
      determinacoes: norm(cells[15]),
      termos_notificacao: parseIntSafe(cells[16]),
      autos_infracao: parseIntSafe(cells[17]),
      termos_ajuste: parseIntSafe(cells[18]),
      indice_conformidade: parseNumber(cells[19]),
      latitude: lat || null,
      longitude: lng || null
    };

    const result = await window.dataSdk.create(fiscData);
    if (result && result.isOk) imported++;
    else failed++;

    const progress = Math.round(((i + 1) / dataLines.length) * 100);
    document.getElementById('loading-text').textContent =
      `Importando... ${progress}% (${imported}/${newCount})`;
  }

  hideLoading();
  btn.disabled = false;

  if (imported > 0) {
    showToast(`✅ ${imported} fiscalizações importadas!`, 'success');
    closeImportModal();
  }
  if (failed > 0) {
    showToast(`⚠️ ${failed} registros falharam`, 'warning');
  }
}
window.executeImport = executeImport;

// ======== Init ========
async function init() {
  // títulos
  const t = document.getElementById('app-title');
  const s = document.getElementById('app-subtitle');
  if (t) t.textContent = defaultConfig.app_title;
  if (s) s.textContent = defaultConfig.subtitle;

  initStorageModeSelector();
  initMap();
  await initDataSDK();
}
init();
