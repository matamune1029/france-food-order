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

// 簡單安全的 HTML 轉義函數，防止 XSS 注入
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 🗓️ 取得巴黎時區的日期字串（YYYY-MM-DD）；offsetDays=0 今天、1 明天
function getParisDateStr(offsetDays = 0) {
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  if (!offsetDays) return todayStr;
  const [y, m, d] = todayStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

// 依顧客選的配送日（Aujourd'hui / Demain）換算成真正的日期
function resolveDeliveryDate(dateSelect) {
  const isTomorrow = /demain|明天/i.test(dateSelect || '');
  return getParisDateStr(isTomorrow ? 1 : 0);
}

// 🧾 產生訂單編號：CC-YYMMDD-XXXX（巴黎日期 + 4 位隨機碼）
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

    const weekdayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const currentDayNum = weekdayMap[weekdayStr] ?? 1;
    const totalMinutes = hour * 60 + minute;

    let openMinutes = 13 * 60;   
    let closeMinutes = 10 * 60;  

    const text = STORE_CONFIG.storeHoursText || "";
    const match = text.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (match) {
      openMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      closeMinutes = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
    }

    let targetDeliveryDay = currentDayNum;
    let isOpenTime = false;

    if (openMinutes > closeMinutes) {
      if (totalMinutes >= openMinutes) {
        targetDeliveryDay = (currentDayNum + 1) % 7;
        isOpenTime = true;
      } else if (totalMinutes < closeMinutes) {
        targetDeliveryDay = currentDayNum;
        isOpenTime = true;
      } else {
        isOpenTime = false;
      }
    } else {
      if (totalMinutes >= openMinutes && totalMinutes <= closeMinutes) {
        targetDeliveryDay = currentDayNum;
        isOpenTime = true;
      } else {
        isOpenTime = false;
      }
    }

    if (!isOpenTime) return false;

    if (Array.isArray(STORE_CONFIG.allowedDays) && STORE_CONFIG.allowedDays.length > 0) {
      if (!STORE_CONFIG.allowedDays.includes(targetDeliveryDay)) {
        return false; 
      }
    }

    return true; 
  } catch (e) {
    console.error('Time check error:', e);
    return true; 
  }
}

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
    let minute = 0;
    formatter.formatToParts(now).forEach(p => {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
    });
    const currentMinutes = hour * 60 + minute;

    let openMinutes = 13 * 60;   
    let closeMinutes = 10 * 60;  

    const text = STORE_CONFIG.storeHoursText || "";
    const match = text.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (match) {
      openMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      closeMinutes = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
    }

    dateSelect.innerHTML = '<option value="">-- Choisir le jour / 請選擇日期 --</option>';

    if (currentMinutes >= openMinutes) {
      dateSelect.innerHTML += `<option value="Demain (明天)">Demain / 明天 (${getParisDateStr(1)})</option>`;
      dateSelect.value = "Demain (明天)";
    } else if (currentMinutes < closeMinutes) {
      dateSelect.innerHTML += `<option value="Aujourd'hui (當天)">Aujourd'hui / 當天 (${getParisDateStr(0)})</option>`;
      dateSelect.value = "Aujourd'hui (當天)";
    } else {
      dateSelect.innerHTML += `
        <option value="Aujourd'hui (當天)">Aujourd'hui / 當天 (${getParisDateStr(0)})</option>
        <option value="Demain (明天)">Demain / 明天 (${getParisDateStr(1)})</option>
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

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.15); 
    gain2.gain.setValueAtTime(0.3, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.4);
  } catch (e) {
    console.log('Audio error:', e);
  }
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
  } catch (e) {
    console.log('Audio error:', e);
  }
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
  } catch (e) {
    console.log('Admin Audio error:', e);
  }
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
    if (error) console.error('Menu Fetch Error:', error);
    menuData = data || [];
    renderCategoryBar();
    renderMenu();
  } catch (err) {
    console.error('Fetch Menu Failure:', err);
    const container = document.getElementById('menu-container');
    if (container) container.innerHTML = '<div class="text-center text-red-500 py-10">Erreur de chargement / 菜單載入失敗</div>';
  }
}

function renderCategoryBar() {
  const categoryContainer = document.getElementById('category-bar');
  if (!categoryContainer) return;

  categoryContainer.innerHTML = fixedCategories.map(cat => {
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

    if (availA !== availB) {
      return availB - availA;
    }
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
      ? `<img src="${escapeHtml(item.image_url)}" class="w-16 h-16 rounded-lg object-cover flex-shrink-0" alt="${escapeHtml(item.name_zh)}">`
      : `<div class="w-16 h-16 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-400 font-bold text-xs flex-shrink-0">🍲</div>`;

    return `
      <div class="bg-white p-3 rounded-xl shadow-sm flex items-center gap-3 border border-gray-100 ${!isAvailable ? 'opacity-50 grayscale' : ''}">
        <div onclick="openDishDetailModal('${item.id}')" class="cursor-pointer flex-shrink-0">
          ${imgHtml}
        </div>
        
        <div class="flex-1 min-w-0">
          <div onclick="openDishDetailModal('${item.id}')" class="font-bold text-gray-800 text-xs sm:text-sm leading-tight line-clamp-2 break-words cursor-pointer hover:text-green-600 transition">
            ${escapeHtml(item.name_fr)}
            ${!isAvailable ? '<span class="ml-1 text-[10px] bg-gray-200 text-gray-600 px-1 py-0.5 rounded font-normal inline-block">Épuisé</span>' : ''}
          </div>
          <div class="text-xs text-gray-500 font-normal mt-0.5 truncate">${escapeHtml(item.name_zh)}</div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-green-600 font-extrabold text-base">${item.price || 0} €</span>
            ${isAvailable ? `<span class="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">Stock: ${maxStock}</span>` : ''}
          </div>
        </div>
        
        <div class="flex items-center gap-1.5 flex-shrink-0">
          ${currentCartQty > 0 ? `
            <button type="button" onclick="updateCart('${item.id}', -1)" class="w-7 h-7 bg-gray-100 text-gray-700 rounded-full font-bold flex items-center justify-center active:scale-90">-</button>
            <span class="text-sm font-bold w-4 text-center">${currentCartQty}</span>
          ` : ''}
          <button type="button" 
            ${(!isAvailable || isMaxReached) ? 'disabled' : `onclick="updateCart('${item.id}', 1)"`} 
            class="w-7 h-7 ${isAvailable && !isMaxReached ? 'bg-green-500 text-white shadow-md active:scale-90' : 'bg-gray-300 text-gray-500 cursor-not-allowed'} rounded-full font-bold flex items-center justify-center">
            +
          </button>
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
    alert(`Stock insuffisant ! Il ne reste que ${maxStock} portion(s). / 庫存不足，該菜品僅剩 ${maxStock} 份！`);
    return;
  }

  cart[id] = currentQty + delta;
  if (cart[id] <= 0) delete cart[id];
  renderMenu();

  let total = 0;
  let count = 0;
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
  if (count > 0) {
    badge.innerText = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function openCheckoutModal() {
  if (!checkIsBusinessOpen()) {
    alert(`❌ Désolé, nous sommes actuellement fermés !\n抱歉，目前為非營業時間（${STORE_CONFIG.storeHoursText}），暫不接受下單！`);
    return;
  }
  if (Object.keys(cart).length === 0) return alert('Votre panier est vide ! / 購物車是空的！');
  
  updateCheckoutDateOptions();
  document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.add('hidden');
}

function saveOrderToLocal(order) {
  try {
    let history = JSON.parse(localStorage.getItem('cici_order_history') || '[]');
    history.unshift({
      ...order,
      createdAt: new Date().toLocaleString()
    });
    if (history.length > 20) history = history.slice(0, 20);
    localStorage.setItem('cici_order_history', JSON.stringify(history));
  } catch (e) {
    console.error('Save local order error:', e);
  }
}

// 🔒 place_order 失敗時的提示（錯誤代碼由資料庫函式回傳）
function handlePlaceOrderError(msg) {
  console.error('place_order error:', msg);
  let text;
  if (msg.includes('OUT_OF_STOCK:')) {
    const dish = msg.split('OUT_OF_STOCK:')[1].split('\n')[0].trim();
    text = `❌ Désolé, « ${dish} » n'est plus disponible en quantité suffisante.\n抱歉，「${dish}」庫存不足或已下架，請調整購物車後再試。`;
  } else if (msg.includes('DISH_NOT_FOUND')) {
    text = "❌ Un plat n'existe plus, veuillez rafraîchir la page.\n有菜品已被移除，請重新整理頁面後再下單。";
  } else if (/INVALID_/.test(msg)) {
    text = '❌ Données invalides, veuillez vérifier votre commande.\n訂單資料有誤，請檢查姓名、電話、地址與購物車後再試。';
  } else {
    text = 'Échec / 下單失敗: ' + msg;
  }
  alert(text);
  fetchMenu(); // 重新讀取最新庫存
}

async function submitOrder() {
  if (!checkIsBusinessOpen()) {
    alert(`❌ Désolé, nous sommes actuellement fermés !\n抱歉，目前為非營業時間（${STORE_CONFIG.storeHoursText}），暫不接受下單！`);
    closeCheckoutModal();
    return;
  }

  const submitBtn = document.querySelector('#checkout-modal button[onclick="submitOrder()"]');
  
  try {
    const fulfillmentMode = document.getElementById('cust-fulfillment').value; 
    const dateSelect = document.getElementById('cust-date').value;
    const timeSelect = document.getElementById('cust-time').value;
    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const note = document.getElementById('cust-note').value.trim();

    if (!dateSelect) return alert('Veuillez choisir le jour de livraison ! / 請選擇配送日期！');
    if (!timeSelect) return alert('Veuillez choisir le créneau horaire ! / 請選擇配送時段！');
    if (!name) return alert('Veuillez entrer votre nom ! / 請填寫姓名！');

    const cleanPhone = phone.replace(/[\s\.\-\(\)]/g, '');
    const frPhoneRegex = /^(?:(?:\+33|0033)[1-9]|0[1-9])\d{8}$/;
    if (!frPhoneRegex.test(cleanPhone)) {
      return alert('Veuillez entrer un numéro de téléphone français valide (ex: 0612345678) ! / 請填寫有效的法國手機號碼！');
    }

    let fullDeliveryAddress = '到店自取 (Click & Collect)';

    if (fulfillmentMode === 'delivery') {
      const postCodeSelect = document.getElementById('cust-postcode').value;
      const addressInput = document.getElementById('cust-address').value.trim();

      if (!postCodeSelect) {
        return alert('Veuillez sélectionner votre code postal ! / 請選擇配送郵遞區號！');
      }
      if (!addressInput || addressInput.includes('到店自取')) {
        return alert('Veuillez entrer votre adresse de livraison ! / 請填寫詳細送餐地址！');
      }

      fullDeliveryAddress = `${addressInput}, ${postCodeSelect} Montpellier`;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
      submitBtn.innerText = 'Traitement en cours... / 提交中...';
    }

    try {
      const { data: latestSetting } = await supabaseClient
        .from('store_settings')
        .select('whatsapp_number, store_name')
        .eq('id', 1)
        .single();
      
      if (latestSetting) {
        if (latestSetting.whatsapp_number) STORE_CONFIG.whatsappNumber = latestSetting.whatsapp_number;
        if (latestSetting.store_name) STORE_CONFIG.storeName = latestSetting.store_name;
      }
    } catch (e) {
      console.warn("即時同步後台設定失敗，使用現有設定", e);
    }

    // 🔒 價格、庫存、訂單寫入全部交給資料庫函式 place_order：
    //    顧客端只送「菜品 id + 數量」，價格與庫存由資料庫判斷，前端無法竄改。
    const cartPayload = Object.keys(cart).map(id => ({ id: String(id), qty: cart[id] }));
    const deliverySlot = `${dateSelect} - ${timeSelect}`;
    const deliveryDateISO = resolveDeliveryDate(dateSelect);

    const fulfillmentText = fulfillmentMode === 'pickup' ? '[到店自取 Click & Collect]' : `[配送 Livraison] Adresse: ${fullDeliveryAddress}`;
    const fullContactInfo = `[${deliverySlot}] ${phone} | ${fulfillmentText}${note ? ' | Note: ' + note : ''}`;

    let orderId = generateOrderCode();
    let rpcResult = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: rpcData, error: rpcError } = await supabaseClient.rpc('place_order', {
        p_customer_name: name,
        p_contact: fullContactInfo,
        p_items: cartPayload,
        p_order_code: orderId,
        p_delivery_date: deliveryDateISO
      });

      if (!rpcError) { rpcResult = rpcData; break; }

      const msg = rpcError.message || '';
      // 訂單編號剛好撞號：換一個新編號再試
      if (/duplicate key|orders_order_code_key/i.test(msg) && attempt < 2) {
        orderId = generateOrderCode();
        continue;
      }
      handlePlaceOrderError(msg);
      return;
    }
    if (!rpcResult) return;

    const realDbId = rpcResult.id;
    const calculatedTotal = Number(rpcResult.total) || 0;
    const itemsForWhatsApp = (rpcResult.items || []).map(i => ({
      name_fr: i.name_fr,
      name_zh: i.name_zh,
      qty: i.qty,
      price: Number(i.price) || 0
    }));

    lastOrderDetails = { dbId: realDbId, orderId, deliverySlot, name, phone, address: fullDeliveryAddress, note, items: itemsForWhatsApp, total: calculatedTotal };
    saveOrderToLocal(lastOrderDetails);

    cart = {};
    document.getElementById('total-price').innerText = '0.00';
    document.getElementById('modal-total-price').innerText = '0.00';
    const cartBadgeEl = document.getElementById('cart-badge');
    if (cartBadgeEl) cartBadgeEl.classList.add('hidden');
    fetchMenu(); // 重新讀取最新庫存（庫存已由資料庫扣除）並刷新菜單
    closeCheckoutModal();
    playOrderSuccessSound();

    const whatsappOrderData = {
      customer_name: name,
      customer_phone: phone,
      delivery_address: `${fullDeliveryAddress} (${deliverySlot})${note ? ' - 備註: ' + note : ''}`,
      items: itemsForWhatsApp.map(i => ({ name: `${i.name_fr} (${i.name_zh})`, quantity: i.qty, price: i.price })),
      total_price: calculatedTotal
    };
    
    const whatsappUrl = generateWhatsAppLink(whatsappOrderData, orderId);
    showWhatsAppModal(whatsappUrl, realDbId, orderId);

  } catch (err) {
    console.error('Submission Error:', err);
    alert('Erreur / 提交過程發生錯誤: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      submitBtn.innerText = 'Confirmer / 提交訂單';
    }
  }
}

