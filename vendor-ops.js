/* Zenzora Vendor daily-operations improvements.
   Loaded after the existing vendor app so existing flows remain in place. */
(function () {
  "use strict";
  if (window.__zenzoraVendorOpsInstalled) return;
  window.__zenzoraVendorOpsInstalled = true;

  const PREP_TIMES = [10, 15, 20, 30, 45, 60];
  let alertTimer = null;
  let searchInstalled = false;
  let originalRenderOrders = null;
  let originalOrderActionHtml = null;
  let originalUpdateOrder = null;
  let originalPlayAlert = null;

  function getOrders() {
    try { return Array.isArray(orders) ? orders : []; }
    catch (_) { return []; }
  }

  function escape(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function toastMessage(message, type) {
    if (typeof toast === "function") toast(message, type || "");
  }

  function dateMatches(value, wanted) {
    if (!wanted) return true;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const [year, month, day] = wanted.split("-").map(Number);
    return date.getFullYear() === year &&
      date.getMonth() + 1 === month &&
      date.getDate() === day;
  }

  function installSearch() {
    const list = document.getElementById("ordersList");
    if (!list || searchInstalled) return;
    const panel = document.createElement("div");
    panel.id = "zenzoraOrderSearch";
    panel.className = "zenzora-order-search";
    panel.innerHTML =
      '<label class="zenzora-search-field">' +
        '<span>Search orders</span>' +
        '<input id="zenzoraOrderQuery" type="search" autocomplete="off" ' +
        'placeholder="Order code or customer first name" aria-label="Search by order code or customer first name">' +
      '</label>' +
      '<label class="zenzora-search-field zenzora-date-field">' +
        '<span>Order date</span>' +
        '<input id="zenzoraOrderDate" type="date" aria-label="Filter orders by date">' +
      '</label>' +
      '<button id="zenzoraClearOrderSearch" type="button" class="zenzora-clear-search">Clear</button>';
    list.parentNode.insertBefore(panel, list);

    panel.querySelector("#zenzoraOrderQuery").addEventListener("input", renderFilteredOrders);
    panel.querySelector("#zenzoraOrderDate").addEventListener("change", renderFilteredOrders);
    panel.querySelector("#zenzoraClearOrderSearch").addEventListener("click", function () {
      panel.querySelector("#zenzoraOrderQuery").value = "";
      panel.querySelector("#zenzoraOrderDate").value = "";
      renderFilteredOrders();
    });
    searchInstalled = true;
  }

  function renderFilteredOrders() {
    const list = document.getElementById("ordersList");
    if (!list) return;
    const query = String(document.getElementById("zenzoraOrderQuery")?.value || "").trim().toLowerCase();
    const date = String(document.getElementById("zenzoraOrderDate")?.value || "");
    const all = getOrders();
    if (!all.length && !query && !date) {
      if (typeof originalRenderOrders === "function") originalRenderOrders();
      return;
    }
    const filtered = all.filter(order => {
      const code = String(order.order_number || order.id || "").toLowerCase();
      const shortId = String(order.id || "").slice(0, 8).toLowerCase();
      const firstName = String(order.customer_name || order.name || "").trim().split(/\s+/)[0].toLowerCase();
      const fullName = String(order.customer_name || order.name || "").toLowerCase();
      const matchesText = !query || code.includes(query) || shortId.includes(query) ||
        firstName.includes(query) || fullName.includes(query);
      return matchesText && dateMatches(order.created_at, date);
    });

    if (!filtered.length) {
      list.innerHTML =
        '<div class="card"><div class="empty-state">' +
        '<div class="empty-icon">🔎</div><div class="empty-title">No matching orders</div>' +
        '<div class="empty-text">Try another order code, customer name or date.</div>' +
        '</div></div>';
      return;
    }
    list.innerHTML = '<div class="orders-list">' + filtered.map(orderCard).join("") + '</div>';
  }

  function addPrepTimeControls(order, existingHtml) {
    if (!order || !["new", "vendor_accepted"].includes(String(order.status || "new"))) {
      return existingHtml;
    }
    const current = Number(order.est_prep_mins || 20);
    const controls = PREP_TIMES.map(minutes =>
      '<button type="button" class="zz-prep-chip ' + (minutes === current ? "is-current" : "") +
      '" aria-label="Set preparation time to ' + minutes + ' minutes" ' +
      'onclick="setVendorPrepTime(\'' + escape(order.id) + '\',' + minutes + ')">' +
      minutes + ' min</button>'
    ).join("");
    return existingHtml +
      '<div class="zz-prep-time" aria-label="Preparation time">' +
      '<span class="zz-prep-label">Prep time</span>' + controls +
      '</div>';
  }

  async function setPrepTime(orderId, minutes) {
    const value = Number(minutes);
    if (!orderId || !PREP_TIMES.includes(value)) return;
    const buttons = document.querySelectorAll('[onclick*="setVendorPrepTime(\'' + orderId + '\'"]');
    buttons.forEach(button => { button.disabled = true; });
    try {
      const result = await supabaseClient.rpc("vendor_set_order_prep_time", {
        p_order_id: orderId,
        p_minutes: value
      });
      if (result.error) throw result.error;
      const updated = result.data;
      const index = getOrders().findIndex(order => order.id === orderId);
      if (index >= 0 && updated) orders[index] = updated;
      if (typeof renderOrders === "function") renderOrders();
      if (typeof updateDashboard === "function") updateDashboard();
      toastMessage("Preparation time set to " + value + " minutes.", "success");
    } catch (error) {
      console.error("Could not update preparation time:", error);
      toastMessage(error.message || "Could not update preparation time.", "error");
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  }
  window.setVendorPrepTime = setPrepTime;

  function pendingNewOrders() {
    return getOrders().filter(order => String(order.status || "new") === "new");
  }

  function stopAlertLoop() {
    if (alertTimer) window.clearInterval(alertTimer);
    alertTimer = null;
  }

  function syncAlertLoop() {
    if (!pendingNewOrders().length) {
      stopAlertLoop();
      return;
    }
    if (alertTimer) return;
    alertTimer = window.setInterval(function () {
      if (document.hidden) return;
      if (!pendingNewOrders().length) {
        stopAlertLoop();
        return;
      }
      if (typeof originalPlayAlert === "function") originalPlayAlert();
    }, 12000);
  }

  function install() {
    if (typeof window.renderOrders === "function" && !originalRenderOrders) {
      originalRenderOrders = window.renderOrders;
      window.renderOrders = function () {
        installSearch();
        renderFilteredOrders();
      };
    }
    if (typeof window.orderActionHtml === "function" && !originalOrderActionHtml) {
      originalOrderActionHtml = window.orderActionHtml;
      window.orderActionHtml = function (order) {
        return addPrepTimeControls(order, originalOrderActionHtml(order));
      };
    }
    if (typeof window.updateOrder === "function" && !originalUpdateOrder) {
      originalUpdateOrder = window.updateOrder;
      window.updateOrder = async function (orderId, status) {
        await originalUpdateOrder(orderId, status);
        syncAlertLoop();
      };
    }
    if (typeof window.playVendorNewOrderAlert === "function" && !originalPlayAlert) {
      originalPlayAlert = window.playVendorNewOrderAlert;
      window.playVendorNewOrderAlert = function () {
        originalPlayAlert();
        syncAlertLoop();
      };
    }
    installSearch();
    syncAlertLoop();
  }

  const style = document.createElement("style");
  style.id = "zenzora-vendor-ops-style";
  style.textContent = `
    .zenzora-order-search{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,220px) auto;gap:10px;align-items:end;margin:0 0 14px}
    .zenzora-search-field{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:12px;font-weight:800;color:#475569}
    .zenzora-search-field input{width:100%;height:50px;min-width:0;padding:0 12px;border:1px solid #dbe3e8;border-radius:12px;background:#fff;color:#17212b;font:inherit;font-size:14px}
    .zenzora-clear-search{height:50px;min-width:68px;padding:0 14px;border:1px solid #dbe3e8;border-radius:12px;background:#fff;font-size:13px;font-weight:800;color:#334155}
    .zz-prep-time{display:flex;flex-wrap:wrap;align-items:center;gap:7px;width:100%;margin-top:10px;padding-top:10px;border-top:1px solid #edf1f3}
    .zz-prep-label{width:100%;font-size:11px;font-weight:800;color:#64748b}
    .zz-prep-chip{min-height:48px;min-width:52px;padding:0 11px;border:1px solid #dbe3e8;border-radius:12px;background:#fff;color:#243342;font-size:12px;font-weight:800;touch-action:manipulation}
    .zz-prep-chip.is-current{border-color:#10b981;background:#ecfdf5;color:#047857}
    .zz-prep-chip:disabled{opacity:.55}
    @media(max-width:560px){.zenzora-order-search{grid-template-columns:1fr 1fr}.zenzora-search-field:first-child{grid-column:1/-1}.zenzora-clear-search{grid-column:1/-1;width:100%}.zz-prep-chip{flex:1}}
  `;
  document.head.appendChild(style);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) syncAlertLoop();
  });
  document.addEventListener("pointerdown", function () {
    if (pendingNewOrders().length && typeof originalPlayAlert === "function") {
      originalPlayAlert();
    }
  }, { once: true, passive: true });

  install();
  window.setInterval(install, 2000);
})();