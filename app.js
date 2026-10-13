const SUPABASE_URL = 'https://zcivplddxtaqlefrtajr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eQG7FVgOU36Z8edfnrf27w_5A7tlNiq';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let STORE_CONFIG = {
  whatsappNumber: "85292773583", 
  storeName: "Cici Cuisine",
  storeSlogan: "🕒 Livraison | 配送",
  storeHoursText: "🕒 13:00 - 10:00 (Lundi - Dimanche)",
  businessMode: "auto",
  manualOpen: true,
  allowedDays: [1, 4] // 預設週一(1)與週四(4)
};

let cart = {};
let menuData = [];
let rawOrders = []; 
let currentCategory = 'Specialite';
let currentOrderTab = 'all'; 
let lastOrderDetails = null;
let orderChannel = null;

const fixedCategories = [
  { key: 'Specialite', fr: 'Spécialité', zh: '每日特色' },
  { key: 'Viandes', fr: 'Viandes', zh: '葷菜' },
  { key: 'Seafood', fr: 'Poissons/Mer', zh: '海鮮類' },
  { key: 'Beef', fr: 'Bœuf', zh: '牛肉類' },
  { key: 'Legumes', fr: 'Légumes', zh: '素菜' },
  { key: 'Staple', fr: 'Riz/Nouilles', zh: '主食' }
];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getParisDateStr(offsetDays = 0) {
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  if (!offsetDays) return todayStr;
  const [y, m, d] = todayStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

function resolveDeliveryDate(dateSelect) {
  const isTomorrow = /demain|明天/i.test(dateSelect || '');
  return getParisDateStr(isTomorrow ? 1 : 0);
}

function generateOrderCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let rand = '';
  bytes.forEach(b => { rand += alphabet[b % alphabet.length]; });
  const yymmdd = getParisDateStr().slice(2).replace(/-/g, '');
  return `CC-${yymmdd}-${rand}`;
}

// ⏰ 檢查是否在營業時間內 (13:00 - 次日 10:00；10:00 - 13:00 為休息)
function checkIsBusinessOpen() {
  if (STORE_CONFIG.businessMode === 'manual') {
    return STORE_CONFIG.manualOpen;
  }
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    let weekdayStr = '';
    let hour = 0;
    let minute = 0;

    parts.forEach(p => {
      if (p.type === 'weekday') weekdayStr = p.value;
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
    });

    // 轉換星期格式對應 JS getDay() (Sun=0, Mon=1 ... Sat=6)
    const weekdayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const currentDayNum = weekdayMap[weekdayStr] ?? 1;

    // 檢查今天是否在群主設定的允許送餐日中
    if (Array.isArray(STORE_CONFIG.allowedDays) && STORE_CONFIG.allowedDays.length > 0) {
      if (!STORE_CONFIG.allowedDays.includes(currentDayNum)) {
        return false; // 不在允許的星期內
      }
    }

    const totalMinutes = hour * 60 + minute;
    // 營業時間：13:00 (780分) 至 次日 10:00 (600分)
    // 也就是大於等於 780 分鐘，或是小於 600 分鐘
    const isOpen = (totalMinutes >= 780 || totalMinutes < 600);
    return isOpen;
  } catch (e) {
    console.error('Time check error:', e);
    return true; 
  }
}

// 🗓️ 根據當前時間自動鎖定下單的日期選項（13:00-凌晨只能選明天，凌晨-10:00只能選今天）
function updateCheckoutDateOptions() {
  const dateSelect = document.getElementById('cust-date');
  if (!dateSelect) return;

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    let hour = 0;
    formatter.formatToParts(now).forEach(p => {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
    });

    // 清空並重新組合選項
    dateSelect.innerHTML = '<option value="">-- Choisir le jour / 請選擇日期 --</option>';

    if (hour >= 13) {
      // 13:00 到 23:59：只能選明天
      dateSelect.innerHTML += `<option value="Demain (明天)">Demain / 明天 (${getParisDateStr(1)})</option>`;
      dateSelect.value = "Demain (明天)";
    } else if (hour < 10) {
      // 00:00 到 10:00：只能選今天
      dateSelect.innerHTML += `<option value="Aujourd'hui (當天)">Aujourd'hui / 當天 (${getParisDateStr(0)})</option>`;
      dateSelect.value = "Aujourd'hui (當天)";
    } else {
      // 10:00 到 13:00 休息時間（雖然擋下單，但保留選項防萬一）
      dateSelect.innerHTML += `
        <option value="Aujourd'hui (當天)">Aujourd'hui / 當天</option>
        <option value="Demain (明天)">Demain / 明天</option>
      `;
    }
  } catch (e) {
    console.error('Update date options error:', e);
  }
}