function showReceiptModal(order) {
  document.getElementById('receipt-id').innerText = '#' + order.orderId;
  document.getElementById('receipt-slot').innerText = order.deliverySlot;
  document.getElementById('receipt-name').innerText = order.name;
  document.getElementById('receipt-phone').innerText = order.phone;
  document.getElementById('receipt-address').innerText = order.address;
  document.getElementById('receipt-total').innerText = order.total.toFixed(2);

  const itemsContainer = document.getElementById('receipt-items');
  itemsContainer.innerHTML = order.items.map(i => `
    <li class="flex justify-between">
      <span>${escapeHtml(i.name_fr)} (${escapeHtml(i.name_zh)}) x${escapeHtml(i.qty)}</span>
      <span class="font-bold">${(i.price * i.qty).toFixed(2)} €</span>
    </li>
  `).join('');

  document.getElementById('receipt-modal').classList.remove('hidden');
}

async function downloadReceiptAsImage() {
  const receiptCard = document.getElementById('receipt-card');
  if (!receiptCard) return;

  try {
    const canvas = await html2canvas(receiptCard, {
      scale: 2,
      backgroundColor: '#f9fafb'
    });

    const imageDataUrl = canvas.toDataURL('image/png');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (isIOS) {
      showImagePreviewOverlay(imageDataUrl);
    } else {
      const link = document.createElement('a');
      link.href = imageDataUrl;
      link.download = `Receipt_${lastOrderDetails ? lastOrderDetails.orderId : 'CC-0001'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (err) {
    console.error('Generate image error:', err);
    alert('圖片生成失敗，請手動截圖保存！');
  }
}

function showImagePreviewOverlay(imgUrl) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/80 z-[60] flex flex-col items-center justify-center p-4 animate-fade-in';
  overlay.innerHTML = `
    <div class="text-white text-center mb-3 space-y-1">
      <div class="text-sm font-bold">📸 請 App/手機 內「長按圖片」保存至相冊</div>
      <div class="text-xs opacity-75">Appuyez longuement pour enregistrer l'image</div>
    </div>
    <img src="${imgUrl}" class="max-w-full max-h-[70vh] rounded-xl shadow-2xl border border-white/20 object-contain">
    <button type="button" onclick="this.parentElement.remove()" class="mt-4 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-6 py-2 rounded-full border border-white/40">
      Fermer / 關閉
    </button>
  `;
  document.body.appendChild(overlay);
}

function copyReceiptText() {
  if (!lastOrderDetails) return;
  const o = lastOrderDetails;
  const itemText = o.items.map(i => `- ${i.name_fr} (${i.name_zh}) x${i.qty}`).join('\n');
  const text = `🧾 【Cici Cuisine 訂單憑證 #${o.orderId}】\n📅 配送時間: ${o.deliverySlot}\n👤 姓名: ${o.name}\n📞 電話: ${o.phone}\n📍 地址: ${o.address}\n\n🍲 訂購餐點:\n${itemText}\n\n💰 總計: ${o.total.toFixed(2)} €`;

  navigator.clipboard.writeText(text).then(() => {
    alert('📋 訂單明細已複製到剪貼板！可以直接發給群主微信。');
  }).catch(() => {
    alert('複製失敗，請直接截圖保存。');
  });
}

function closeReceiptModal() {
  document.getElementById('receipt-modal').classList.add('hidden');
  renderMenu();
}

function openHistoryModal() {
  const modal = document.getElementById('history-modal');
  const container = document.getElementById('history-list');
  if (!modal || !container) return;

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('cici_order_history') || '[]');
  } catch (e) {
    history = [];
  }

  if (history.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-400 py-8 text-xs">Aucune commande récente / 尚無歷史訂單紀錄</div>';
  } else {
    container.innerHTML = history.map((o, index) => {
      const itemsText = o.items ? o.items.map(i => `${i.name_fr} x${i.qty}`).join(', ') : '';
      
      const whatsappOrderData = {
        customer_name: o.name,
        customer_phone: o.phone,
        delivery_address: `${o.address} (${o.deliverySlot})${o.note ? ' - 備註: ' + o.note : ''}`,
        items: o.items ? o.items.map(i => ({ name: `${i.name_fr} (${i.name_zh})`, quantity: i.qty, price: i.price })) : [],
        total_price: o.total
      };
      const whatsappUrl = generateWhatsAppLink(whatsappOrderData, o.orderId);
      const targetDbId = o.dbId || '';

      return `
        <div class="bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-xs space-y-2 shadow-sm">
          <div class="flex justify-between items-center font-bold text-gray-800 border-b pb-1">
            <span class="text-green-600">#${escapeHtml(o.orderId)}</span>
            <span class="text-gray-400 text-[10px] font-normal">${o.createdAt || ''}</span>
          </div>
          <div class="text-gray-600">📅 <strong>配送:</strong> ${escapeHtml(o.deliverySlot)}</div>
          <div class="text-gray-600 truncate">🍲 <strong>明細:</strong> ${escapeHtml(itemsText)}</div>
          <div class="flex justify-between items-center pt-1 font-bold border-t border-gray-100">
            <span class="text-gray-500">總計: <span class="text-green-600 text-sm">${(o.total || 0).toFixed(2)} €</span></span>
            
            <a href="${escapeHtml(whatsappUrl)}" target="_blank" onclick="markWhatsappClicked('${escapeHtml(targetDbId)}')"
               class="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1 shadow-sm transition text-[11px]">
              <span>📱 傳送 WhatsApp</span>
            </a>
          </div>
        </div>
      `;
    }).join('');
  }

  modal.classList.remove('hidden');
}

