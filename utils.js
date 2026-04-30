// Utility functions
const Utils = {
  // Format tanggal dari input date ke format DB (DD/MM/YYYY)
  formatDateToDB(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  },

  // Format tanggal dari DB ke input date (YYYY-MM-DD)
  formatDateForInput(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return dateStr;
  },

  // Format untuk display
  formatDateForDisplay(dateStr) {
    if (!dateStr) return "";
    return dateStr;
  },

  // Show status message
  showStatus(msg, type) {
    const el = document.getElementById('statusMsg');
    if (el) {
      el.innerText = msg;
      el.className = `status ${type}`;
    }
    setTimeout(() => {
      if (el && el.innerText === msg) el.innerText = '';
    }, 3000);
  },

  // Set tanggal default (hari ini)
  setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const tanggalInput = document.getElementById('tanggal');
    if (tanggalInput && !tanggalInput.value) {
      tanggalInput.value = today;
    }
  }
};