function updateBusinessStatusBar() {
  const banner = document.getElementById('business-status-banner');
  const checkoutBtn = document.getElementById('checkout-btn');
  const isOpen = checkIsBusinessOpen();

  const hoursText = STORE_CONFIG.storeHoursText || "🕒 13:00 - 10:00";

  if (banner) {
    if (isOpen) {
      banner.className = "bg-green-500 text-white text-center py-1.5 px-4 text-xs font-bold transition-all shadow-sm";
      banner.innerHTML = `🟢 營業中 (Ouvert) — ${hoursText}`;
    } else {
      banner.className = "bg-red-500 text-white text-center py-1.5 px-4 text-xs font-bold transition-all shadow-sm";
      banner.innerHTML = `🔴 非營業時間/休息中 (Fermé) — ${hoursText}`;
    }
  }

  if (checkoutBtn) {
    if (isOpen) {
      checkoutBtn.disabled = false;
      checkoutBtn.className = "bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow active:scale-95 transition";
      checkoutBtn.innerText = "Valider / 結算";
    } else {
      checkoutBtn.disabled = true;
      checkoutBtn.className = "bg-gray-500 text-gray-200 text-xs font-bold px-4 py-2.5 rounded-xl shadow cursor-not-allowed opacity-80";
      checkoutBtn.innerText = "Fermé / 暫停營業";
    }
  }
}

function playOrderSuccessSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); 
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.2);
  } catch (e) { console.log(e); }
}

function playWhatsappClickSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now); 
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); 
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  } catch (e) { console.log(e); }
}

function playAdminNewOrderSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [0, 0.15, 0.3].forEach((delay, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(index === 2 ? 1046.5 : 783.99, now + delay); 
      gain.gain.setValueAtTime(0.2, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.12);
    });
  } catch (e) { console.log(e); }
}

function normalizeCategory(rawCat, nameZh = '', nameFr = '') {
  const cat = (rawCat || '').toString().toLowerCase().trim();
  const zh = (nameZh || '').toString().toLowerCase();
  if (cat.includes('特色') || cat.includes('spécialité') || cat.includes('specialite')) return 'Specialite';
  if (cat.includes('海鮮') || cat.includes('魚') || cat.includes('poisson') || zh.includes('魚')) return 'Seafood';
  if (cat.includes('牛肉') || cat.includes('bœuf') || cat.includes('beef') || zh.includes('牛')) return 'Beef';
  if (cat.includes('素') || cat.includes('légume')) return 'Legumes';
  if (cat.includes('主食') || cat.includes('riz') || cat.includes('nouille')) return 'Staple';
  return 'Viandes';
}

async function fetchMenu() {
  try {
    const { data, error } = await supabaseClient.from('menu_items').select('*');
    if (error) console.error(error);
    menuData = data || [];
    renderCategoryBar();
    renderMenu();
  } catch (err) {
    console.error(err);
  }
}

function renderCategoryBar() {
  const container = document.getElementById('category-bar');
  if (!container) return;
  container.innerHTML = fixedCategories.map(cat => {
    const isSelected = currentCategory === cat.key;
    return `
      <button type="button" onclick="switchCategory('${cat.key}')" 
        class="w-full py-3 px-1 text-center border-b border-gray-300 transition ${isSelected ? 'bg-white text-green-600 font-bold border-l-4 border-l-green-500' : 'text-gray-600'}">
        <div class="text-xs font-bold leading-tight">${cat.fr}</div>
        <div class="text-[10px] text-gray-400 font-normal mt-0.5">${cat.zh}</div>
      </button>
    `;
  }).join('');
}

function switchCategory(catKey) {
  currentCategory = catKey;
  renderCategoryBar();
  renderMenu();
}

