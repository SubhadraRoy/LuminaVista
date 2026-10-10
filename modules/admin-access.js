// modules/admin-access.js - Sovereign Admin Access & Security Credentials Management Module for LuminaVista OS
(function(window) {
  'use strict';

  let adminPasswords = [];
  let isSubmitting = false;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  /**
   * Switches sub-tabs inside Settings (System Preferences vs Admin Security)
   */
  function switchSettingsSubTab(subtab) {
    const generalBtn = document.getElementById('btnSettingsGeneral');
    const adminBtn = document.getElementById('btnSettingsAdmin');
    const generalPane = document.getElementById('settingsGeneralPane');
    const adminPane = document.getElementById('settingsAdminPane');

    if (!generalPane || !adminPane) return;

    if (subtab === 'admin') {
      generalPane.classList.add('hidden');
      adminPane.classList.remove('hidden');

      if (adminBtn) {
        adminBtn.className = 'settings-subtab-btn flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10 cursor-pointer';
      }
      if (generalBtn) {
        generalBtn.className = 'settings-subtab-btn flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-zinc-400 hover:text-white border border-transparent cursor-pointer';
      }

      loadAdminPasswords();
    } else {
      adminPane.classList.add('hidden');
      generalPane.classList.remove('hidden');

      if (generalBtn) {
        generalBtn.className = 'settings-subtab-btn flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10 cursor-pointer';
      }
      if (adminBtn) {
        adminBtn.className = 'settings-subtab-btn flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-zinc-400 hover:text-white border border-transparent cursor-pointer';
      }
    }

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  /**
   * Fetches the list of active credentials from the backend
   */
  async function loadAdminPasswords() {
    const listEl = document.getElementById('adminPasswordsList');
    const countBadge = document.getElementById('adminPasswordsCountBadge');
    if (!listEl) return;

    try {
      const res = await fetch('/api/admin?action=passwords', {
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': localStorage.getItem('lumina_session_id') || ''
        }
      });

      if (res.ok) {
        const data = await res.json();
        adminPasswords = Array.isArray(data.passwords) ? data.passwords : [];
      } else {
        // Fallback to local storage cache if offline
        const local = localStorage.getItem('lumina_admin_passwords_cache');
        if (local) adminPasswords = JSON.parse(local);
      }
    } catch (e) {
      const local = localStorage.getItem('lumina_admin_passwords_cache');
      if (local) adminPasswords = JSON.parse(local);
    }

    renderAdminPasswordsList();
    if (countBadge) {
      countBadge.textContent = `${adminPasswords.length} Active`;
    }
  }

  /**
   * Renders the list of configured passwords in the DOM
   */
  function renderAdminPasswordsList() {
    const listEl = document.getElementById('adminPasswordsList');
    if (!listEl) return;

    if (adminPasswords.length === 0) {
      listEl.innerHTML = `
        <div class="p-6 rounded-2xl bg-surface-900/60 border border-white/5 text-center space-y-2">
          <div class="w-10 h-10 mx-auto rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <i data-lucide="shield-check" class="w-5 h-5"></i>
          </div>
          <div class="text-xs font-semibold text-white">System Administrator Key Active</div>
          <div class="text-[11px] text-zinc-400 max-w-sm mx-auto">
            Primary system administrator authentication is active. Provision additional credentials above to authorize secondary keys.
          </div>
        </div>
      `;
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      return;
    }

    listEl.innerHTML = adminPasswords.map(key => {
      const dateStr = key.createdAt ? new Date(key.createdAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : 'Recently';

      return `
        <div class="p-3.5 rounded-2xl bg-surface-900/80 border border-white/10 hover:border-cyan-500/30 transition-all flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <i data-lucide="key" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-white truncate">${escapeHtml(key.label)}</span>
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active
                </span>
              </div>
              <div class="flex items-center gap-2 text-[10px] font-mono text-zinc-400 mt-0.5">
                <span>${escapeHtml(key.preview || '••••••••')}</span>
                <span>•</span>
                <span>Added ${dateStr}</span>
              </div>
            </div>
          </div>
          <button onclick="window.LuminaAdminAccess.deletePassword('${escapeHtml(key.id)}')" class="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0" title="Revoke access credential">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Revoke
          </button>
        </div>
      `;
    }).join('');

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  /**
   * Generates a secure random access password
   */
  function generateRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let res = 'Lv-';
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(10);
      window.crypto.getRandomValues(bytes);
      for (let i = 0; i < 10; i++) {
        res += chars.charAt(bytes[i] % chars.length);
      }
    } else {
      for (let i = 0; i < 10; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    const input = document.getElementById('adminNewPasswordInput');
    if (input) {
      input.value = res;
      input.type = 'text';
      const eyeIcon = document.getElementById('adminEyeIcon');
      if (eyeIcon) eyeIcon.setAttribute('data-lucide', 'eye-off');
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }
  }

  /**
   * Toggles visibility of password input
   */
  function togglePasswordVisibility() {
    const input = document.getElementById('adminNewPasswordInput');
    const eyeIcon = document.getElementById('adminEyeIcon');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (eyeIcon) eyeIcon.setAttribute('data-lucide', 'eye-off');
    } else {
      input.type = 'password';
      if (eyeIcon) eyeIcon.setAttribute('data-lucide', 'eye');
    }
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  /**
   * Creates a new access password
   */
  async function createPassword() {
    if (isSubmitting) return;
    const labelInput = document.getElementById('adminKeyLabelInput');
    const passInput = document.getElementById('adminNewPasswordInput');
    const errorEl = document.getElementById('adminKeyErrorMsg');
    const btn = document.getElementById('btnSubmitAdminKey');

    const label = labelInput ? labelInput.value.trim() : '';
    const password = passInput ? passInput.value.trim() : '';

    if (errorEl) errorEl.classList.add('hidden');

    if (!password || password.length < 4) {
      if (errorEl) {
        errorEl.textContent = 'Password must be at least 4 characters long.';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    isSubmitting = true;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin inline mr-1"></i> Provisioning...`;
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': localStorage.getItem('lumina_session_id') || ''
        },
        body: JSON.stringify({
          action: 'create',
          label: label || 'Admin Key',
          password
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (passInput) passInput.value = '';
        if (labelInput) labelInput.value = '';
        if (window.showToast) {
          window.showToast('Admin Security', 'Access password provisioned successfully.');
        }
        await loadAdminPasswords();
      } else {
        if (errorEl) {
          errorEl.textContent = data.error || 'Failed to create password.';
          errorEl.classList.remove('hidden');
        }
      }
    } catch (e) {
      if (errorEl) {
        errorEl.textContent = 'Network error while provisioning password.';
        errorEl.classList.remove('hidden');
      }
    } finally {
      isSubmitting = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="plus" class="w-4 h-4 inline mr-1"></i> Provision Password`;
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      }
    }
  }

  /**
   * Deletes an access password
   */
  async function deletePassword(id) {
    if (!id) return;
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': localStorage.getItem('lumina_session_id') || ''
        },
        body: JSON.stringify({
          action: 'delete',
          id
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (window.showToast) {
          window.showToast('Admin Security', 'Access credential revoked.');
        }
        await loadAdminPasswords();
      } else {
        if (window.showToast) {
          window.showToast('Error', data.error || 'Failed to revoke credential.');
        }
      }
    } catch (e) {
      if (window.showToast) {
        window.showToast('Error', 'Network error while revoking credential.');
      }
    }
  }

  /**
   * Mounts the Admin Security sub-tab UI into #settingsAdminPane
   */
  function mountAdminSecurityUI() {
    const pane = document.getElementById('settingsAdminPane');
    if (!pane) return;

    pane.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Card 1: Provision New Access Password -->
        <div class="glass-panel rounded-2xl p-5 space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-white/5">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <i data-lucide="key-round" class="w-4 h-4 text-cyan-400"></i> Provision Access Password
            </h3>
            <span class="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">Security Node</span>
          </div>

          <p class="text-xs text-zinc-400">
            Provision authorized administrator passwords for system access, workstation terminals, and authentication checkpoints.
          </p>

          <div class="space-y-3">
            <div class="space-y-1">
              <label for="adminKeyLabelInput" class="text-xs font-mono text-zinc-400">Credential Label / Identifier:</label>
              <input type="text" id="adminKeyLabelInput" placeholder="e.g., Workstation Terminal, Field Laptop, Temporary Access" class="godx-input w-full px-3 py-2 text-xs font-mono" maxlength="50" />
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <label for="adminNewPasswordInput" class="text-xs font-mono text-zinc-400">Access Password:</label>
                <button type="button" onclick="window.LuminaAdminAccess.generateRandomPassword()" class="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1">
                  <i data-lucide="sparkles" class="w-3 h-3"></i> Generate Key
                </button>
              </div>
              <div class="relative">
                <input type="password" id="adminNewPasswordInput" placeholder="Enter secure password (min 4 characters)..." class="godx-input w-full px-3 py-2 pr-10 text-xs font-mono" />
                <button type="button" onclick="window.LuminaAdminAccess.togglePasswordVisibility()" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 cursor-pointer" aria-label="Toggle password visibility">
                  <i id="adminEyeIcon" data-lucide="eye" class="w-4 h-4"></i>
                </button>
              </div>
            </div>

            <div id="adminKeyErrorMsg" class="hidden text-xs text-rose-400 font-mono bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl"></div>

            <button type="button" id="btnSubmitAdminKey" onclick="window.LuminaAdminAccess.createPassword()" class="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition-all shadow-md shadow-cyan-500/20 cursor-pointer flex items-center justify-center gap-1.5">
              <i data-lucide="plus" class="w-4 h-4"></i> Provision Password
            </button>
          </div>
        </div>

        <!-- Card 2: Configured Access Credentials -->
        <div class="glass-panel rounded-2xl p-5 space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-white/5">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <i data-lucide="shield" class="w-4 h-4 text-emerald-400"></i> Active Access Passwords
            </h3>
            <span id="adminPasswordsCountBadge" class="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">0 Active</span>
          </div>

          <div id="adminPasswordsList" class="space-y-2.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
            <div class="p-6 text-center text-xs text-zinc-500 font-mono">Loading credentials...</div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  function init() {
    mountAdminSecurityUI();
  }

  // Export to window
  window.LuminaAdminAccess = {
    init,
    switchSettingsSubTab,
    loadAdminPasswords,
    createPassword,
    deletePassword,
    generateRandomPassword,
    togglePasswordVisibility,
    getPasswords: () => [...adminPasswords]
  };

  window.switchSettingsSubTab = switchSettingsSubTab;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
