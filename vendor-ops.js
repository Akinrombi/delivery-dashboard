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
        syncAlertLoop();
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
    .order-actions .btn{min-height:48px;padding-left:14px;padding-right:14px;touch-action:manipulation}
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
})();

/* =========================================================
   ZENZORA VENDOR OPERATIONS: OFFLINE, FINANCE, MENU, HELP
========================================================= */
(function(){
  "use strict";
  if(window.__zenzoraVendorOpsV2) return;
  window.__zenzoraVendorOpsV2 = true;

  function makeActionId(){
    if(window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes=window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
    return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
  }
  const DB_NAME = "zenzora-vendor-ops";
  const STORE = "actions";
  let dbPromise;
  let financeLoaded = false;
  let supportLoaded = false;

  const q = (selector, root=document) => root.querySelector(selector);
  const safe = value => typeof escapeHtml === "function" ? escapeHtml(value) : String(value ?? "");
  const naira = value => typeof money === "function" ? money(value) : "₦" + Number(value || 0).toLocaleString("en-NG");
  const notify = (message, type) => { if(typeof toast === "function") toast(message, type || ""); };

  function openDb(){
    if(dbPromise) return dbPromise;
    dbPromise = new Promise((resolve,reject)=>{
      if(!("indexedDB" in window)){ reject(new Error("Offline storage is not available on this device.")); return; }
      const request = indexedDB.open(DB_NAME,1);
      request.onupgradeneeded = () => {
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:"action_id"});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    return dbPromise;
  }

  async function allQueued(){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,"readonly");
      const req=tx.objectStore(STORE).getAll();
      req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>a.created_at-b.created_at));
      req.onerror=()=>reject(req.error);
    });
  }

  async function saveQueued(action){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).put(action);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error);
    });
  }

  async function removeQueued(actionId){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).delete(actionId);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error);
    });
  }

  function statusNode(){
    let node=q("#zenzoraSyncStatus");
    if(!node){
      const content=q(".content");
      if(!content) return null;
      node=document.createElement("div");
      node.id="zenzoraSyncStatus";
      node.className="zz-sync-status";
      node.setAttribute("role","status");
      node.setAttribute("aria-live","polite");
      content.prepend(node);
    }
    return node;
  }

  async function paintStatus(){
    const node=statusNode();
    if(!node) return;
    let count=0;
    try{ count=(await allQueued()).length; }catch(_){}
    const online=navigator.onLine;
    node.className="zz-sync-status " + (!online?"is-offline":count?"has-queue":"is-synced");
    node.textContent=!online
      ? "Offline · " + count + " action" + (count===1?"":"s") + " waiting"
      : count
        ? "Online · " + count + " action" + (count===1?"":"s") + " queued"
        : "Online · All changes synced";
  }

  function isNetworkError(error){
    const message=String(error?.message||error||"").toLowerCase();
    return !navigator.onLine || error instanceof TypeError ||
      /network|fetch|offline|timeout|connection|load failed/.test(message);
  }

  async function sendAction(action){
    const {data,error}=await supabaseClient.rpc("vendor_apply_offline_action",{
      p_action_id:action.action_id,
      p_action_type:action.action_type,
      p_payload:action.payload
    });
    if(error) throw error;
    return data;
  }

  async function queueOrSend(actionType,payload){
    const action={
      action_id:makeActionId(),
      action_type:actionType,
      payload,
      created_at:Date.now()
    };
    try{
      if(!navigator.onLine) throw new TypeError("Offline");
      const result=await sendAction(action);
      await paintStatus();
      return {queued:false,result};
    }catch(error){
      if(!isNetworkError(error)) throw error;
      await saveQueued(action);
      await paintStatus();
      return {queued:true,result:null};
    }
  }

  async function flushQueue(){
    if(!navigator.onLine || !window.supabaseClient || !window.vendor) return;
    let queue;
    try{ queue=await allQueued(); }catch(error){ console.warn("Offline queue unavailable",error); return; }
    for(const action of queue){
      try{
        await sendAction(action);
        await removeQueued(action.action_id);
      }catch(error){
        if(isNetworkError(error)) break;
        // Keep the action in the queue. Later actions must not overtake it.
        console.warn("Queued vendor action needs attention:",error);
        notify("A saved action needs attention: " + (error.message || "Please reconnect and try again."),"error");
        break;
      }
    }
    await paintStatus();
    if(typeof loadOrders==="function") await loadOrders();
    if(typeof loadMenu==="function") await loadMenu();
    if(typeof renderOrders==="function") renderOrders();
    if(typeof renderMenu==="function") renderMenu();
    if(typeof updateDashboard==="function") updateDashboard();
  }

  async function updateOrderOfflineFirst(orderId,status){
    try{
      const response=await queueOrSend("order_status",{order_id:orderId,status});
      const item=Array.isArray(orders)?orders.find(order=>order.id===orderId):null;
      if(item) item.status=status;
      if(typeof renderOrders==="function") renderOrders();
      if(typeof updateDashboard==="function") updateDashboard();
      notify(response.queued?"Saved on this phone. It will send when internet returns.":(
        status==="vendor_accepted"?"Order accepted.":status==="cancelled"?"Order cancelled.":"Order updated."
      ),"success");
    }catch(error){
      notify(error.message||"Could not update this order.","error");
    }
  }
  window.updateOrder=updateOrderOfflineFirst;

  window.setVendorPrepTime=async function(orderId,minutes){
    try{
      const response=await queueOrSend("prep_time",{order_id:orderId,minutes:Number(minutes)});
      const item=Array.isArray(orders)?orders.find(order=>order.id===orderId):null;
      if(item) item.est_prep_mins=Number(minutes);
      if(typeof renderOrders==="function") renderOrders();
      notify(response.queued?"Preparation time saved. It will sync when internet returns.":"Preparation time updated.","success");
    }catch(error){ notify(error.message||"Could not update preparation time.","error"); }
  };

  const originalToggleStock=window.toggleStock;
  window.toggleStock=async function(itemId,newValue){
    try{
      const response=await queueOrSend("stock_toggle",{item_id:itemId,in_stock:Boolean(newValue)});
      const item=Array.isArray(menuItems)?menuItems.find(entry=>entry.id===itemId):null;
      if(item){item.in_stock=Boolean(newValue);item.stock_pause_until=null;}
      if(typeof renderMenu==="function") renderMenu();
      notify(response.queued?"Stock change saved. It will sync when internet returns.":(
        newValue?"Item marked in stock.":"Item marked out of stock."
      ),"success");
    }catch(error){
      if(typeof originalToggleStock==="function" && isNetworkError(error)) return originalToggleStock(itemId,newValue);
      notify(error.message||"Could not update stock.","error");
    }
  };

  function insertStyles(){
    if(q("#zz-vendor-v2-style")) return;
    const style=document.createElement("style");
    style.id="zz-vendor-v2-style";
    style.textContent=`
      .zz-sync-status{position:sticky;top:0;z-index:25;margin:0 0 14px;padding:11px 14px;border-radius:12px;font-size:12px;font-weight:800;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
      .zz-sync-status.is-offline{background:#fff7ed;color:#9a3412;border-color:#fed7aa}
      .zz-sync-status.has-queue{background:#fffbeb;color:#92400e;border-color:#fde68a}
      .zz-ops-card{margin:14px 0;padding:18px;background:var(--card,#fff);border:1px solid var(--border,#e5e7eb);border-radius:16px}
      .zz-ops-title{font-size:16px;font-weight:900;margin-bottom:5px}
      .zz-ops-muted{font-size:12px;color:var(--muted,#64748b);line-height:1.5}
      .zz-ops-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}
      .zz-ops-stat{padding:13px;border:1px solid var(--border,#e5e7eb);border-radius:12px;min-width:0}
      .zz-ops-stat span{display:block;color:var(--muted,#64748b);font-size:11px;font-weight:800}
      .zz-ops-stat strong{display:block;font-size:18px;margin-top:5px;overflow-wrap:anywhere}
      .zz-ops-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
      .zz-ops-actions button,.zz-ops-card button{min-height:48px;touch-action:manipulation}
      .zz-ops-table{width:100%;border-collapse:collapse;font-size:12px}
      .zz-ops-table th,.zz-ops-table td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--border,#e5e7eb);vertical-align:top}
      .zz-ops-table th{color:var(--muted,#64748b)}
      .zz-ops-field{height:48px;max-width:100%;padding:0 11px;border:1px solid var(--border,#dbe3e8);border-radius:10px;background:var(--card,#fff);color:var(--text,#111)}
      .zz-menu-description{font-size:12px;color:var(--muted,#64748b);margin:7px 0 10px;line-height:1.5}
      .zz-menu-photo{width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:10px;background:#f1f5f9}
      .zz-help-fab{position:fixed;right:16px;bottom:82px;z-index:60;border:0;border-radius:999px;background:#10a56b;color:#fff;min-height:52px;padding:0 18px;font-weight:900;box-shadow:0 8px 24px #0002}
      .zz-modal{position:fixed;inset:0;z-index:1000;background:#0008;display:flex;align-items:center;justify-content:center;padding:16px}
      .zz-modal-card{background:#fff;color:#17212b;width:min(520px,100%);max-height:85vh;overflow:auto;border-radius:18px;padding:20px}
      .zz-modal-card h3{margin:0 0 8px;font-size:18px}
      .zz-modal-card label{display:block;font-size:12px;font-weight:800;margin:12px 0 6px}
      .zz-modal-card input,.zz-modal-card textarea,.zz-modal-card select{width:100%;min-height:48px;padding:11px;border:1px solid #dbe3e8;border-radius:10px;font:inherit}
      .zz-modal-card textarea{min-height:90px}
      .zz-check-row{display:flex;gap:10px;align-items:center;padding:9px 0;font-size:13px}
      .zz-check-row input{width:18px;height:18px}
      @media(max-width:600px){.zz-ops-grid{grid-template-columns:1fr 1fr}.zz-ops-grid .zz-ops-stat:last-child{grid-column:1/-1}.zz-ops-table{min-width:520px}.zz-ops-table-wrap{overflow-x:auto}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal(){
    if(q("#zzVendorHelpModal")) return;
    const modal=document.createElement("div");
    modal.id="zzVendorHelpModal";
    modal.className="zz-modal";
    modal.hidden=true;
    modal.innerHTML=`
      <div class="zz-modal-card" role="dialog" aria-modal="true" aria-labelledby="zzHelpTitle">
        <h3 id="zzHelpTitle">Help and report a problem</h3>
        <p class="zz-ops-muted">Tell the Zenzora team what happened. Do not include your bank PIN or password.</p>
        <label for="zzHelpType">What do you need help with?</label>
        <select id="zzHelpType">
          <option value="Order issue">Order issue</option>
          <option value="Menu issue">Menu issue</option>
          <option value="Payment or payout">Payment or payout</option>
          <option value="Account issue">Account issue</option>
          <option value="Other">Other</option>
        </select>
        <label for="zzHelpMessage">Message</label>
        <textarea id="zzHelpMessage" maxlength="4000" placeholder="Describe the problem in a few words."></textarea>
        <div class="zz-ops-actions">
          <button type="button" class="btn btn-secondary" id="zzHelpCancel">Close</button>
          <button type="button" class="btn btn-primary" id="zzHelpSend">Send report</button>
        </div>
        <div id="zzHelpFeedback" class="zz-ops-muted" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click",event=>{if(event.target===modal) modal.hidden=true;});
    q("#zzHelpCancel",modal).addEventListener("click",()=>modal.hidden=true);
    q("#zzHelpSend",modal).addEventListener("click",sendHelpReport);
  }

  async function sendHelpReport(){
    const button=q("#zzHelpSend");
    const feedback=q("#zzHelpFeedback");
    const details=q("#zzHelpMessage").value.trim();
    const type=q("#zzHelpType").value;
    if(!details){feedback.textContent="Please describe the problem.";return;}
    if(!window.vendor?.id){feedback.textContent="Sign in to send a report.";return;}
    button.disabled=true;
    try{
      const {error}=await supabaseClient.from("vendor_support_messages").insert({
        vendor_id:vendor.id,sender_type:"vendor",message:"["+type+"] "+details
      });
      if(error) throw error;
      q("#zzHelpMessage").value="";
      feedback.textContent="Your report has been sent.";
      notify("Report sent to Zenzora support.","success");
    }catch(error){feedback.textContent=error.message||"Could not send the report.";}
    finally{button.disabled=false;}
  }

  function ensureHelpButton(){
    if(q("#zzVendorHelpButton")) return;
    const button=document.createElement("button");
    button.id="zzVendorHelpButton";
    button.className="zz-help-fab";
    button.type="button";
    button.textContent="Help";
    button.addEventListener("click",()=>{ensureModal();q("#zzVendorHelpModal").hidden=false;});
    document.body.appendChild(button);
  }

  function ensureFinancePanel(){
    const page=q("#page-earnings");
    if(!page || q("#zzFinancePanel")) return;
    const panel=document.createElement("section");
    panel.id="zzFinancePanel";
    panel.className="zz-ops-card";
    panel.innerHTML=`
      <div class="zz-ops-title">Your money</div>
      <div class="zz-ops-muted">Your wallet and recorded transactions. Payout dates appear when a payout schedule is configured.</div>
      <div class="zz-ops-grid">
        <div class="zz-ops-stat"><span>Today's delivered sales</span><strong id="zzTodaySales">₦0</strong></div>
        <div class="zz-ops-stat"><span>Available wallet balance</span><strong id="zzAvailableBalance">₦0</strong></div>
        <div class="zz-ops-stat"><span>Next payout</span><strong id="zzNextPayout">Not scheduled</strong></div>
      </div>
      <div class="zz-ops-title" style="margin-top:14px">Download your statement</div>
      <div class="zz-ops-actions">
        <label class="zz-ops-muted">From <input id="zzStatementFrom" class="zz-ops-field" type="date"></label>
        <label class="zz-ops-muted">To <input id="zzStatementTo" class="zz-ops-field" type="date"></label>
        <button id="zzExportStatement" class="btn btn-primary" type="button">Download CSV</button>
      </div>
      <div class="zz-ops-title" style="margin-top:18px">Transaction history</div>
      <div id="zzTransactionHistory" class="zz-ops-muted">Loading transactions…</div>
    `;
    page.appendChild(panel);
    q("#zzExportStatement",panel).addEventListener("click",exportStatement);
  }

  let cachedTransactions=[];
  let cachedOrderCodes={};

  async function loadFinance(){
    if(!window.vendor?.id || !window.supabaseClient) return;
    ensureFinancePanel();
    const today=new Date();today.setHours(0,0,0,0);
    const todays=Array.isArray(orders)?orders.filter(o=>o.status==="delivered" && new Date(o.delivered_at||o.updated_at||o.created_at)>=today):[];
    const sales=todays.reduce((sum,o)=>sum+Number(o.vendor_net ?? o.total ?? 0),0);
    const salesNode=q("#zzTodaySales");if(salesNode)salesNode.textContent=naira(sales);
    try{
      const [walletResult,txResult]=await Promise.all([
        supabaseClient.from("vendor_wallets").select("available_balance,total_earned,total_commission").eq("vendor_id",vendor.id).maybeSingle(),
        supabaseClient.from("vendor_transactions").select("id,order_id,type,gross,commission,amount,note,created_at").eq("vendor_id",vendor.id).order("created_at",{ascending:false}).limit(300)
      ]);
      if(walletResult.error) throw walletResult.error;
      if(txResult.error) throw txResult.error;
      const wallet=walletResult.data||{};
      const balance=q("#zzAvailableBalance");if(balance)balance.textContent=naira(wallet.available_balance);
      cachedTransactions=txResult.data||[];
      const ids=[...new Set(cachedTransactions.map(tx=>tx.order_id).filter(Boolean))];
      cachedOrderCodes={};
      if(ids.length){
        const {data,error}=await supabaseClient.from("orders").select("id,order_number").in("id",ids);
        if(error) throw error;
        (data||[]).forEach(order=>cachedOrderCodes[order.id]=order.order_number||order.id.slice(0,8));
      }
      renderTransactions();
      financeLoaded=true;
    }catch(error){
      const history=q("#zzTransactionHistory");
      if(history)history.textContent=error.message||"Could not load your transactions.";
    }
  }

  function renderTransactions(){
    const node=q("#zzTransactionHistory");if(!node)return;
    if(!cachedTransactions.length){node.textContent="No transactions have been recorded yet.";return;}
    node.innerHTML='<div class="zz-ops-table-wrap"><table class="zz-ops-table"><thead><tr><th>Date</th><th>Type</th><th>Order</th><th>Gross</th><th>Platform fee</th><th>Net amount</th></tr></thead><tbody>'+
      cachedTransactions.map(tx=>'<tr><td>'+safe(new Date(tx.created_at).toLocaleString("en-NG"))+'</td><td>'+safe(tx.type)+'</td><td>'+safe(cachedOrderCodes[tx.order_id]||"—")+'</td><td>'+naira(tx.gross)+'</td><td>'+naira(tx.commission)+'</td><td>'+naira(tx.amount)+'</td></tr>').join("")+
      '</tbody></table></div>';
  }

  function exportStatement(){
    const from=q("#zzStatementFrom")?.value||"";
    const to=q("#zzStatementTo")?.value||"";
    if(from && to && from>to){notify("The start date must be before the end date.","error");return;}
    const rows=cachedTransactions.filter(tx=>{
      const day=String(tx.created_at||"").slice(0,10);
      return (!from||day>=from)&&(!to||day<=to);
    });
    const header=["Date","Type","Order code","Gross (NGN)","Platform fee (NGN)","Net amount (NGN)","Note"];
    const csv=[header,...rows.map(tx=>[
      tx.created_at,tx.type,cachedOrderCodes[tx.order_id]||"",tx.gross,tx.commission,tx.amount,tx.note||""
    ])].map(row=>row.map(value=>'"'+String(value??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="zenzora-vendor-statement-"+(from||"all")+"_to_"+(to||"all")+".csv";
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  }

  function ensureChecklist(){
    const dashboard=q("#page-dashboard");
    if(!dashboard || q("#zzSetupChecklist"))return;
    const panel=document.createElement("section");
    panel.id="zzSetupChecklist";panel.className="zz-ops-card";
    panel.innerHTML='<div class="zz-ops-title">Finish setting up your store</div><div class="zz-ops-muted">Complete these steps so customers can order with confidence.</div><div id="zzSetupItems"></div>';
    dashboard.appendChild(panel);
  }

  function renderChecklist(){
    ensureChecklist();
    const list=q("#zzSetupItems");if(!list || !window.vendor)return;
    const hasBank=!!(vendorPayoutDetails?.bank_name && String(vendorPayoutDetails?.account_number||"").length===10);
    const hasMenu=Array.isArray(menuItems)&&menuItems.length>0;
    const hasBusiness=!!(vendor.store_name&&vendor.address&&vendor.phone);
    const items=[
      ["Bank account",hasBank,"Add your bank details in Restaurant settings."],
      ["Menu setup",hasMenu,"Add at least one food item and set its price."],
      ["Business details",hasBusiness,"Add your restaurant name, address and phone."],
      ["Identity check",false,"Identity verification will be available when a provider is connected."]
    ];
    list.innerHTML=items.map(item=>'<div class="zz-check-row"><span>'+(item[1]?"✅":"◯")+'</span><div><strong>'+safe(item[0])+'</strong><div class="zz-ops-muted">'+safe(item[2])+'</div></div></div>').join("");
  }

  function addMenuFields(){
    const modal=q("#menuModal .modal");
    if(!modal || q("#zzMenuDescription"))return;
    const group=document.createElement("div");
    group.innerHTML='<div class="form-group"><label class="form-label" for="zzMenuDescription">Description</label><textarea id="zzMenuDescription" class="form-control" rows="2" maxlength="500" placeholder="Describe this meal"></textarea></div><div class="form-group"><label class="form-label" for="zzMenuPhoto">Food photo</label><input id="zzMenuPhoto" class="form-control" type="file" accept="image/jpeg,image/png,image/webp"><small class="zz-ops-muted">Photos are resized before upload.</small></div>';
    const actions=q(".modal-actions",modal);
    if(actions)modal.insertBefore(group,actions);
  }

  function compressImage(file){
    return new Promise((resolve,reject)=>{
      if(!file || !file.type.startsWith("image/")){reject(new Error("Choose a valid image."));return;}
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error("Could not read this photo."));
      reader.onload=()=>{
        const image=new Image();
        image.onerror=()=>reject(new Error("Could not open this photo."));
        image.onload=()=>{
          const max=1280,scale=Math.min(1,max/Math.max(image.width,image.height));
          const canvas=document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(image.width*scale));
          canvas.height=Math.max(1,Math.round(image.height*scale));
          canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
          canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Photo compression failed.")),"image/webp",0.78);
        };
        image.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadMenuPhoto(file){
    const blob=await compressImage(file);
    const path=vendor.id+"/"+makeActionId()+".webp";
    const {error}=await supabaseClient.storage.from("vendor-menu-images").upload(path,blob,{contentType:"image/webp",upsert:false});
    if(error)throw error;
    const {data}=supabaseClient.storage.from("vendor-menu-images").getPublicUrl(path);
    return data.publicUrl;
  }

  window.addMenuItem=async function(){
    if(!window.vendor?.id)return;
    const name=q("#menuName")?.value.trim();
    const category=q("#menuCategory")?.value.trim();
    const price=Number(q("#menuPrice")?.value);
    const description=q("#zzMenuDescription")?.value.trim()||"";
    const file=q("#zzMenuPhoto")?.files?.[0];
    if(!name||!category||!Number.isFinite(price)||price<=0){notify("Enter a name, category and valid price.","error");return;}
    try{
      let image_url=null;
      if(file)image_url=await uploadMenuPhoto(file);
      const {error}=await supabaseClient.from("menu_items").insert({vendor_id:vendor.id,name,category,price,description,image_url,in_stock:true});
      if(error)throw error;
      ["menuName","menuCategory","menuPrice","zzMenuDescription","zzMenuPhoto"].forEach(id=>{const el=q("#"+id);if(el)el.value="";});
      if(typeof closeMenuModal==="function")closeMenuModal();
      if(typeof loadMenu==="function")await loadMenu();
      if(typeof renderMenu==="function")renderMenu();
      renderChecklist();
      notify("Menu item added.","success");
    }catch(error){notify(error.message||"Could not add this menu item.","error");}
  };

  window.editMenuDetails=async function(itemId){
    const item=Array.isArray(menuItems)?menuItems.find(row=>row.id===itemId):null;
    if(!item)return;
    const description=prompt("Food description:",item.description||"");
    if(description===null)return;
    const fileInput=document.createElement("input");fileInput.type="file";fileInput.accept="image/jpeg,image/png,image/webp";
    const wantsPhoto=confirm("Do you also want to choose or replace the food photo?");
    let image_url=item.image_url||null;
    try{
      if(wantsPhoto){
        const file=await new Promise(resolve=>{
          fileInput.onchange=()=>resolve(fileInput.files?.[0]||null);
          fileInput.click();
        });
        if(file)image_url=await uploadMenuPhoto(file);
      }
      const {error}=await supabaseClient.from("menu_items").update({description,image_url}).eq("id",itemId).eq("vendor_id",vendor.id);
      if(error)throw error;
      if(typeof loadMenu==="function")await loadMenu();
      if(typeof renderMenu==="function")renderMenu();
      notify("Menu details saved.","success");
    }catch(error){notify(error.message||"Could not save menu details.","error");}
  };

  const oldRenderMenu=window.renderMenu;
  window.renderMenu=function(){
    if(typeof oldRenderMenu==="function")oldRenderMenu();
    const cards=document.querySelectorAll("#menuGrid .menu-card");
    cards.forEach((card,index)=>{
      const item=menuItems?.[index];if(!item)return;
      if(item.image_url){
        const image=document.createElement("img");image.className="zz-menu-photo";image.src=item.image_url;image.alt=item.name||"Food photo";image.loading="lazy";
        card.prepend(image);
      }
      if(item.description){
        const description=document.createElement("div");description.className="zz-menu-description";description.textContent=item.description;
        const name=q(".menu-name",card);if(name)name.after(description);
      }
      const footer=q(".menu-footer",card);
      if(footer && !q(".zz-edit-menu-details",footer)){
        const button=document.createElement("button");button.type="button";button.className="btn btn-secondary btn-small zz-edit-menu-details";button.textContent="Edit details";button.addEventListener("click",()=>window.editMenuDetails(item.id));footer.appendChild(button);
      }
    });
    renderChecklist();
  };

  function ensureLanguageAndSaver(){
    const header=q(".mobile-header");
    if(!header || q("#zzLanguageChoice"))return;
    const controls=document.createElement("div");controls.style.cssText="display:flex;gap:6px;align-items:center;margin-left:auto";
    controls.innerHTML='<select id="zzLanguageChoice" class="zz-ops-field" aria-label="Language"><option value="en">English</option><option value="pidgin">Nigerian Pidgin</option><option value="yo">Yoruba (planned)</option></select>';
    header.appendChild(controls);
    const saved=localStorage.getItem("zenzora-vendor-language")||"en";
    q("#zzLanguageChoice").value=saved;
    q("#zzLanguageChoice").addEventListener("change",event=>{
      localStorage.setItem("zenzora-vendor-language",event.target.value);
      if(event.target.value==="yo"){notify("Yoruba language support is planned.","");event.target.value="en";return;}
      if(event.target.value==="pidgin")notify("Pidgin selected. More screens will be translated in the next language update.","success");
      else notify("English selected.","success");
    });
  }

  function installServiceWorker(){
    if(!("serviceWorker" in navigator))return;
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(error=>console.warn("Service worker registration failed",error)));
  }

  function refreshPanels(){
    insertStyles();
    ensureFinancePanel();
    ensureChecklist();
    ensureHelpButton();
    ensureModal();
    addMenuFields();
    ensureLanguageAndSaver();
    paintStatus();
    renderChecklist();
    if(q("#page-earnings")?.classList.contains("active") && !financeLoaded)loadFinance();
  }

  window.addEventListener("online",()=>{paintStatus();flushQueue();});
  window.addEventListener("offline",paintStatus);
  window.addEventListener("focus",()=>{paintStatus();if(navigator.onLine)flushQueue();});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){paintStatus();if(navigator.onLine)flushQueue();}});
  const oldNavigate=window.navigate;
  if(typeof oldNavigate==="function"){
    window.navigate=function(page){
      oldNavigate(page);
      if(page==="earnings")loadFinance();
      if(page==="dashboard")renderChecklist();
    };
  }
  const oldLoadMenu=window.loadMenu;
  if(typeof oldLoadMenu==="function"){
    window.loadMenu=async function(){await oldLoadMenu();renderChecklist();};
  }
  const oldLoadVendor=window.loadVendor;
  if(typeof oldLoadVendor==="function"){
    window.loadVendor=async function(){await oldLoadVendor();refreshPanels();if(navigator.onLine)flushQueue();};
  }

  insertStyles();
  installServiceWorker();
  refreshPanels();
  paintStatus();
})();

