// mindNet - Client-side File Sharing Demo
// Uses IndexedDB for persistence, File API for handling, pdf.js for PDF preview

class mindNet {
  constructor() {
    this.dbName = 'mindNetDB';
    this.dbVersion = 1;
    this.storeName = 'files';
    this.db = null;
    this.currentFile = null;
    this.filesData = [];
    this.filteredFiles = [];
    this.searchTerm = '';
    this.sortBy = 'name';
    this.maxFileSize = 50 * 1024 * 1024; // 50MB
    this.password = 'Pyanamwamba';
    this.isAuthenticated = false;
    this.uploadProgress = {};
    this.searchTimeout = null;
    this.init();
  }

  init() {
    this.setupUI();
    this.openDB();
  }

  setupUI() {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const modal = document.getElementById('preview-modal');
    const closeBtn = document.querySelector('.close');
    const preview = document.getElementById('preview');

    // Drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
      uploadZone.addEventListener(event, e => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    uploadZone.addEventListener('drop', e => {
      this.handleFiles(e.dataTransfer.files);
      uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('dragover', e => {
      uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => this.handleFiles(e.target.files));

    closeBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', e => {
      if (e.target === modal) modal.style.display = 'none';
    });

    document.getElementById('share-btn').addEventListener('click', () => {
      if (this.currentFile) {
        const url = URL.createObjectURL(this.currentFile.blob);
        navigator.clipboard.writeText(url).then(() => {
          alert('Share link copied! (Data URL, valid in current session)');
        });
      }
    });

    document.getElementById('download-btn').addEventListener('click', () => {
      if (this.currentFile) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(this.currentFile.blob);
        a.download = this.currentFile.name;
        a.click();
      }
    });

    document.getElementById('delete-btn').addEventListener('click', () => {
      if (this.currentFile && confirm('Delete this file?')) {
        this.deleteFile(this.currentFile.id);
      }
    });
  }

  async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.loadFiles();
        resolve();
      };