function renderMenu() {
  const container = document.getElementById('menu-container');
  if (!container) return;

  let listToDisplay = menuData.filter(i => normalizeCategory(i.category, i.name_zh, i.name_fr) === currentCategory);

  listToDisplay.sort((a, b) => {
    const stockA = (a && typeof a.stock === 'number') ? a.stock : 99;
    const stockB = (b && typeof b.stock === 'number') ? b.stock : 99;
    const availA = (a.is_available !== false && stockA > 0) ? 1 : 0;
    const availB = (b.is_available !== false && stockB > 0) ? 1 : 0;
    if (availA !== availB) return availB - availA;
    return (a.sort_order || 99) - (b.sort_order || 99);
  });

  if (listToDisplay.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-400 py-10">Aucun plat / 暫無菜品</div>';
    return;
  }

  container.innerHTML = listToDisplay.map(item => {
    const maxStock = (item && typeof item.stock === 'number') ? item.stock : 99;
    const currentCartQty = cart[item.id] || 0;
    const isAvailable = (item.is_available !== false) && (maxStock > 0);
    const isMaxReached = currentCartQty >= maxStock;

    const imgHtml = item.image_url 
      ? `<img src="${escapeHtml(item.image_url)}" class="w-16 h-16 rounded-lg object-cover flex-shrink-0">`
      : `<div class="w-16 h-16 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-400 font-bold text-xs flex-shrink-0">🍲</div>`;

    return `
      <div class="bg-white p-3 rounded-xl shadow-sm flex items-center gap-3 border border-gray-100 ${!isAvailable ? 'opacity-50 grayscale' : ''}">
        <div onclick="openDishDetailModal('${item.id}')" class="cursor-pointer flex-shrink-0">${imgHtml}</div>
        <div class="flex-1 min-w-0">
          <div onclick="openDishDetailModal('${item.id}')" class="font-bold text-gray-800 text-xs sm:text-sm leading-tight line-clamp-2 cursor-pointer hover:text-green-600 transition">
            ${escapeHtml(item.name_fr)} ${!isAvailable ? '<span class="ml-1 text-[10px] bg-gray-200 text-gray-600 px-1 py-0.5 rounded">Épuisé</span>' : ''}
          </div>
          <div class="text-xs text-gray-500 font-normal mt-0.5 truncate">${escapeHtml(item.name_zh)}</div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-green-600 font-extrabold text-base">${item.price || 0} €</span>
            ${isAvailable ? `<span class="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border">Stock: ${maxStock}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          ${currentCartQty > 0 ? `
            <button type="button" onclick="updateCart('${item.id}', -1)" class="w-7 h-7 bg-gray-100 text-gray-700 rounded-full font-bold flex items-center justify-center">-</button>
            <span class="text-sm font-bold w-4 text-center">${currentCartQty}</span>
          ` : ''}
          <button type="button" ${(!isAvailable || isMaxReached) ? 'disabled' : `onclick="updateCart('${item.id}', 1)"`} 
            class="w-7 h-7 ${isAvailable && !isMaxReached ? 'bg-green-500 text-white shadow-md' : 'bg-gray-300 text-gray-500 cursor-not-allowed'} rounded-full font-bold flex items-center justify-center">+</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateCart(id, delta) {
  const item = menuData.find(i => i.id === id);
  const maxStock = (item && typeof item.stock === 'number') ? item.stock : 99;
  const currentQty = cart[id] || 0;
  if (delta > 0 && currentQty >= maxStock) {
    alert(`Stock insuffisant ! Il ne reste que ${maxStock} portion(s). / 庫存不足！`);
    return;
  }
  cart[id] = currentQty + delta;
  if (cart[id] <= 0) delete cart[id];
  renderMenu();

  let total = 0, count = 0;
  for (let itemId in cart) {
    const menuItem = menuData.find(i => i.id === itemId);
    if (menuItem) {
      total += (menuItem.price || 0) * cart[itemId];
      count += cart[itemId];
    }
  }
  document.getElementById('total-price').innerText = total.toFixed(2);
  document.getElementById('modal-total-price').innerText = total.toFixed(2);
  const badge = document.getElementById('cart-badge');
  if (count > 0) { badge.innerText = count; badge.classList.remove('hidden'); }
  else { badge.classList.add('hidden'); }
}

function openCheckoutModal() {
  if (!checkIsBusinessOpen()) {
    alert(`❌ Désolé, nous sommes actuellement fermés !\n抱歉，目前為非營業時間（${STORE_CONFIG.storeHoursText}），暫不接受下單！`);
    return;
  }
  if (Object.keys(cart).length === 0) return alert('Votre panier est vide ! / 購物車是空的！');
  
  // 🌟 開啟時自動根據時間鎖定配送日期選項
  updateCheckoutDateOptions();
  document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.add('hidden');
}

function saveOrderToLocal(order) {
  try {
    let history = JSON.parse(localStorage.getItem('cici_order_history') || '[]');
    history.unshift({ ...order, createdAt: new Date().toLocaleString() });
    if (history.length > 20) history = history.slice(0, 20);
    localStorage.setItem('cici_order_history', JSON.stringify(history));
  } catch (e) { console.error(e); }
}

async function submitOrder() {
  if (!checkIsBusinessOpen()) {
    alert(`❌ Désolé, nous sommes actuellement fermés !`);
    closeCheckoutModal();
    return;
  }

  const submitBtn = document.querySelector('#checkout-modal button[onclick="submitOrder()"]');
  try {
    const dateSelect = document.getElementById('cust-date').value;
    const timeSelect = document.getElementById('cust-time').value;
    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('cust-address').value.trim();
    const note = document.getElementById('cust-note').value.trim();

    if (!dateSelect) return alert('Veuillez choisir le jour de livraison ! / 請選擇配送日期！');
    if (!timeSelect) return alert('Veuillez choisir le créneau horaire ! / 請選擇配送時段！');
    if (!name) return alert('Veuillez entrer votre nom ! / 請填寫姓名！');

    const cleanPhone = phone.replace(/[\s\.\-\(\)]/g, '');
    const frPhoneRegex = /^(?:(?:\+33|0033)[1-9]|0[1-9])\d{8}$/;
    if (!frPhoneRegex.test(cleanPhone)) return alert('Veuillez entrer un numéro de téléphone français valide ! / 請填寫有效的法國手機號碼！');
    if (!address) return alert('Veuillez entrer votre adresse de livraison ! / 請填寫送餐地址！');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Traitement... / 提交中...';
    }

    const items = Object.keys(cart).map(id => {
      const item = menuData.find(i => i.id === id);
      return { id, name_fr: item ? item.name_fr : 'Plat', name_zh: item ? item.name_zh : '菜品', qty: cart[id], price: item ? item.price : 0 };
    });
    
    const total = parseFloat(document.getElementById('total-price').innerText);
    const orderId = generateOrderCode();
    const deliveryDateISO = resolveDeliveryDate(dateSelect);
    const deliverySlot = `${dateSelect} - ${timeSelect}`;
    const fullContactInfo = `[${deliverySlot}] ${phone} | Adresse: ${address}${note ? ' | Note: ' + note : ''}`;
    const dbItems = items.map(i => ({ name: `${i.name_fr} (${i.name_zh})`, qty: i.qty, price: i.price }));

    let { data, error } = await supabaseClient.from('orders').insert([
      { customer_name: name, phone: fullContactInfo, items: dbItems, total_price: total, status: 'pending', order_code: orderId, delivery_date: deliveryDateISO }
    ]).select();

    if (error) {
      alert('Échec: ' + error.message);
      return;
    }

    const realDbId = data[0].id;
    for (let cartItem of items) {
      const targetDish = menuData.find(m => m.id === cartItem.id);
      if (targetDish) {
        const currentStock = targetDish.stock ?? 99;
        const newStock = Math.max(0, currentStock - cartItem.qty);
        await supabaseClient.from('menu_items').update({ stock: newStock, is_available: newStock > 0 }).eq('id', cartItem.id);
        targetDish.stock = newStock;
        targetDish.is_available = newStock > 0;
      }
    }

    lastOrderDetails = { dbId: realDbId, orderId, deliverySlot, name, phone, address, note, items, total };
    saveOrderToLocal(lastOrderDetails);

    cart = {};
    closeCheckoutModal();
    playOrderSuccessSound();

    const whatsappOrderData = {
      customer_name: name, customer_phone: phone,
      delivery_address: `${address} (${deliverySlot})${note ? ' - 備註: ' + note : ''}`,
      items: items.map(i => ({ name: `${i.name_fr} (${i.name_zh})`, quantity: i.qty, price: i.price })),
      total_price: total
    };
    showWhatsAppModal(generateWhatsAppLink(whatsappOrderData, orderId), realDbId, orderId);

  } catch (err) {
    alert('Erreur: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Confirmer / 提交訂單';
    }
  }
}

// 相關彈窗與後台管理函式保持原樣並整合：
async function loadStoreSettings() {
  try {
    const { data } = await supabaseClient.from('store_settings').select('*').eq('id', 1).single();
    if (data) {
      if (data.whatsapp_number) {
        STORE_CONFIG.whatsappNumber = data.whatsapp_number;
        const el = document.getElementById('setting-whatsapp-input');
        if (el) el.value = STORE_CONFIG.whatsappNumber;
      }
      if (data.store_name) {
        STORE_CONFIG.storeName = data.store_name;
        const el = document.getElementById('setting-store-name-input');
        if (el) el.value = STORE_CONFIG.storeName;
        const titleEl = document.getElementById('store-title-text');
        if (titleEl) titleEl.innerText = STORE_CONFIG.storeName;
      }
      if (data.store_slogan) {
        STORE_CONFIG.storeSlogan = data.store_slogan;
        const el = document.getElementById('setting-store-slogan-input');
        if (el) el.value = STORE_CONFIG.storeSlogan;
        const sloganEl = document.getElementById('store-slogan-text');
        if (sloganEl) sloganEl.innerText = STORE_CONFIG.storeSlogan;
      }
      if (data.store_hours_text) {
        STORE_CONFIG.storeHoursText = data.store_hours_text;
        const el = document.getElementById('setting-hours-text-input');
        if (el) el.value = STORE_CONFIG.storeHoursText;
        const hoursEl = document.getElementById('store-hours-text');
        if (hoursEl) hoursEl.innerText = STORE_CONFIG.storeHoursText;
      }
      if (data.business_mode) {
        STORE_CONFIG.businessMode = data.business_mode;
        const el = document.getElementById('setting-business-mode-select');
        if (el) el.value = STORE_CONFIG.businessMode;
      }
      if (typeof data.manual_open === 'boolean') {
        STORE_CONFIG.manualOpen = data.manual_open;
        const el = document.getElementById('setting-manual-open-select');
        if (el) el.value = STORE_CONFIG.manualOpen ? "true" : "false";
      }
      // 載入群主設定的每週配送日
      if (Array.isArray(data.allowed_days)) {
        STORE_CONFIG.allowedDays = data.allowed_days;
        // 同步勾選框狀態
        document.querySelectorAll('.day-checkbox').forEach(chk => {
          chk.checked = STORE_CONFIG.allowedDays.includes(parseInt(chk.value, 10));
        });
      }
      updateBusinessStatusBar();
    }
  } catch (err) { console.error(err); }
}

async function saveAllowedDays() {
  const checkboxes = document.querySelectorAll('.day-checkbox:checked');
  const selectedDays = Array.from(checkboxes).map(chk => parseInt(chk.value, 10));
  const statusEl = document.getElementById('days-save-status');

  try {
    const { error } = await supabaseClient
      .from('store_settings')
      .update({ allowed_days: selectedDays, updated_at: new Date() })
      .eq('id', 1);

    if (error) throw error;
    STORE_CONFIG.allowedDays = selectedDays;
    updateBusinessStatusBar();

    if (statusEl) {
      statusEl.innerText = "✅ 每週送餐日已成功更新！";
      statusEl.className = "text-xs mt-1 text-green-600 font-bold block text-center";
      setTimeout(() => { statusEl.className = "text-xs mt-1 hidden text-center"; }, 3000);
    }
  } catch (err) {
    if (statusEl) {
      statusEl.innerText = "❌ 儲存失敗";
      statusEl.className = "text-xs mt-1 text-red-600 font-bold block text-center";
    }
  }
}

// 其他標準工具涵式維持不變...
window.addEventListener('DOMContentLoaded', () => {
  fetchMenu();
  loadStoreSettings();
  updateBusinessStatusBar();
  setInterval(updateBusinessStatusBar, 60000);
});
