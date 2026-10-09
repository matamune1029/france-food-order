const SUPABASE_URL = 'https://zcivplddxtaqlefrtajr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eQG7FVgOU36Z8edfnrf27w_5A7tlNiq';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cart = {};
let menuData = [];
let rawOrders = []; // 快取原始訂單數據
let currentCategory = 'Specialite';
let currentOrderTab = 'all'; // 訂單篩選標籤: 'all', 'today', 'tomorrow'
let lastOrderDetails = null;

// 1. 標準分類標籤清單
const fixedCategories = [
  { key: 'Specialite', fr: 'Spécialité', zh: '每日特色' },
  { key: 'Viandes', fr: 'Viandes', zh: '葷菜' },
  { key: 'Seafood', fr: 'Poissons/Mer', zh: '海鮮類' },
  { key: 'Beef', fr: 'Bœuf', zh: '牛肉類' },
  { key: 'Legumes', fr: 'Légumes', zh: '素菜' },
  { key: 'Staple', fr: 'Riz/Nouilles', zh: '主食' }
];

// 2. 歸一化匹配邏輯
function normalizeCategory(rawCat, nameZh = '', nameFr = '') {
  const cat = (rawCat || '').toString().toLowerCase().trim();
  const zh = (nameZh || '').toString().toLowerCase();
  const fr = (nameFr || '').toString().toLowerCase();

  if (cat.includes('特色') || cat.includes('每日') || cat.includes('spécialité') || cat.includes('specialite') || cat.includes('special')) {
    return 'Specialite';
  }
  if (cat.includes('海鮮') || cat.includes('海鲜') || cat.includes('魚') || cat.includes('鱼') || cat.includes('蝦') || cat.includes('虾') || 
      cat.includes('poisson') || cat.includes('crevette') || cat.includes('mer') || zh.includes('魚') || zh.includes('鱼') || zh.includes('蝦')) {
    return 'Seafood';
  }
  if (cat.includes('牛肉') || cat.includes('牛') || cat.includes('bœuf') || cat.includes('boeuf') || cat.includes('beef') || zh.includes('牛')) {
    return 'Beef';
  }
  if (cat.includes('素') || cat.includes('légume') || cat.includes('legume')) {
    return 'Legumes';
  }
  if (cat.includes('主食') || cat.includes('riz') || cat.includes('nouille') || cat.includes('rice') || cat.includes('noodle')) {
    return 'Staple';
  }
  return 'Viandes';
}

// 3. 載入所有菜單
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

// 4. 渲染左側分類側邊欄
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

// 5. 渲染前台菜單列表
function renderMenu() {
  const container = document.getElementById('menu-container');
  if (!container) return;

  let listToDisplay = menuData.filter(i => {
    return normalizeCategory(i.category, i.name_zh, i.name_fr) === currentCategory;
  });

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
      ? `<img src="${item.image_url}" class="w-16 h-16 rounded-lg object-cover flex-shrink-0" alt="${item.name_zh}">`
      : `<div class="w-16 h-16 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-400 font-bold text-xs flex-shrink-0">🍲</div>`;

    return `
      <div class="bg-white p-3 rounded-xl shadow-sm flex items-center gap-3 border border-gray-100 ${!isAvailable ? 'opacity-50 grayscale' : ''}">
        ${imgHtml}
        <div class="flex-1 min-w-0">
          <div class="font-bold text-gray-800 text-sm leading-snug truncate">
            ${item.name_fr || ''}
            ${!isAvailable ? '<span class="ml-1 text-[10px] bg-gray-200 text-gray-600 px-1 py-0.5 rounded font-normal">Épuisé</span>' : ''}
          </div>
          <div class="text-xs text-gray-500 font-normal mt-0.5 truncate">${item.name_zh || ''}</div>
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

// 6. 更新購物車
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

// 7. 彈窗與結算邏輯
function openCheckoutModal() {
  if (Object.keys(cart).length === 0) return alert('Votre panier est vide ! / 購物車是空的！');
  document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.add('hidden');
}

async function submitOrder() {
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
    if (!frPhoneRegex.test(cleanPhone)) {
      return alert('Veuillez entrer un numéro de téléphone français valide (ex: 0612345678) ! / 請填寫有效的法國手機號碼！');
    }

    if (!address) return alert('Veuillez entrer votre adresse de livraison ! / 請填寫送餐地址！');

    const items = Object.keys(cart).map(id => {
      const item = menuData.find(i => i.id === id);
      return { 
        id,
        name_fr: item ? item.name_fr : 'Plat', 
        name_zh: item ? item.name_zh : '菜品', 
        qty: cart[id], 
        price: item ? item.price : 0 
      };
    });
    
    const total = parseFloat(document.getElementById('total-price').innerText);
    const orderId = 'CC-' + Date.now().toString().slice(-6);
    const deliverySlot = `${dateSelect} - ${timeSelect}`;

    const fullContactInfo = `[${deliverySlot}] ${phone} | Adresse: ${address}${note ? ' | Note: ' + note : ''}`;
    const dbItems = items.map(i => ({ name: `${i.name_fr} (${i.name_zh})`, qty: i.qty, price: i.price }));

    const { error } = await supabaseClient.from('orders').insert([
      { customer_name: name, phone: fullContactInfo, items: dbItems, total_price: total }
    ]);

    if (error) {
      console.error('Supabase Error:', error);
      alert('Échec / 數據庫寫入錯誤: ' + error.message);
      return;
    }

    // 自動扣減庫存
    for (let cartItem of items) {
      const targetDish = menuData.find(m => m.id === cartItem.id);
      if (targetDish) {
        const currentStock = (typeof targetDish.stock === 'number') ? targetDish.stock : 99;
        const newStock = Math.max(0, currentStock - cartItem.qty);
        const newAvailable = newStock > 0 ? (targetDish.is_available !== false) : false;

        await supabaseClient
          .from('menu_items')
          .update({ stock: newStock, is_available: newAvailable })
          .eq('id', cartItem.id);

        targetDish.stock = newStock;
        targetDish.is_available = newAvailable;
      }
    }

    lastOrderDetails = { orderId, deliverySlot, name, phone, address, note, items, total };

    cart = {};
    closeCheckoutModal();
    showReceiptModal(lastOrderDetails);

  } catch (err) {
    console.error('Submission Error:', err);
    alert('Erreur / 提交過程發生錯誤: ' + err.message);
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
      <span>${i.name_fr} (${i.name_zh}) x${i.qty}</span>
      <span class="font-bold">${(i.price * i.qty).toFixed(2)} €</span>
    </li>
  `).join('');

  document.getElementById('receipt-modal').classList.remove('hidden');
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

