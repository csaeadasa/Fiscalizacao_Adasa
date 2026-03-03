// Data SDK local (localStorage)
window.elementSdk = null;

window.dataSdk = {
  _key: "fiscalizacoes_storage",
  _backupKey: "fiscalizacoes_storage_backup",
  _legacyKeys: ["fiscalizacoes_v1"],
  _modeKey: "fiscalizacoes_storage_mode",
  _handler: null,
  _data: [],
  _lastSource: "local",

  async init(handler) {
    this._handler = handler;

    let records = [];
    let loadedFromBackend = false;
    const activeMode = this.getActiveMode();

    if (activeMode === "api") {
      const remote = await this._fetchRemoteRecords();
      if (remote) {
        records = remote;
        loadedFromBackend = true;
      }
    }

    if (!loadedFromBackend) {
      records = this._loadStoredRecords();
    }

    this._data = records.map((r) => ({
      __backendId: r.__backendId || this._generateId(),
      ...r
    }));

    const persisted = this._persist();
    this._lastSource = loadedFromBackend ? "api" : "local";
    this._notify();

    return {
      isOk: loadedFromBackend || persisted,
      mode: activeMode,
      source: loadedFromBackend ? "api" : "local"
    };
  },

  _generateId() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random();
  },

  _loadStoredRecords() {
    const candidateKeys = [this._key, this._backupKey, ...this._legacyKeys];

    for (const key of candidateKeys) {
      const parsed = this._readRecordsFromKey(key);
      if (parsed.length > 0) return parsed;
    }

    return [];
  },

  _readRecordsFromKey(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.records)) return parsed.records;
      return [];
    } catch {
      return [];
    }
  },

  _persist() {
    const payload = JSON.stringify({
      version: 2,
      updatedAt: new Date().toISOString(),
      records: this._data
    });

    try {
      localStorage.setItem(this._key, payload);
      localStorage.setItem(this._backupKey, payload);

      for (const legacyKey of this._legacyKeys) {
        localStorage.setItem(legacyKey, JSON.stringify(this._data));
      }

      return true;
    } catch {
      return false;
    }
  },

  _notify() {
    this._handler?.onDataChanged?.(this._data);
  },

  async create(record) {
    const rec = {
      __backendId: this._generateId(),
      ...record
    };

    if (this._hasBackend()) {
      const remote = await this._createRemoteRecord(rec);
      if (!remote) return { isOk: false };
      rec.__backendId = remote.__backendId || rec.__backendId;
    }

    this._data.push(rec);

    if (!this._persist()) return { isOk: false };

    this._notify();
    return { isOk: true };
  },

  async update(record) {
    const idx = this._data.findIndex((r) => r.__backendId === record.__backendId);
    if (idx === -1) return { isOk: false };

    const updatedRecord = { ...this._data[idx], ...record };

    if (this._hasBackend()) {
      const remoteOk = await this._updateRemoteRecord(updatedRecord);
      if (!remoteOk) return { isOk: false };
    }

    this._data[idx] = updatedRecord;

    if (!this._persist()) return { isOk: false };

    this._notify();
    return { isOk: true };
  },

  async delete(record) {
    const before = this._data.length;

    if (this._hasBackend()) {
      const remoteOk = await this._deleteRemoteRecord(record);
      if (!remoteOk) return { isOk: false };
    }

    this._data = this._data.filter((r) => r.__backendId !== record.__backendId);

    if (this._data.length === before) return { isOk: false };
    if (!this._persist()) return { isOk: false };

    this._notify();
    return { isOk: true };
  },

  _getBackendConfig() {
    return window.APP_BACKEND_CONFIG || {};
  },

  getStorageMode() {
    const config = this._getBackendConfig();
    const storedMode = localStorage.getItem(this._modeKey);
    const mode = storedMode || config.mode || "local";
    return mode === "api" ? "api" : "local";
  },

  getActiveMode() {
    if (this.getStorageMode() === "api" && this.isApiConfigured()) {
      return "api";
    }

    return "local";
  },

  setStorageMode(mode) {
    const nextMode = mode === "api" ? "api" : "local";
    localStorage.setItem(this._modeKey, nextMode);
    return nextMode;
  },

  getLastSource() {
    return this._lastSource;
  },

  isApiConfigured() {
    const config = this._getBackendConfig();
    return Boolean(config.baseUrl);
  },

  _hasBackend() {
    return this.getActiveMode() === "api";
  },

  _buildUrl(path) {
    const config = this._getBackendConfig();
    const baseUrl = (config.baseUrl || "").replace(/\/+$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  },

  _getHeaders() {
    const config = this._getBackendConfig();
    const headers = {
      "Content-Type": "application/json"
    };

    if (config.token) {
      headers.Authorization = `Bearer ${config.token}`;
    }

    return headers;
  },

  async _fetchJson(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this._getHeaders(),
          ...(options.headers || {})
        }
      });

      if (!response.ok) return null;
      if (response.status === 204) return {};

      return await response.json();
    } catch {
      return null;
    }
  },

  async _fetchRemoteRecords() {
    const payload = await this._fetchJson(this._buildUrl("/fiscalizacoes"), {
      method: "GET"
    });

    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.records)) return payload.records;
    return null;
  },

  async _createRemoteRecord(record) {
    const payload = await this._fetchJson(this._buildUrl("/fiscalizacoes"), {
      method: "POST",
      body: JSON.stringify(record)
    });

    if (!payload) return null;
    return payload.record || payload;
  },

  async _updateRemoteRecord(record) {
    const payload = await this._fetchJson(this._buildUrl(`/fiscalizacoes/${encodeURIComponent(record.__backendId)}`), {
      method: "PUT",
      body: JSON.stringify(record)
    });

    return Boolean(payload);
  },

  async _deleteRemoteRecord(record) {
    const payload = await this._fetchJson(this._buildUrl(`/fiscalizacoes/${encodeURIComponent(record.__backendId)}`), {
      method: "DELETE"
    });

    return payload !== null;
  }
};