/* Store pause, menu options and notification permission controls. */
(function(){
  "use strict";
  if(window.__zenzoraVendorOpsV3)return;
  window.__zenzoraVendorOpsV3=true;
  const q=(s,r=document)=>r.querySelector(s);
  const say=(m,t)=>{if(typeof toast==="function")toast(m,t||"");};
  const esc=v=>typeof escapeHtml==="function"?escapeHtml(v):String(v??"");

  function ensureStorePause(){
    const page=q("#page-restaurant");
    if(!page||q("#zzAcceptingOrdersCard"))return;
    const card=document.createElement("div");
    card.id="zzAcceptingOrdersCard";card.className="zz-ops-card";
    card.innerHTML='<div class="zz-ops-title">New order settings</div><div class="zz-ops-muted">Pause new customer orders without closing your restaurant profile.</div><div class="zz-ops-actions"><label class="zz-check-row"><input id="zzAcceptingOrders" type="checkbox"><strong>Accept new orders</strong></label></div><div id="zzAcceptingOrdersHint" class="zz-ops-muted"></div>';
    page.prepend(card);
    q("#zzAcceptingOrders",card).addEventListener("change",setAcceptingOrders);
  }
  function renderStorePause(){
    ensureStorePause();
    const input=q("#zzAcceptingOrders");if(!input||!window.vendor)return;
    input.checked=vendor.accepting_orders!==false;
    const hint=q("#zzAcceptingOrdersHint");
    if(hint)hint.textContent=input.checked?"Customers can place new orders.":"New orders are paused. Your restaurant profile stays visible.";
  }
  async function setAcceptingOrders(event){
    const input=event.target;input.disabled=true;
    try{
      const {data,error}=await supabaseClient.rpc("vendor_set_accepting_orders",{p_accepting:input.checked});
      if(error)throw error;
      vendor.accepting_orders=data?.accepting_orders ?? input.checked;
      renderStorePause();
      say(input.checked?"New orders are now enabled.":"New orders are paused.","success");
    }catch(error){
      input.checked=!input.checked;
      say(error.message||"Could not change order settings.","error");
    }finally{input.disabled=false;}
  }

  window.editMenuOptions=async function(itemId){
    const item=Array.isArray(menuItems)?menuItems.find(row=>row.id===itemId):null;
    if(!item)return;
    try{
      const {data,error}=await supabaseClient.from("menu_item_options").select("option_group,option_name,price_delta,is_required").eq("menu_item_id",itemId).order("sort_order");
      if(error)throw error;
      const existing=(data||[]).map(o=>[o.option_group,o.option_name,o.price_delta,o.is_required?"required":"optional"].join(" | ")).join("\n");
      const value=prompt(
        "Add-ons and portion choices for "+item.name+".\nEnter one per line: Group | Option | Extra price | required/optional\nExample: Portion | Large | 500 | required",
        existing
      );
      if(value===null)return;
      const options=value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
        const parts=line.split("|").map(part=>part.trim());
        if(parts.length<3)throw new Error("Use: Group | Option | Extra price | required/optional");
        const price=Number(parts[2]);
        if(!parts[0]||!parts[1]||!Number.isFinite(price)||price<0)throw new Error("Check the option name and extra price.");
        return {option_group:parts[0],option_name:parts[1],price_delta:price,is_required:(parts[3]||"optional").toLowerCase()==="required"};
      });
      const result=await supabaseClient.rpc("vendor_replace_menu_item_options",{p_menu_item_id:itemId,p_options:options});
      if(result.error)throw result.error;
      say("Menu options saved.","success");
    }catch(error){say(error.message||"Could not save menu options.","error");}
  };

  function addOptionsButtons(){
    const cards=document.querySelectorAll("#menuGrid .menu-card");
    cards.forEach((card,index)=>{
      const item=menuItems?.[index];const footer=q(".menu-footer",card);
      if(!item||!footer||q(".zz-edit-options",footer))return;
      const button=document.createElement("button");
      button.type="button";button.className="btn btn-secondary btn-small zz-edit-options";
      button.textContent="Add-ons / portions";button.addEventListener("click",()=>window.editMenuOptions(item.id));
      footer.appendChild(button);
    });
  }

  function ensurePushButton(){
    const dashboard=q("#page-dashboard");
    if(!dashboard||q("#zzPushSetup"))return;
    const card=document.createElement("section");
    card.id="zzPushSetup";card.className="zz-ops-card";
    card.innerHTML='<div class="zz-ops-title">Order alerts on this phone</div><div class="zz-ops-muted">Allow notifications so Zenzora can alert you when push delivery is configured. Sound and vibration still depend on your phone settings.</div><div class="zz-ops-actions"><button id="zzEnableNotifications" class="btn btn-secondary" type="button">Enable notifications</button></div><div id="zzPushHint" class="zz-ops-muted"></div>';
    dashboard.appendChild(card);
    q("#zzEnableNotifications",card).addEventListener("click",async()=>{
      if(!("Notification" in window)){q("#zzPushHint").textContent="This browser does not support notifications.";return;}
      const permission=await Notification.requestPermission();
      q("#zzPushHint").textContent=permission==="granted"
        ?"Notifications are allowed on this phone. Server push delivery still needs to be connected."
        : "Notifications are blocked. Change this in your browser or phone settings.";
      if(permission==="granted"&&"serviceWorker" in navigator) navigator.serviceWorker.ready.then(()=>say("Notifications allowed. Background delivery is not connected yet.","success"));
    });
  }

  const oldRenderMenu=window.renderMenu;
  if(typeof oldRenderMenu==="function"){
    window.renderMenu=function(){oldRenderMenu();addOptionsButtons();};
  }
  const oldNavigate=window.navigate;
  if(typeof oldNavigate==="function"){
    window.navigate=function(page){oldNavigate(page);if(page==="restaurant")renderStorePause();if(page==="menu")addOptionsButtons();};
  }
  const oldLoadVendor=window.loadVendor;
  if(typeof oldLoadVendor==="function"){
    window.loadVendor=async function(){await oldLoadVendor();renderStorePause();};
  }
  ensureStorePause();
  renderStorePause();
  ensurePushButton();
  addOptionsButtons();
})();