function closeHistoryModal() {
  const modal = document.getElementById('history-modal');
  if (modal) modal.classList.add('hidden');
}

let secretClickCount = 0;
let secretClickTimer = null;

function handleSecretClick() {
  secretClickCount++;
  clearTimeout(secretClickTimer);
  secretClickTimer = setTimeout(() => { secretClickCount = 0; }, 3000);

  if (secretClickCount >= 5) {
    secretClickCount = 0;
    const btn = document.getElementById('admin-btn');
    if (btn) btn.classList.remove('hidden');
    toggleMode(true);
  }
}

let isAdminLoggedIn = false;

// 🌟 單一且正確的 toggleMode 函式（支援輸入信箱與密碼）
// 🌟 修正後的 toggleMode 函式：會自動向 Supabase 檢查是否已登入
async function toggleMode(forceCheck = false) {
  const adminView = document.getElementById('admin-view');
  const customerView = document.getElementById('customer-view');

  // 如果後台目前是隱藏的（代表要打開後台）
  if (adminView.classList.contains('hidden') || forceCheck) {
    
    // 1. 先主動問 Supabase 目前有沒有記住登入的帳號
    const { data: { session } } = await supabaseClient.auth.getSession();

    // 2. 如果 Supabase 裡面「沒有」登入記錄，才跳出視窗要求輸入帳密
    if (!session) {
      const adminEmail = prompt("📧 請輸入管理員信箱 (Email Admin)：");
      if (!adminEmail) return;

      const password = prompt("🔐 請輸入管理員密碼 (Mot de passe Admin)：");
      if (!password) return;

      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: adminEmail.trim(),
          password: password
        });

        if (error) {
          alert("❌ 登入失敗 / Identifiants incorrects：" + error.message);
          return;
        }
      } catch (err) {
        console.error("登入異常:", err);
        alert("❌ 系統登入發生錯誤！");
        return;
      }
    }
  }

  // 切換前台與後台的顯示狀態
  adminView.classList.toggle('hidden');
  customerView.classList.toggle('hidden');

  if (!adminView.classList.contains('hidden')) {
    fetchOrders();
    initAdminRealtimeListener(); 
  } else {
    // 這裡保留不自動登出，讓老闆下次點開能直接進來
    if (orderChannel) {
      supabaseClient.removeChannel(orderChannel);
      orderChannel = null;
    }
  }
}