// 8. 後台管理與暗號
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

function toggleMode(forceCheck = false) {
  const adminView = document.getElementById('admin-view');
  const customerView = document.getElementById('customer-view');

  if ((adminView.classList.contains('hidden') || forceCheck) && !isAdminLoggedIn) {
    const password = prompt("🔐 Mot de passe Admin / 請輸入群主管理密碼：");
    if (password !== "8888") {
      return alert("❌ Mot de passe incorrect / 密碼錯誤！");
    }
    isAdminLoggedIn = true;
  }

  adminView.classList.toggle('hidden');
  customerView.classList.toggle('hidden');

  if (!adminView.classList.contains('hidden')) {
    fetchOrders();
  }
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
  const ordersBtn = document.getElementById('tab-orders-btn');
  const menuBtn = document.getElementById('tab-menu-btn');

  if (tab === 'orders') {
    ordersTab.classList.remove('hidden');
    menuTab.classList.add('hidden');
    ordersBtn.className = "flex-1 py-2 rounded-lg bg-white shadow text-gray-800 transition";
    menuBtn.className = "flex-1 py-2 rounded-lg text-gray-500 transition";
    fetchOrders();
  } else {
    ordersTab.classList.add('hidden');
    menuTab.classList.remove('hidden');
    menuBtn.className = "flex-1 py-2 rounded-lg bg-white shadow text-gray-800 transition";
    ordersBtn.className = "flex-1 py-2 rounded-lg text-gray-500 transition";
    fetchAdminMenu();
  }
}

// ----------------------------------------------------
// 🌟 高階訂單管理邏輯：搜尋、日期切頁、對帳與複製小票
// ----------------------------------------------------

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
      console.error('Fetch Orders Error:', error);
      container.innerHTML = `<div class="text-red-500 text-xs text-center py-4">讀取失敗: ${error.message}</div>`;
      return;
    }

    rawOrders = data || [];
    applyOrderFilters();

  } catch (err) {
    console.error('Unexpected Error:', err);
    container.innerHTML = `<div class="text-red-500 text-xs text-center py-4">系統異常: ${err.message}</div>`;
  }
}

// 切換訂單日期快捷 Tab (全部 / 今天 / 明天)
function filterOrderTab(tabKey) {
  currentOrderTab = tabKey;

  const btnAll = document.getElementById('order-filter-all');
  const btnToday = document.getElementById('order-filter-today');
  const btnTomorrow = document.getElementById('order-filter-tomorrow');
  const datePicker = document.getElementById('order-date-picker');

  // 清空自訂 Date Picker
  if (datePicker) datePicker.value = '';

  const activeClass = "flex-1 py-1.5 rounded-lg bg-white text-green-700 shadow-sm transition font-bold";
  const inactiveClass = "flex-1 py-1.5 rounded-lg text-gray-500 transition font-normal";

  if (btnAll) btnAll.className = tabKey === 'all' ? activeClass : inactiveClass;
  if (btnToday) btnToday.className = tabKey === 'today' ? activeClass : inactiveClass;
  if (btnTomorrow) btnTomorrow.className = tabKey === 'tomorrow' ? activeClass : inactiveClass;

  applyOrderFilters();
}

