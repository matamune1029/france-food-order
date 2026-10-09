const SUPABASE_URL = 'https://zcivplddxtaqlefrtajr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eQG7FVgOU36Z8edfnrf27w_5A7tlNiq';

let supabaseClient = null;
let cart = {};
let menuData = [];
let currentCategory = 'Specialite'; // 預設停留在“每日特色”
let lastOrderDetails = null;

// 安全初始化 Supabase
function initSupabase() {
  if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  }
  return false;
}

// 1. 標準分類標籤清單（6 個獨立大類）
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
  const container = document.getElementById('menu-container');

  if (!initSupabase()) {
    if (container) {
      container.innerHTML = '<div class="text-center text-red-500 py-10 font-bold">Erreur SDK / Supabase 腳本下載失敗，請刷新頁面</div>';
    }
    return;
  }

  try {
    const { data, error } = await supabaseClient.from('menu_items').select('*');
    
    if (error) {
      console.error('Menu Fetch Error:', error);
      if (container) container.innerHTML = `<div class="text-center text-red-500 py-10 font-bold">Erreur DB / 數據庫讀取失敗: ${error.message}</div>`;
      return;
    }

    menuData = data || [];
    renderCategoryBar();
    renderMenu();
  } catch (err) {
    console.error('Fetch Menu Failure:', err);
    if (container) container.innerHTML = `<div class="text-center text-red-500 py-10 font-bold">Erreur System / 系統異常: ${err.message}</div>`;
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

  // 排序：有庫存且上架在上，售罄沉底
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

    return `
      <div class="bg-white p-3 rounded-xl shadow-sm flex justify-between items-center border border-gray-100 ${!isAvailable ? 'opacity-50 grayscale' : ''}">
        <div class="flex-1 pr-2">
          <div class="font-bold text-gray-800 text-sm leading-snug">
            ${item.name_fr \vert{}\vert{} ''}${!isAvailable ? '<span class="ml-2 text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-normal">Épuisé / 已售罄</span>' : ''}
          </div>
          <div class="text-xs text-gray-500 font-normal mt-1">${item.name_zh || ''}</div>
          <div class="flex items-center gap-2 mt-1.5">
            <span class="text-green-600 font-extrabold text-base">${item.price \vert{}\vert{} 0} €</span>${isAvailable && maxStock < 50 ? `<span class="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">Reste: ${maxStock}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2">
          ${currentCartQty > 0 ? `
            <button type="button" onclick="updateCart('${item.id}', -1)" class="w-7 h-7 bg-gray-100 text-gray-700 rounded-full font-bold flex items-center justify-center active:scale-90">-</button>
            <span class="text-sm font-bold w-4 text-center">${currentCartQty}</span>
          ` : ''}
          <button type="button" 
            ${(!isAvailable || isMaxReached) ? 'disabled' : `onclick="updateCart('${item.id}', 1)"`} 
            class="w-7 h-7 ${isAvailable && !isMaxReached ? 'bg-green-500 text-white shadow-md active:scale-90' : 'bg-gray-300 text-gray-400 cursor-not-allowed'} rounded-full font-bold flex items-center justify-center">
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
    const deliverySlot = `${dateSelect} -${timeSelect}`;

    const fullContactInfo = `[${deliverySlot}]${phone} | Adresse: ${address}${note ? ' | Note: ' + note : ''}`;
    const dbItems = items.map(i => ({ name: `${i.name_fr} (${i.name_zh})`, qty: i.qty, price: i.price }));

    const { error } = await supabaseClient.from('orders').insert([
      { customer_name: name, phone: fullContactInfo, items: dbItems, total_price: total }
    ]);

    if (error) {
      console.error('Supabase Error:', error);
      alert('Échec / 數據庫寫入錯誤: ' + error.message);
      return;
    }

    // 自動扣減 Supabase 菜品庫存 stock
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

async function fetchOrders() {
  const container = document.getElementById('order-list');
  if (!container) return;

  container.innerHTML = '<div class="text-gray-400 text-xs text-center py-4">Chargement... / 讀取中...</div>';

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

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="text-gray-400 text-xs text-center py-4">Aucune commande / 暫無訂單</div>';
      return;
    }

    container.innerHTML = data.map(o => `
      <div class="bg-white p-3.5 rounded-xl border-l-4 border-orange-500 shadow-sm space-y-2">
        <div class="flex justify-between font-bold text-gray-800">
          <span>👤 ${o.customer_name || '匿名顧客'}</span>
          <span class="text-green-600 text-lg">${(o.total_price || 0).toFixed(2)} €</span>
        </div>
        <div class="text-xs font-bold text-orange-600 bg-orange-50 p-1.5 rounded border border-orange-100 break-all">
          📍 ${o.phone || '無聯繫資訊'}
        </div>
        <div class="text-[10px] text-gray-400">${o.created_at ? new Date(o.created_at).toLocaleString() : ''}</div>
        <ul class="text-xs bg-gray-50 p-2.5 rounded-lg border space-y-1">
          ${Array.isArray(o.items) ? o.items.map(i => `<li class="flex justify-between"><span>${i.name || '菜品'}</span><span class="font-bold">x${i.qty || 1}</span></li>`).join('') : '<li class="text-gray-400">無明細</li>'}
        </ul>
      </div>
    `).join('');

  } catch (err) {
    console.error('Unexpected Error:', err);
    container.innerHTML = `<div class="text-red-500 text-xs text-center py-4">系統異常: ${err.message}</div>`;
  }
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
        <div class="pt-3 pb-1 text-xs font-bold text-gray-500 border-b