function initAdminRealtimeListener() {
  if (orderChannel) return;

  orderChannel = supabaseClient
    .channel('admin-orders-channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => {
        playAdminNewOrderSound();
        fetchOrders();
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        fetchOrders();
      }
    )
    .subscribe();
}

function checkUrlAdminParam() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('admin') === 'true') {
    const btn = document.getElementById('admin-btn');
    if (btn) btn.classList.remove('hidden');
  }
}

function switchAdminTab(tab) {
  const ordersTab = document.getElementById('admin-orders-tab');
  const menuTab = document.getElementById('admin-menu-tab');
  const settingsTab = document.getElementById('admin-settings-tab');
  const ordersBtn = document.getElementById('tab-orders-btn');
  const menuBtn = document.getElementById('tab-menu-btn');
  const settingsBtn = document.getElementById('tab-settings-btn');

  ordersTab.classList.add('hidden');
  menuTab.classList.add('hidden');
  settingsTab.classList.add('hidden');
  
  ordersBtn.className = "flex-1 py-2 rounded-lg text-gray-500 transition";
  menuBtn.className = "flex-1 py-2 rounded-lg text-gray-500 transition";
  settingsBtn.className = "flex-1 py-2 rounded-lg text-gray-500 transition";

  const activeClass = "flex-1 py-2 rounded-lg bg-white shadow text-gray-800 transition";

  if (tab === 'orders') {
    ordersTab.classList.remove('hidden');
    ordersBtn.className = activeClass;
    fetchOrders();
  } else if (tab === 'menu') {
    menuTab.classList.remove('hidden');
    menuBtn.className = activeClass;
    fetchAdminMenu();
  } else if (tab === 'settings') {
    settingsTab.classList.remove('hidden');
    settingsBtn.className = activeClass;
  }
}

async function fetchOrders() {
  const container = document.getElementById('order-list');
  if (!container) return;

  container.innerHTML = '<div class="text-gray-400 text-xs text-center py-4">Chargement des commandes... / 讀取訂單中...</div>';

  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      container.innerHTML = `<div class="text-red-500 text-xs text-center py-4">讀取失敗: ${escapeHtml(error.message)}</div>`;
      return;
    }

    rawOrders = data || [];
    applyOrderFilters();

  } catch (err) {
    container.innerHTML = `<div class="text-red-500 text-xs text-center py-4">系統異常: ${escapeHtml(err.message)}</div>`;
  }
}

function filterOrderTab(tabKey) {
  currentOrderTab = tabKey;

  const btnAll = document.getElementById('order-filter-all');
  const btnToday = document.getElementById('order-filter-today');
  const btnTomorrow = document.getElementById('order-filter-tomorrow');
  const datePicker = document.getElementById('order-date-picker');

  if (datePicker) datePicker.value = '';

  const activeClass = "flex-1 py-1.5 rounded-lg bg-white text-green-700 shadow-sm transition font-bold";
  const inactiveClass = "flex-1 py-1.5 rounded-lg text-gray-500 transition font-normal";

  if (btnAll) btnAll.className = tabKey === 'all' ? activeClass : inactiveClass;
  if (btnToday) btnToday.className = tabKey === 'today' ? activeClass : inactiveClass;
  if (btnTomorrow) btnTomorrow.className = tabKey === 'tomorrow' ? activeClass : inactiveClass;

  applyOrderFilters();
}

async function updateOrderStatus(orderId, newStatus) {
  const { error } = await supabaseClient
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId);

  if (error) {
    alert('❌ 修改狀態失敗: ' + error.message);
  } else {
    const target = rawOrders.find(o => o.id === orderId);
    if (target) target.status = newStatus;
    applyOrderFilters();
  }
}