// 執行搜尋與綜合過濾
function applyOrderFilters() {
  const container = document.getElementById('order-list');
  if (!container) return;

  const searchKeyword = (document.getElementById('order-search-input')?.value || '').toLowerCase().trim();
  const datePickerVal = document.getElementById('order-date-picker')?.value;

  let filtered = [...rawOrders];

  // 1. 按快捷 Tab 或 Date Picker 篩選
  if (datePickerVal) {
    // 使用者手動選了特定日期 (如 2026-03-20)
    filtered = filtered.filter(o => {
      if (!o.created_at) return false;
      const orderDateStr = new Date(o.created_at).toISOString().split('T')[0];
      return orderDateStr === datePickerVal;
    });
  } else if (currentOrderTab === 'today') {
    filtered = filtered.filter(o => {
      const phoneStr = (o.phone || '').toLowerCase();
      return phoneStr.includes('aujourd') || phoneStr.includes('當天') || phoneStr.includes('当天');
    });
  } else if (currentOrderTab === 'tomorrow') {
    filtered = filtered.filter(o => {
      const phoneStr = (o.phone || '').toLowerCase();
      return phoneStr.includes('demain') || phoneStr.includes('明天');
    });
  }

  // 2. 按搜尋關鍵字過濾 (姓名 / 電話 / 地址 / 餐點)
  if (searchKeyword) {
    filtered = filtered.filter(o => {
      const nameMatch = (o.customer_name || '').toLowerCase().includes(searchKeyword);
      const phoneMatch = (o.phone || '').toLowerCase().includes(searchKeyword);
      const itemMatch = Array.isArray(o.items) && o.items.some(i => (i.name || '').toLowerCase().includes(searchKeyword));
      return nameMatch || phoneMatch || itemMatch;
    });
  }

  // 3. 更新對帳與統計數字
  const totalMoney = filtered.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
  const moneyElem = document.getElementById('stat-total-money');
  const countElem = document.getElementById('stat-order-count');
  if (moneyElem) moneyElem.innerText = totalMoney.toFixed(2);
  if (countElem) countElem.innerText = filtered.length;

  // 4. 渲染訂單列表
  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-gray-400 text-xs text-center py-6">Aucune commande trouvée / 查無符合條件的訂單</div>';
    return;
  }

  container.innerHTML = filtered.map(o => {
    const createdTimeStr = o.created_at ? new Date(o.created_at).toLocaleString() : '';
    const itemsList = Array.isArray(o.items) 
      ? o.items.map(i => `<li class="flex justify-between"><span>${i.name || '菜品'}</span><span class="font-bold">x${i.qty || 1}</span></li>`).join('')
      : '<li class="text-gray-400">無明細</li>';

    return `
      <div class="bg-white p-3.5 rounded-xl border-l-4 border-orange-500 shadow-sm space-y-2 relative">
        <div class="flex justify-between items-start font-bold text-gray-800">
          <div>
            <span class="text-sm">👤 ${o.customer_name || '匿名顧客'}</span>
            <div class="text-[10px] text-gray-400 font-normal mt-0.5">${createdTimeStr}</div>
          </div>
          <span class="text-green-600 text-base font-black">${(o.total_price || 0).toFixed(2)} €</span>
        </div>

        <div class="text-xs font-medium text-orange-700 bg-orange-50 p-2 rounded-lg border border-orange-100 break-all leading-relaxed">
          📍 ${o.phone || '無聯繫資訊'}
        </div>

        <ul class="text-xs bg-gray-50 p-2.5 rounded-lg border space-y-1 text-gray-700">
          ${itemsList}
        </ul>

        <div class="flex justify-end gap-2 pt-1 border-t">
          <button type="button" onclick="copyOrderForDriver('${o.customer_name}', '${o.phone}', '${o.total_price}')" class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] px-2.5 py-1 rounded-md font-bold transition">
            📋 複製派送資訊
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// 複製給司機/外賣員的便條
function copyOrderForDriver(name, contactInfo, total) {
  const text = `🛵 【外賣派送憑證】\n👤 客戶: ${name}\n📍 聯繫/地址: ${contactInfo}\n💰 應收金額: ${total} €`;
  navigator.clipboard.writeText(text).then(() => {
    alert('📋 已成功複製派送資訊！可以貼給司機或外賣員。');
  }).catch(() => {
    alert('複製失敗，請手動複製。');
  });
}

// 渲染後台菜單列表
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
      ? `<img src="${item.image_url}" class="w-10 h-10 rounded object-cover mr-2 flex-shrink-0">`
      : `<div class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400 mr-2 flex-shrink-0">🍲</div>`;

    htmlContent += `
      <div class="bg-white p-2.5 rounded-xl border flex justify-between items-center shadow-sm hover:border-gray-300 transition">
        <div class="flex items-center flex-1 pr-2 min-w-0">
          ${imgThumb}
          <div class="min-w-0 flex-1">
            <div class="font-bold text-gray-800 text-xs truncate">
              <span class="bg-gray-100 text-gray-600 px-1 py-0.5 rounded mr-1 font-mono">#${item.sort_order || 99}</span>
              ${item.name_fr || ''} (${item.name_zh || ''})
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
          <button type="button" onclick="deleteDish(event, '${item.id}', '${item.name_zh}')" class="bg-red-100 text-red-600 px-2 py-1 rounded text-[10px] font-bold hover:bg-red-200">
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
        ? `<img src="${item.image_url}" class="w-full h-full object-cover">`
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

async function deleteDish(event, id, nameZh) {
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
});