/* Final accessibility and vendor guidance touches. */
(function(){
  if(window.__zenzoraVendorOpsV4)return;
  window.__zenzoraVendorOpsV4=true;
  const q=(s,r=document)=>r.querySelector(s);
  function ensureBatterySaver(){
    const dashboard=q("#page-dashboard");
    if(!dashboard||q("#zzBatterySaverCard"))return;
    const card=document.createElement("section");
    card.id="zzBatterySaverCard";card.className="zz-ops-card";
    card.innerHTML='<div class="zz-ops-title">Battery saver</div><div class="zz-ops-muted">Reduce motion and visual effects while keeping order alerts and vibration enabled when the app is open.</div><div class="zz-ops-actions"><label class="zz-check-row"><input id="zzBatterySaver" type="checkbox"><strong>Use battery saver</strong></label></div>';
    dashboard.appendChild(card);
    const input=q("#zzBatterySaver",card);
    input.checked=localStorage.getItem("zenzora-vendor-battery-saver")==="on";
    document.documentElement.classList.toggle("zz-battery-saver",input.checked);
    input.addEventListener("change",()=>{
      localStorage.setItem("zenzora-vendor-battery-saver",input.checked?"on":"off");
      document.documentElement.classList.toggle("zz-battery-saver",input.checked);
    });
  }
  function ensureRules(){
    if(q("#zzVendorRules"))return;
    const modal=document.createElement("div");
    modal.id="zzVendorRules";modal.className="zz-modal";modal.hidden=true;
    modal.innerHTML='<div class="zz-modal-card" role="dialog" aria-modal="true"><h3>Vendor rules, ratings and disputes</h3><p class="zz-ops-muted">Vendor guidance. Zenzora must publish the final policy before this becomes an official policy.</p><ul style="padding-left:20px;line-height:1.65;font-size:13px"><li>Keep menu prices and food availability accurate.</li><li>Accept or decline new orders promptly.</li><li>Prepare the items shown on the confirmed order.</li><li>Do not ask customers or riders to share passwords, PINs or payment codes.</li><li>Ratings should describe a real order and the service received.</li><li>For a dispute, keep the order code and share clear details with support.</li></ul><div class="zz-ops-actions"><button class="btn btn-primary" id="zzRulesClose">Close</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click",e=>{if(e.target===modal)modal.hidden=true;});
    q("#zzRulesClose",modal).addEventListener("click",()=>modal.hidden=true);
  }
  function addRulesLink(){
    const help=q("#zzVendorHelpModal .zz-modal-card");
    if(!help||q("#zzRulesOpen",help))return;
    const button=document.createElement("button");
    button.id="zzRulesOpen";button.type="button";button.className="btn btn-secondary";
    button.textContent="Rules and disputes";
    button.addEventListener("click",()=>{ensureRules();q("#zzVendorRules").hidden=false;});
    const actions=q(".zz-ops-actions",help);
    if(actions)actions.prepend(button);
  }
  const style=document.createElement("style");
  style.textContent='.zz-battery-saver *, .zz-battery-saver *:before, .zz-battery-saver *:after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}';
  document.head.appendChild(style);
  ensureBatterySaver();
  ensureRules();
  addRulesLink();
  ensureBatterySaver();
  ensureRules();
  addRulesLink();
})();