function applyOrderFilters() {
  const container = document.getElementById('order-list');
  if (!container) return;

  const searchKeyword = (document.getElementById('order-search-input')?.value || '').toLowerCase().trim();
  const datePickerVal = document.getElementById('order-date-picker')?.value;
  const statusFilterVal = document.getElementById('order-status-filter')?.value || 'all';

  let filtered = [...rawOrders];

  if (statusFilterVal !== 'all') {
    filtered = filtered.filter(o => (o.status || 'pending') === statusFilterVal);
  }

  if (datePickerVal) {
    filtered = filtered.filter(o => {
      if (!o.created_at) return false;
      const orderDateStr = new Date(o.created_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      return orderDateStr === datePickerVal;
    });
  } else if (currentOrderTab === 'today' || currentOrderTab === 'tomorrow') {
    const targetDate = getParisDateStr(currentOrderTab === 'today' ? 0 : 1);
    filtered = filtered.filter(o => {
      if (o.delivery_date) return String(o.delivery_date).slice(0, 10) === targetDate;
      const phoneStr = (o.phone || '').toLowerCase();
      return currentOrderTab === 'today'
        ? (phoneStr.includes('aujourd') || phoneStr.includes('當天') || phoneStr.includes('当天'))
        : (phoneStr.includes('demain') || phoneStr.includes('明天'));
    });
  }

  if (searchKeyword) {
    filtered = filtered.filter(o => {
      const nameMatch = (o.customer_name || '').toLowerCase().includes(searchKeyword);
      const phoneMatch = (o.phone || '').toLowerCase().includes(searchKeyword);
      const itemMatch = Array.isArray(o.items) && o.items.some(i => (i.name || '').toLowerCase().includes(searchKeyword));
      const codeMatch = (o.order_code || '').toLowerCase().includes(searchKeyword);
      return nameMatch || phoneMatch || itemMatch || codeMatch;
    });
  }

  const validOrders = filtered.filter(o => (o.status || 'pending') !== 'cancelled');
  const totalMoney = validOrders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
  
  const moneyElem = document.getElementById('stat-total-money');
  const countElem = document.getElementById('stat-order-count');
  if (moneyElem) moneyElem.innerText = totalMoney.toFixed(2);
  if (countElem) countElem.innerText = validOrders.length;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-gray-400 text-xs text-center py-6">Aucune commande trouvée / 查無訂單</div>';
    return;
  }

  const statusBadgeMap = {
    'pending': '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">⏳ 待處理</span>',
    'delivering': '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">🛵 配送中</span>',
    'completed': '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold">✅ 已送達</span>',
    'cancelled': '<span class="bg-gray-200 text-gray-500 px-2 py-0.5 rounded text-[10px] font-bold line-through">❌ 已取消</span>'
  };

  container.innerHTML = filtered.map(o => {
    const st = o.status || 'pending';
    const isCancelled = st === 'cancelled';
    const createdTimeStr = o.created_at ? new Date(o.created_at).toLocaleString() : '';

    const whatsappBadge = o.whatsapp_sent 
      ? '<span class="bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded text-[10px] font-bold">💬 已點擊WA</span>' 
      : '<span class="bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded text-[10px]">⏳ 未點WA</span>';
    
    const itemsList = Array.isArray(o.items) 
      ? o.items.map(i => `<li class="flex justify-between"><span>${escapeHtml(i.name || '菜品')}</span><span class="font-bold">x${escapeHtml(i.qty || 1)}</span></li>`).join('')
      : '<li class="text-gray-400">無明細</li>';

    return `
      <div class="bg-white p-3.5 rounded-xl border-l-4 ${st === 'completed' ? 'border-green-500' : (isCancelled ? 'border-gray-300 opacity-60' : 'border-orange-500')} shadow-sm space-y-2">
        <div class="flex justify-between items-start font-bold text-gray-800">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm">👤 ${escapeHtml(o.customer_name || '匿名顧客')}</span>
              ${statusBadgeMap[st] || statusBadgeMap['pending']}
              ${whatsappBadge}
            </div>
            <div class="text-[10px] text-gray-400 font-normal mt-0.5">${o.order_code ? '#' + escapeHtml(o.order_code) + ' · ' : ''}${createdTimeStr}</div>
          </div>
          <span class="text-green-600 text-base font-black ${isCancelled ? 'line-through text-gray-400' : ''}">${(o.total_price || 0).toFixed(2)} €</span>
        </div>

        <div class="text-xs font-medium text-orange-700 bg-orange-50 p-2 rounded-lg border border-orange-100 break-all leading-relaxed">
          📍 ${escapeHtml(o.phone || '無聯繫資訊')}
        </div>

        <ul class="text-xs bg-gray-50 p-2.5 rounded-lg border space-y-1 text-gray-700">
          ${itemsList}
        </ul>

        <div class="flex justify-between items-center pt-2 border-t text-xs">
          <div class="flex items-center gap-1">
            <span class="text-[10px] text-gray-400 font-bold">狀態:</span>
            <select onchange="updateOrderStatus('${o.id}', this.value)" class="text-[11px] border rounded p-1 font-bold bg-gray-50 text-gray-700">
              <option value="pending" ${st === 'pending' ? 'selected' : ''}>⏳ 待處理</option>
              <option value="delivering" ${st === 'delivering' ? 'selected' : ''}>🛵 配送中</option>
              <option value="completed" ${st === 'completed' ? 'selected' : ''}>✅ 已送達</option>
              <option value="cancelled" ${st === 'cancelled' ? 'selected' : ''}>❌ 已取消</option>
            </select>
          </div>

          <div class="flex items-center gap-1.5">
            ${isCancelled ? `
              <button type="button" onclick="deleteOrderFromSupabase('${o.id}')" class="bg-red-100 hover:bg-red-200 text-red-600 text-[10px] px-2 py-1 rounded font-bold transition">
                🗑️ 永久刪除
              </button>
            ` : ''}
            <button type="button" onclick="copyOrderForDriver('${o.id}')" class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] px-2 py-1 rounded font-bold transition">
              📋 派送小票
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function copyOrderForDriver(orderId) {
  const order = rawOrders.find(o => o.id == orderId);
  if (!order) return alert('找不到訂單資料，請重新整理後再試。');
  const name = order.customer_name || '';
  const contactInfo = order.phone || '';
  const total = order.total_price;
  const text = `🛵 【外賣派送憑證${order.order_code ? ' #' + order.order_code : ''}】\n👤 客戶: ${name}\n📍 聯繫/地址: ${contactInfo}\n💰 應收金額: ${total} €`;
  navigator.clipboard.writeText(text).then(() => {
    alert('📋 已成功複製派送資訊！可以貼給司機或外賣員。');
  }).catch(() => {
    alert('複製失敗，請手動複製。');
  });
}

async function fetchAdminMenu() {
  const container = document.getElementById('admin-menu-list');
  if (!container) return;

  if (!menuData || menuData.length === 0) {
    const { data } = await supabaseClient.from('menu_items').select('*');
    if (data) menuData = data;
  }

  if (!menuData || menuData.length === 0) {
    container.innerHTML = '<div class="text-gray-400 text-xs text-center py-4">Aucun plat / 暫無菜品</div>';
    return;
  }

  const categoryPriority = {
    'Specialite': 1, 'Viandes': 2, 'Seafood': 3, 'Beef': 4, 'Legumes': 5, 'Staple': 6
  };

  const categoryLabelMap = {
    'Specialite': '🌟 每日特色', 'Viandes': '🥩 葷菜', 'Seafood': '🐟 海鮮類',
    'Beef': '🐂 牛肉類', 'Legumes': '🥬 素菜', 'Staple': '🍚 主食'
  };

  menuData.sort((a, b) => {
    const catAKey = normalizeCategory(a.category, a.name_zh, a.name_fr);
    const catBKey = normalizeCategory(b.category, b.name_zh, b.name_fr);

    const priorityA = categoryPriority[catAKey] || 99;
    const priorityB = categoryPriority[catBKey] || 99;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return (a.sort_order || 99) - (b.sort_order || 99);
  });

  let lastCategoryKey = null;
  let htmlContent = '';

  menuData.forEach(item => {
    const stockVal = (item && typeof item.stock === 'number') ? item.stock : 99;
    const isAvailable = (item.is_available !== false) && (stockVal > 0);
    const normKey = normalizeCategory(item.category, item.name_zh, item.name_fr);

    if (normKey !== lastCategoryKey) {
      lastCategoryKey = normKey;
      htmlContent += `
        <div class="pt-3 pb-1 text-xs font-bold text-gray-500 border-b border-gray-200 flex items-center justify-between">
          <span>${categoryLabelMap[normKey] || '其他分類'}</span>
        </div>
      `;
    }

    const imgThumb = item.image_url 
      ? `<img src="${escapeHtml(item.image_url)}" class="w-10 h-10 rounded object-cover mr-2 flex-shrink-0">`
      : `<div class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400 mr-2 flex-shrink-0">🍲</div>`;

    htmlContent += `
      <div class="bg-white p-2.5 rounded-xl border flex justify-between items-center shadow-sm hover:border-gray-300 transition">
        <div class="flex items-center flex-1 pr-2 min-w-0">
          ${imgThumb}
          <div class="min-w-0 flex-1">
            <div class="font-bold text-gray-800 text-xs truncate">
              <span class="bg-gray-100 text-gray-600 px-1 py-0.5 rounded mr-1 font-mono">#${item.sort_order || 99}</span>
              ${escapeHtml(item.name_fr)} (${escapeHtml(item.name_zh)})
            </div>
            <div class="text-green-600 font-extrabold text-xs mt-0.5 flex items-center gap-2">
              <span>${item.price || 0} €</span>
              <span class="text-gray-500 font-normal text-[10px] bg-gray-100 px-1 py-0.5 rounded">庫存: ${stockVal}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button type="button" onclick="toggleDishAvailability(event, '${item.id}', ${!isAvailable})" class="px-2 py-1 rounded text-[10px] font-bold transition ${isAvailable ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}">
            ${isAvailable ? 'En vente' : 'Masqué'}
          </button>
          <button type="button" onclick="openDishModal('${item.id}')" class="bg-orange-100 text-orange-600 px-2 py-1 rounded text-[10px] font-bold hover:bg-orange-200">
            Modifier
          </button>
          <button type="button" onclick="deleteDish(event, '${item.id}')" class="bg-red-100 text-red-600 px-2 py-1 rounded text-[10px] font-bold hover:bg-red-200">
            Suppr.
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = htmlContent;
}

async function toggleDishAvailability(event, id, newStatus) {
  if (event) event.stopPropagation();
  
  const { error } = await supabaseClient.from('menu_items').update({ is_available: newStatus }).eq('id', id);
  if (error) {
    alert('修改狀態失敗: ' + error.message);
  } else {
    const target = menuData.find(m => m.id === id);
    if (target) target.is_available = newStatus;

    fetchAdminMenu();
    renderMenu();
  }
}

function openDishModal(id = null) {
  const modal = document.getElementById('dish-modal');
  const title = document.getElementById('dish-modal-title');
  if (!modal) return;  
  const sortInput = document.getElementById('dish-sort');
  const stockInput = document.getElementById('dish-stock');
  const urlInput = document.getElementById('dish-image-url');
  const fileInput = document.getElementById('dish-img-file');
  const preview = document.getElementById('dish-img-preview');

  if (fileInput) fileInput.value = '';

  if (id) {
    const item = menuData.find(m => m.id === id);
    if (!item) return;
    title.innerText = 'Modifier le plat / 編輯菜品';
    document.getElementById('dish-id').value = item.id;
    document.getElementById('dish-name-fr').value = item.name_fr || '';
    document.getElementById('dish-name-zh').value = item.name_zh || '';
    document.getElementById('dish-price').value = item.price || '';
    if (sortInput) sortInput.value = item.sort_order || 1;
    if (stockInput) stockInput.value = (typeof item.stock === 'number') ? item.stock : 99;
    if (urlInput) urlInput.value = item.image_url || '';
    
    if (preview) {
      preview.innerHTML = item.image_url 
        ? `<img src="${escapeHtml(item.image_url)}" class="w-full h-full object-cover">`
        : '無圖片';
    }

    const normKey = normalizeCategory(item.category, item.name_zh, item.name_fr);
    const catSelect = document.getElementById('dish-category');
    if (catSelect) {
      if (normKey === 'Specialite') catSelect.value = '每日特色';
      else if (normKey === 'Seafood') catSelect.value = '海鮮類';
      else if (normKey === 'Beef') catSelect.value = '牛肉類';
      else if (normKey === 'Legumes') catSelect.value = '素菜';
      else if (normKey === 'Staple') catSelect.value = '主食';
      else catSelect.value = '葷菜';
    }
  } else {
    title.innerText = 'Ajouter un plat / 新增菜品';
    document.getElementById('dish-id').value = '';
    document.getElementById('dish-name-fr').value = '';
    document.getElementById('dish-name-zh').value = '';
    document.getElementById('dish-price').value = '';
    if (sortInput) sortInput.value = '1';
    if (stockInput) stockInput.value = '99';
    if (urlInput) urlInput.value = '';
    if (preview) preview.innerHTML = '無圖片';
    document.getElementById('dish-category').value = '每日特色';
  }
  modal.classList.remove('hidden');
}

function closeDishModal() {
  const modal = document.getElementById('dish-modal');
  if (modal) modal.classList.add('hidden');
}

async function saveDish() {
  const id = document.getElementById('dish-id').value;
  const name_fr = document.getElementById('dish-name-fr').value.trim();
  const name_zh = document.getElementById('dish-name-zh').value.trim();
  const price = parseFloat(document.getElementById('dish-price').value);
  const sortInput = document.getElementById('dish-sort');
  const stockInput = document.getElementById('dish-stock');
  const fileInput = document.getElementById('dish-img-file');
  let image_url = document.getElementById('dish-image-url').value.trim();

  const sort_order = sortInput ? (parseInt(sortInput.value) || 1) : 1;
  const stock = stockInput ? (parseInt(stockInput.value) >= 0 ? parseInt(stockInput.value) : 99) : 99;
  const category = document.getElementById('dish-category').value;

  if (!name_fr || !name_zh || isNaN(price)) {
    return alert('Veuillez remplir tous les champs / 請完整填寫名稱與價格！');
  }

  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('dishes')
      .upload(fileName, file);

    if (uploadError) {
      alert('❌ 圖片上傳失敗: ' + uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from('dishes')
      .getPublicUrl(fileName);

    if (publicUrlData) {
      image_url = publicUrlData.publicUrl;
    }
  }

  const payload = { 
    name_fr, 
    name_zh, 
    price, 
    sort_order,
    stock,
    category,
    image_url,
    is_available: stock > 0 
  };

  let res;
  if (id) {
    res = await supabaseClient.from('menu_items').update(payload).eq('id', id);
  } else {
    res = await supabaseClient.from('menu_items').insert([payload]);
  }

  if (res.error) {
    alert('❌ 保存失敗: ' + res.error.message);
  } else {
    closeDishModal();
    await fetchMenu();
    fetchAdminMenu();
  }
}

async function deleteDish(event, id) {
  const dishToDelete = menuData.find(m => m.id === id);
  const nameZh = dishToDelete ? (dishToDelete.name_zh || '') : '';
  if (event) event.stopPropagation();

  const confirmDelete = confirm(`⚠️ Êtes-vous sûr de vouloir supprimer "${nameZh}" ?\n確定要永久刪除菜品「${nameZh}」嗎？刪除後無法恢復！`);
  if (!confirmDelete) return;

  const { error } = await supabaseClient.from('menu_items').delete().eq('id', id);

  if (error) {
    alert('❌ 刪除失敗: ' + error.message);
  } else {
    menuData = menuData.filter(m => m.id !== id);
    alert('✅ 菜品已成功刪除！');
    fetchAdminMenu();
    renderMenu();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  fetchMenu();
  checkUrlAdminParam();
  loadStoreSettings();
  updateBusinessStatusBar();
  setInterval(updateBusinessStatusBar, 60000);
});

function openDishDetailModal(id) {
  const item = menuData.find(i => i.id === id);
  if (!item) return;

  const modal = document.getElementById('dish-detail-modal');
  const imgContainer = document.getElementById('detail-modal-img-container');
  const nameFr = document.getElementById('detail-modal-name-fr');
  const nameZh = document.getElementById('detail-modal-name-zh');
  const priceElem = document.getElementById('detail-modal-price');
  const stockElem = document.getElementById('detail-modal-stock');
  const addBtn = document.getElementById('detail-modal-add-btn');

  if (item.image_url) {
    imgContainer.innerHTML = `<img src="${escapeHtml(item.image_url)}" class="w-full h-full object-cover">`;
  } else {
    imgContainer.innerHTML = `<div class="text-4xl text-orange-400 font-bold">🍲</div>`;
  }

  nameFr.innerText = item.name_fr || '';
  nameZh.innerText = item.name_zh || '';
  priceElem.innerText = (item.price || 0).toFixed(2) + ' €';
  
  const maxStock = (typeof item.stock === 'number') ? item.stock : 99;
  const isAvailable = (item.is_available !== false) && (maxStock > 0);

  stockElem.innerText = `Stock: ${maxStock}`;

  if (isAvailable) {
    addBtn.disabled = false;
    addBtn.className = "w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl text-sm shadow transition active:scale-95";
    addBtn.innerText = "Ajouter au panier / 加入購物車 🛒";
    addBtn.onclick = () => {
      updateCart(item.id, 1);
      closeDishDetailModal();
    };
  } else {
    addBtn.disabled = true;
    addBtn.className = "w-full bg-gray-300 text-gray-500 font-bold py-3 rounded-xl text-sm cursor-not-allowed";
    addBtn.innerText = "Épuisé / 已售罄";
  }

  modal.classList.remove('hidden');
}

function closeDishDetailModal() {
  const modal = document.getElementById('dish-detail-modal');
  if (modal) modal.classList.add('hidden');
}

async function deleteOrderFromSupabase(orderId) {
  const customerName = (rawOrders.find(o => o.id == orderId) || {}).customer_name || '';
  const confirmDelete = confirm(`⚠️ Supprimer définitivement la commande de "${customerName}" ?\n\n確定要永久刪除來自「${customerName}」的這筆訂單嗎？`);
  
  if (!confirmDelete) return;

  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .delete()
      .eq('id', orderId)
      .select();

    if (error) {
      alert('❌ 刪除失敗: ' + error.message);
    } else {
      alert('✅ 訂單已成功永久刪除！');
      fetchOrders();
    }
  } catch (err) {
    alert('❌ 系統異常: ' + err.message);
  }
}

function generateWhatsAppLink(orderData, orderId) {
  const phone = String(STORE_CONFIG.whatsappNumber || '').replace(/[^0-9]/g, '');
  const itemsText = orderData.items.map(item => `- ${item.name} x${item.quantity} (€${(item.price * item.quantity).toFixed(2)})`).join('\n');
  
  const message = `Bonjour ${STORE_CONFIG.storeName} ! 👋
J'ai passé une commande sur votre site.
----------------------------------
🧾 訂單號 / Order ID: #${orderId}
👤 姓名 / Nom: ${orderData.customer_name}
📞 電話 / Tél: ${orderData.customer_phone}
📍 地址/備註: ${orderData.delivery_address || '到店自取 / Click & Collect'}

🛍️ 訂單明細 / Détails:
${itemsText}

💰 總金額 / Total: €${orderData.total_price.toFixed(2)}
----------------------------------
Veuillez me confirmer la commande pour lancer la préparation, merci ! 🙏`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function showWhatsAppModal(whatsappUrl, dbId, orderCode) {
  const existingModal = document.getElementById('whatsapp-modal');
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div id="whatsapp-modal" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div class="bg-white rounded-2xl max-w-md w-full p-6 text-center shadow-2xl transform transition-all">
        <div class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          📱
        </div>
        <h3 class="text-xl font-bold text-gray-800 mb-2">🎉 下單成功！Commande envoyée !</h3>
        <p class="text-xs text-gray-500 mb-4">訂單編號 / N°: #${escapeHtml(orderCode || String(dbId).slice(0, 8))}</p>
        
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-left text-sm text-amber-800">
          ⚠️ <strong>提醒 / Attention :</strong><br>
          請點擊下方按鈕，發送 WhatsApp 訊息給店家確認訂單，店家收到後才會開始製作哦！<br>
          <span class="text-xs text-amber-600">Veuillez envoyer un message WhatsApp pour valider la commande.</span>
        </div>

        <a href="${escapeHtml(whatsappUrl)}" target="_blank" onclick="markWhatsappClicked('${escapeHtml(dbId)}')"
           class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg flex items-center justify-center space-x-2 transition duration-200 mb-3 text-lg">
          <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
          </svg>
          <span>一鍵開啟 WhatsApp 發送確認</span>
        </a>

        <button onclick="document.getElementById('whatsapp-modal').remove()" class="text-xs text-gray-400 hover:text-gray-600 mt-2 underline">
          關閉視窗 / Fermer
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function markWhatsappClicked(orderId) {
  playWhatsappClickSound();

  if (!orderId) return;
  try {
    await supabaseClient.rpc('mark_whatsapp_sent', { p_id: String(orderId) });
  } catch (e) {
    console.error('更新 WhatsApp 點擊狀態失敗:', e);
  }
}

async function loadStoreSettings() {
  try {
    const { data, error } = await supabaseClient
      .from('store_settings')
      .select('whatsapp_number, store_name, store_slogan, store_hours_text, business_mode, manual_open, allowed_days')
      .eq('id', 1)
      .single();

    if (data) {
      if (data.whatsapp_number) {
        STORE_CONFIG.whatsappNumber = data.whatsapp_number;
        const inputEl = document.getElementById('setting-whatsapp-input');
        if (inputEl) inputEl.value = STORE_CONFIG.whatsappNumber;
      }

      if (data.store_name) {
        STORE_CONFIG.storeName = data.store_name;
        const nameInput = document.getElementById('setting-store-name-input');
        if (nameInput) nameInput.value = STORE_CONFIG.storeName;
        const titleEl = document.getElementById('store-title-text');
        if (titleEl) titleEl.innerText = STORE_CONFIG.storeName;
      }

      if (data.store_slogan) {
        STORE_CONFIG.storeSlogan = data.store_slogan;
        const sloganInput = document.getElementById('setting-store-slogan-input');
        if (sloganInput) sloganInput.value = STORE_CONFIG.storeSlogan;
        const sloganEl = document.getElementById('store-slogan-text');
        if (sloganEl) sloganEl.innerText = STORE_CONFIG.storeSlogan;
      }

      if (data.store_hours_text) {
        STORE_CONFIG.storeHoursText = data.store_hours_text;
        const hoursInput = document.getElementById('setting-hours-text-input');
        if (hoursInput) hoursInput.value = STORE_CONFIG.storeHoursText;
        const hoursEl = document.getElementById('store-hours-text');
        if (hoursEl) hoursEl.innerText = STORE_CONFIG.storeHoursText;
      }

      if (data.business_mode) {
        STORE_CONFIG.businessMode = data.business_mode;
        const modeSelect = document.getElementById('setting-business-mode-select');
        if (modeSelect) modeSelect.value = STORE_CONFIG.businessMode;
      }

      if (typeof data.manual_open === 'boolean') {
        STORE_CONFIG.manualOpen = data.manual_open;
        const manualSelect = document.getElementById('setting-manual-open-select');
        if (manualSelect) manualSelect.value = STORE_CONFIG.manualOpen ? "true" : "false";
      }

      if (Array.isArray(data.allowed_days)) {
        STORE_CONFIG.allowedDays = data.allowed_days;
        document.querySelectorAll('.day-checkbox').forEach(chk => {
          chk.checked = STORE_CONFIG.allowedDays.includes(parseInt(chk.value, 10));
        });
      }

      toggleManualOpenOption();
      updateBusinessStatusBar();
    }
  } catch (err) {
    console.error("載入設定失敗:", err);
  }
}

async function saveWhatsAppNumber() {
  const inputEl = document.getElementById('setting-whatsapp-input');
  const statusEl = document.getElementById('whatsapp-save-status');
  if (!inputEl) return;

  const newNumber = inputEl.value.trim().replace(/[^0-9]/g, '');
  if (!newNumber) {
    alert("請輸入有效的電話號碼！");
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('store_settings')
      .update({ whatsapp_number: newNumber, updated_at: new Date() })
      .eq('id', 1);

    if (error) throw error;

    STORE_CONFIG.whatsappNumber = newNumber;

    if (statusEl) {
      statusEl.innerText = "✅ WhatsApp 接收號碼已成功更新！";
      statusEl.className = "text-sm mt-2 text-green-600 font-medium block";
      setTimeout(() => { statusEl.className = "text-sm mt-2 hidden"; }, 3000);
    }
  } catch (err) {
    console.error("儲存失敗:", err);
    if (statusEl) {
      statusEl.innerText = "❌ 儲存失敗";
      statusEl.className = "text-sm mt-2 text-red-600 font-medium block";
    }
  }
}

async function saveStoreInfo() {
  const nameInput = document.getElementById('setting-store-name-input');
  const sloganInput = document.getElementById('setting-store-slogan-input');
  const statusEl = document.getElementById('store-info-save-status');

  if (!nameInput || !sloganInput) return;

  const newName = nameInput.value.trim() || "Cici Cuisine";
  const newSlogan = sloganInput.value.trim() || "🕒 Livraison | 配送";

  try {
    const { error } = await supabaseClient
      .from('store_settings')
      .update({ 
        store_name: newName, 
        store_slogan: newSlogan, 
        updated_at: new Date() 
      })
      .eq('id', 1);

    if (error) throw error;

    STORE_CONFIG.storeName = newName;
    STORE_CONFIG.storeSlogan = newSlogan;

    const titleEl = document.getElementById('store-title-text');
    if (titleEl) titleEl.innerText = newName;

    const sloganEl = document.getElementById('store-slogan-text');
    if (sloganEl) sloganEl.innerText = newSlogan;

    if (statusEl) {
      statusEl.innerText = "✅ 店鋪資訊已成功更新！";
      statusEl.className = "text-xs mt-1 text-green-600 font-bold block text-center";
      setTimeout(() => { statusEl.className = "text-xs mt-1 hidden text-center"; }, 3000);
    }
  } catch (err) {
    console.error("儲存失敗:", err);
    if (statusEl) {
      statusEl.innerText = "❌ 儲存失敗";
      statusEl.className = "text-xs mt-1 text-red-600 font-bold block text-center";
    }
  }
}

function toggleManualOpenOption() {
  const modeSelect = document.getElementById('setting-business-mode-select');
  const container = document.getElementById('manual-open-container');
  if (!modeSelect || !container) return;

  if (modeSelect.value === 'manual') {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

async function saveBusinessHoursInfo() {
  const hoursInput = document.getElementById('setting-hours-text-input');
  const modeSelect = document.getElementById('setting-business-mode-select');
  const manualSelect = document.getElementById('setting-manual-open-select');
  const statusEl = document.getElementById('business-hours-save-status');

  const checkboxes = document.querySelectorAll('.day-checkbox:checked');
  const selectedDays = Array.from(checkboxes).map(chk => parseInt(chk.value, 10));

  if (!hoursInput || !modeSelect || !manualSelect) return;

  const newHoursText = hoursInput.value.trim() || "🕒 13:00 - 10:00 (Lundi - Dimanche)";
  const newMode = modeSelect.value;
  const newManualOpen = manualSelect.value === 'true';

  try {
    const { error } = await supabaseClient
      .from('store_settings')
      .update({ 
        store_hours_text: newHoursText, 
        business_mode: newMode, 
        manual_open: newManualOpen,
        allowed_days: selectedDays,
        updated_at: new Date() 
      })
      .eq('id', 1);

    if (error) throw error;

    STORE_CONFIG.storeHoursText = newHoursText;
    STORE_CONFIG.businessMode = newMode;
    STORE_CONFIG.manualOpen = newManualOpen;
    STORE_CONFIG.allowedDays = selectedDays;

    const hoursEl = document.getElementById('store-hours-text');
    if (hoursEl) hoursEl.innerText = newHoursText;

    updateBusinessStatusBar();

    if (statusEl) {
      statusEl.innerText = "✅ 營業與送餐日設定已成功更新！";
      statusEl.className = "text-xs mt-1 text-green-600 font-bold block text-center";
      setTimeout(() => { statusEl.className = "text-xs mt-1 hidden text-center"; }, 3000);
    }
  } catch (err) {
    console.error("儲存失敗:", err);
    if (statusEl) {
      statusEl.innerText = "❌ 儲存失敗";
      statusEl.className = "text-xs mt-1 text-red-600 font-bold block text-center";
    }
  }
}

function toggleFulfillmentMode() {
  const modeSelect = document.getElementById('cust-fulfillment');
  const addressContainer = document.getElementById('address-container');
  const addressInput = document.getElementById('cust-address');
  
  if (!modeSelect || !addressContainer) return;
  const mode = modeSelect.value;

  if (mode === 'pickup') {
    addressContainer.style.display = 'none';
    if (addressInput) addressInput.value = '到店自取 (Click & Collect)';
  } else {
    addressContainer.style.display = 'block';
    if (addressInput && addressInput.value.includes('到店自取')) {
      addressInput.value = '';
    }
  }
}

// 📧 透過 Supabase Auth 發送密碼重設郵件給目前登入的管理員
async function sendPasswordResetEmail() {
  const statusEl = document.getElementById('reset-password-status');
  
  try {
    // 取得當前已登入的使用者資訊
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user || !user.email) {
      alert("❌ 無法取得當前登入的管理員信箱，請重新登入後再試！");
      return;
    }

    const adminEmail = user.email;
    
    // 呼叫 Supabase 官方內建的發送重設密碼郵件 API
    // 註冊時填寫的網址會作為重設後的跳轉頁面（這裡預設帶入當前網頁網址）
    const { error } = await supabaseClient.auth.resetPasswordForEmail(adminEmail, {
      redirectTo: window.location.href.split('?')[0], // 自動對應回目前網站首頁
    });

    if (error) throw error;

    if (statusEl) {
      statusEl.innerText = `✅ 重設密碼信件已成功發送至：${adminEmail}，請檢查收件匣！`;
      statusEl.className = "text-xs mt-2 text-green-600 font-bold block text-center";
      setTimeout(() => { statusEl.className = "text-xs mt-2 hidden text-center"; }, 6000);
    }
  } catch (err) {
    console.error("發送重設郵件失敗:", err);
    if (statusEl) {
      statusEl.innerText = "❌ 發送失敗: " + err.message;
      statusEl.className = "text-xs mt-2 text-red-600 font-bold block text-center";
    }
  }
}

// 🔍 網頁載入時自動檢查網址是否為 Supabase 的重設密碼回調 (Recovery Mode)
window.addEventListener('DOMContentLoaded', () => {
  // 檢查網址的 hash 或 query 是否包含 type=recovery 或是 access_token
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const queryParams = new URLSearchParams(window.location.search);
  
  if (hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery') {
    // 彈出重設密碼專用視窗
    const resetModal = document.getElementById('reset-password-modal');
    if (resetModal) {
      resetModal.classList.remove('hidden');
    }
  }
});

// 🔐 提交並儲存老闆透過信件點進來後輸入的新密碼
async function submitNewPassword() {
  const newPassInput = document.getElementById('new-recovery-password');
  if (!newPassInput) return;
  
  const newPassword = newPassInput.value.trim();
  if (!newPassword || newPassword.length < 6) {
    alert("❌ 密碼長度至少需要 6 個字元！\nLe mot de passe doit contenir au moins 6 caractères.");
    return;
  }

  try {
    // 透過 Supabase 更新當前被 recovery token 認證的使用者密碼
    const { error } = await supabaseClient.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;

    alert("✅ 密碼已成功更新！請使用新密碼重新登入後台。\nMot de passe mis à jour avec succès !");
    
    // 關閉彈窗
    const resetModal = document.getElementById('reset-password-modal');
    if (resetModal) resetModal.classList.add('hidden');

    // 清除網址上的 token 尾巴，導回乾淨的首頁
    window.location.href = window.location.href.split('#')[0].split('?')[0];

  } catch (err) {
    console.error("更新密碼失敗:", err);
    alert("❌ 更新失敗: " + err.message);
  }
}

async function adminLogout() {
  const confirmLogout = confirm("⚠️ 確定要登出管理員帳號嗎？\n確定後下次進入後台需要重新輸入密碼。");
  if (!confirmLogout) return;

  await supabaseClient.auth.signOut();
  isAdminLoggedIn = false;
  
  // 隱藏後台、回到前台
  document.getElementById('admin-view').classList.add('hidden');
  document.getElementById('customer-view').classList.remove('hidden');
  
  alert("✅ 已成功登出！");
}