      request.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('name', 'name', { unique: false });
        }
      };
    });
  }

  handleFiles(files) {
    if (!this.isAuthenticated) {
      alert('Please authenticate first');
      return;
    }
    Array.from(files).forEach(file => this.addFile(file));
  }

  async addFile(file) {
    // Check file size limit
    if (file.size > this.maxFileSize) {
      alert(`File too large! Max size: ${this.formatBytes(this.maxFileSize)}`);
      return;
    }

    // Show loading
    const uploadZone = document.getElementById('upload-zone');
    uploadZone.classList.add('loading');

    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const fileData = {
          name: file.name,
          size: this.formatBytes(file.size),
          type: file.type,
          lastModified: new Date(file.lastModified).toLocaleString(),
          blob: file,
          data: e.target.result // ArrayBuffer for storage
        };

        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const request = store.add(fileData);

        request.onsuccess = () => {
          uploadZone.classList.remove('loading');
          this.loadFiles();
        };

        request.onerror = () => {
          uploadZone.classList.remove('loading');
          alert('Error saving file to storage');
        };
      } catch (error) {
        uploadZone.classList.remove('loading');
        alert('Error processing file: ' + error.message);
      }
    };
    reader.onerror = () => {
      uploadZone.classList.remove('loading');
      alert('Error reading file');
    };
    reader.readAsArrayBuffer(file);
  }

  async loadFiles() {
    if (!this.isAuthenticated) return;
    
    const tx = this.db.transaction([this.storeName], 'readonly');
    const store = tx.objectStore(this.storeName);
    const request = store.getAll();

    request.onsuccess = e => {
      this.filesData = e.target.result;
      this.filteredFiles = [...this.filesData];
      this.renderFiles(this.filteredFiles);
      this.updateStats();
    };

    request.onerror = () => {
      console.error('Error loading files');
    };
  }

  renderFiles(files) {
    const container = document.getElementById('files');
    container.innerHTML = '';

    if (files.length === 0) {
      container.innerHTML = '<li class="no-files">🚀 No files yet! Drag & drop to start.<br><small>Search works after uploading</small></li>';
      return;
    }

    files.forEach(fileData => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.dataset.id = fileData.id;
      li.style.animation = 'fadeInUp 0.6s ease-out';

      const icon = this.getFileIcon(fileData.type);
      const size = fileData.size;

      li.innerHTML = `
        <div class="file-icon">${icon}</div>
        <div class="file-details">
          <div class="file-name">${fileData.name}</div>
          <div class="file-meta">
            <span class="file-size">${size}</span>
            <span class="file-date">${fileData.lastModified}</span>
          </div>
        </div>
        <div class="file-actions">
          <button class="preview-btn" onclick="mindNetApp.previewFile(${fileData.id})" title="Preview">👁️</button>
          <button class="share-btn" onclick="mindNetApp.shareFile(${fileData.id})" title="Share">📤</button>
          <button class="delete-btn" onclick="mindNetApp.deleteFile(${fileData.id})" title="Delete">🗑️</button>
        </div>
      `;
      container.appendChild(li);
    });
  }

  applyFilter() {
    this.filteredFiles = this.filesData.filter(file => 
      file.name.toLowerCase().includes(this.searchTerm.toLowerCase())
    ).sort((a, b) => {
      switch (this.sortBy) {
        case 'size':
          return a.blob.size - b.blob.size;
        case 'date':
          return new Date(b.lastModified) - new Date(a.lastModified);
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });
    this.renderFiles(this.filteredFiles);
    this.updateStats();
  }

  filterFiles(term) {
    // Debounced search
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.searchTerm = term;
      this.applyFilter();
    }, 300);
  }

  sortFiles(by) {
    this.sortBy = by;
    this.applyFilter();
  }

  updateStats() {
    const stats = document.getElementById('stats');
    const totalSize = this.filesData.reduce((sum, file) => sum + file.blob.size, 0);
    stats.textContent = this.filteredFiles.length + ' files | ' + this.formatBytes(totalSize);
  }

  clearAll() {
    if (confirm('Delete ALL files? This cannot be undone.')) {
      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.clear();
      tx.oncomplete = () => this.loadFiles();
    }
  }

  getFileIcon(type) {
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📄';
    return '📎';
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async previewFile(id) {
    if (!this.isAuthenticated) {
      alert('Please authenticate first');
      return;
    }
    
    const tx = this.db.transaction([this.storeName], 'readonly');
    const store = tx.objectStore(this.storeName);
    const request = store.get(id);

    request.onsuccess = e => {
      this.currentFile = e.target.result;
      const modal = document.getElementById('preview-modal');
      const preview = document.getElementById('preview');
      modal.style.display = 'block';

      const blob = new Blob([this.currentFile.data]);
      const url = URL.createObjectURL(blob);

      if (this.currentFile.type.startsWith('image/')) {
        preview.innerHTML = `<img src="${url}" alt="${this.currentFile.name}">`;
      } else if (this.currentFile.type === 'application/pdf') {
        preview.innerHTML = '<canvas id="pdf-canvas"></canvas>';
        this.renderPDF(url, document.getElementById('pdf-canvas'));
      } else {
        preview.innerHTML = `<video src="${url}" controls style="max-height: 100%;"></video>`;
      }
    };
  }

  async renderPDF(url, canvas) {
    const loadingTask = pdfjsLib.getDocument(url);
    loadingTask.promise.then(pdf => {
      pdf.getPage(1).then(page => {
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        page.render({
          canvasContext: canvas.getContext('2d'),
          viewport: viewport
        });
      });
    });
  }

  async shareFile(id) {
    if (!this.isAuthenticated) {
      alert('Please authenticate first');
      return;
    }
    const file = await this.getFileById(id);
    if (file) {
      const blob = new Blob([file.data]);
      const url = URL.createObjectURL(blob);
      navigator.clipboard.writeText(url).then(() => {
        alert('Share link copied to clipboard! (Paste in new tab)');
      });
    }
  }

  async deleteFile(id) {
    if (!this.isAuthenticated) {
      alert('Please authenticate first');
      return;
    }
    const tx = this.db.transaction([this.storeName], 'readwrite');
    const store = tx.objectStore(this.storeName);
    store.delete(id);
    tx.oncomplete = () => this.loadFiles();
  }

  async getFileById(id) {
    return new Promise(resolve => {
      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(id);
      request.onsuccess = e => resolve(e.target.result);
    });
  }
}

// Global app instance
const mindNetApp = new mindNet();

// Dark mode toggle
mindNetApp.toggleDark = () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', document.body.classList.contains('dark'));
};

document.addEventListener('DOMContentLoaded', () => {
  // Show password modal on load
  document.getElementById('password-modal').style.display = 'block';
  
  // Password handlers
  document.getElementById('password-submit').addEventListener('click', () => {
    const input = document.getElementById('password-input');
    if (input.value === mindNetApp.password) {
      mindNetApp.isAuthenticated = true;
      document.getElementById('password-modal').style.display = 'none';
      mindNetApp.loadFiles();
    } else {
      alert('Incorrect password');
      input.value = '';
    }
  });
  
  document.getElementById('password-cancel').addEventListener('click', () => {
    document.getElementById('password-modal').style.display = 'none';
  });
  
  // Load dark mode
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
  }
  document.getElementById('dark-toggle').addEventListener('click', () => mindNetApp.toggleDark());
  
  // Search & sort
  document.getElementById('search-input').addEventListener('input', e => mindNetApp.filterFiles(e.target.value));
  document.getElementById('sort-select').addEventListener('change', e => mindNetApp.sortFiles(e.target.value));
  
  // Update stats on load
  // mindNetApp.updateStats(); // Moved to after auth
});
