const SUPABASE_URL = 'https://zcivplddxtaqlefrtajr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eQG7FVgOU36Z8edfnrf27w_5A7tlNiq';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cart = {};
let menuData = [];
let currentCategory = 'Specialite'; // 默认停留在“每日特色”
let lastOrderDetails = null;

// 1. 标准分类标签清单（彻底移除“全部”，保留 6 个独立大类）
const fixedCategories = [
  { key: 'Specialite', fr: 'Spécialité', zh: '每日特色' },
  { key: 'Viandes', fr: 'Viandes', zh: '葷菜' },
  { key: 'Seafood', fr: 'Poissons/Mer', zh: '海鮮類' },
  { key: 'Beef', fr: 'Bœuf', zh: '牛肉類' },
  { key: 'Legumes', fr: 'Légumes', zh: '素菜' },
  { key: 'Staple', fr: 'Riz/Nouilles', zh: '主食' }
];

// 2. 归一化匹配逻辑
function normalizeCategory(rawCat, nameZh = '', nameFr = '') {
  const cat = (rawCat || '').toString().toLowerCase().trim();
  const zh = (nameZh || '').toString().toLowerCase();
  const fr = (nameFr || '').toString().toLowerCase();

  // 1. 每日特色
  if (cat.includes('特色') || cat.includes('每日') || cat.includes('spécialité') || cat.includes('specialite') || cat.includes('special')) {
    return 'Specialite';
  }

  // 2. 海鲜类
  if (cat.includes('海鮮') || cat.includes('海鲜') || cat.includes('魚') || cat.includes('鱼') || cat.includes('蝦') || cat.includes('虾') || 
      cat.includes('poisson') || cat.includes('crevette') || cat.includes('mer') || zh.includes('魚') || zh.includes('鱼') || zh.includes('蝦')) {
    return 'Seafood';
  }

  // 3. 牛肉类
  if (cat.includes('牛肉') || cat.includes('牛') || cat.includes('bœuf') || cat.includes('boeuf') || cat.includes('beef') || zh.includes('牛')) {
    return 'Beef';
  }

  // 4. 素菜
  if (cat.includes('素') || cat.includes('légume') || cat.includes('legume')) {
    return 'Legumes';
  }

  // 5. 主食
  if (cat.includes('主食') || cat.includes('riz') || cat.includes('nouille') || cat.includes('rice') || cat.includes('noodle')) {
    return 'Staple';
  }

  // 6. 默认归为 荤菜
  return 'Viandes';
}

// 3. 载入所有菜单
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

// 4. 渲染左侧分类侧边栏
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

// 5. 渲染前台菜品列表
function renderMenu() {
  const container = document.getElementById('menu-container');
  if (!container) return;

  // 根据当前选中的分类归一化过滤菜品
  let listToDisplay = menuData.filter(i => {
    return normalizeCategory(i.category, i.name_zh, i.name_fr) === currentCategory;
  });

  // 排序：上架在上（按 sort_order 升序），下架的自动沉底
  listToDisplay.sort((a, b) => {
    const availA = a.is_available !== false ? 1 : 0;
    const availB = b.is_available !== false ? 1 : 0;

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
    const isAvailable = item.is_available !== false;

    return `
      <div class="bg-white p-3 rounded-xl shadow-sm flex justify-between items-center border border-gray-100 ${!isAvailable ? 'opacity-50 grayscale' : ''}">
        <div class="flex-1 pr-2">
          <div class="font-bold text-gray-800 text-sm leading-snug">
            ${item.name_fr || ''}
            ${!isAvailable ? '<span class="ml-2 text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-normal">Épuisé / 已售罄</span>' : ''}
          </div>
          <div class="text-xs text-gray-500 font-normal mt-1">${item.name_zh || ''}</div>
          <div class="text-green-600 font-extrabold text-base mt-1.5">${item.price} €</div>
        </div>
        <div class="flex items-center gap-2">
          ${cart[item.id] ? `
            <button type="button" onclick="updateCart('${item.id}', -1)" class="w-7 h-7 bg-gray-100 text-gray-700 rounded-full font-bold flex items-center justify-center active:scale-90">-</button>
            <span class="text-sm font-bold w-4 text-center">${cart[item.id]}</span>
          ` : ''}
          <button type="button" 
            ${!isAvailable ? 'disabled' : `onclick="updateCart('${item.id}', 1)"`} 
            class="w-7 h-7 ${isAvailable ? 'bg-green-500 text-white shadow-md active:scale-90' : 'bg-gray-300 text-gray-500 cursor-not-allowed'} rounded-full font-bold flex items-center justify-center">
            +
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// 6. 更新购物车
function updateCart(id, delta) {
  cart[id] = (cart[id] || 0) + delta;
  if (cart[id] <= 0) delete cart[id];
  renderMenu();

  let total = 0;
  let count = 0;
  for (let itemId in cart) {
    const item = menuData.find(i => i.id === itemId);
    if (item) {
      total += item.price * cart[itemId];
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

// 7. 弹窗与结算逻辑
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

// 8. 后台管理与暗号
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
  const { data, error } = await supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
  
  if (error) {
    console.error('读取订单失败 Error:', error);
    alert('读取订单失败: ' + error.message); // 如果是 RLS 权限问题，这里会直接弹窗报错提示
    return;
  }

  const container = document.getElementById('order-list');
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="text-gray-400 text-xs text-center py-4">Aucune commande / 暂无订单</div>';
    return;
  }

  container.innerHTML = data.map(o => `
    <div class="bg-white p-3.5 rounded-xl border-l-4 border-orange-500 shadow-sm space-y-2">
      <div class="flex justify-between font-bold text-gray-800">
        <span>👤 ${o.customer_name}</span>
        <span class="text-green-600 text-lg">${o.total_price} €</span>
      </div>
      <div class="text-xs font-bold text-orange-600 bg-orange-50 p-1.5 rounded border border-orange-100">
        📍 配送与联系资讯: ${o.phone || 'N/A'}
      </div>
      <div class="text-[10px] text-gray-400">${o.created_at ? new Date(o.created_at).toLocaleString() : ''}</div>
      <ul class="text-xs bg-gray-50 p-2.5 rounded-lg border space-y-1">
        ${o.items ? o.items.map(i => `<li class="flex justify-between"><span>${i.name}</span><span class="font-bold">x${i.qty}</span></li>`).join('') : ''}
      </ul>
    </div>
  `).join('');
}

// 渲染后台菜单列表（按大类分组 + 同大类内按 sort_order 排序）
async function fetchAdminMenu() {
  const container = document.getElementById('admin-menu-list');
  if (!container) return;

  if (!menuData || menuData.length === 0) {
    const { data } = await supabaseClient.from('menu_items').select('*');
    if (data) menuData = data;
  }

  if (!menuData || menuData.length === 0) {
    container.innerHTML = '<div class="text-gray-400 text-xs text-center py-4">Aucun plat / 暂无菜品</div>';
    return;
  }

  // 定义后台大类排序权重
  const categoryPriority = {
    'Specialite': 1,
    'Viandes': 2,
    'Seafood': 3,
    'Beef': 4,
    'Legumes': 5,
    'Staple': 6
  };

  // 分类名称对照表（用于后台显示的分类标签）
  const categoryLabelMap = {
    'Specialite': '🌟 每日特色',
    'Viandes': '🥩 荤菜',
    'Seafood': '🐟 海鲜类',
    'Beef': '🐂 牛肉类',
    'Legumes': '🥬 素菜',
    'Staple': '🍚 主食'
  };

  // 1. 先按“大类顺序”排，2. 同大类内部按“sort_order”升序排
  menuData.sort((a, b) => {
    const catAKey = normalizeCategory(a.category, a.name_zh, a.name_fr);
    const catBKey = normalizeCategory(b.category, b.name_zh, b.name_fr);

    const priorityA = categoryPriority[catAKey] || 99;
    const priorityB = categoryPriority[catBKey] || 99;

    if (priorityA !== priorityB) {
      return priorityA - priorityB; // 大类排序
    }
    return (a.sort_order || 99) - (b.sort_order || 99); // 同大类内部按排序号升序
  });

  // 渲染列表并展示大类分割标签
  let lastCategoryKey = null;
  let htmlContent = '';

  menuData.forEach(item => {
    const isAvailable = item.is_available !== false;
    const normKey = normalizeCategory(item.category, item.name_zh, item.name_fr);

    // 当切换到下一个大类时，插入一个大类标题分割线
    if (normKey !== lastCategoryKey) {
      lastCategoryKey = normKey;
      htmlContent += `
        <div class="pt-3 pb-1 text-xs font-bold text-gray-500 border-b border-gray-200 flex items-center justify-between">
          <span>${categoryLabelMap[normKey] || '其他分类'}</span>
        </div>
      `;
    }

    htmlContent += `
      <div class="bg-white p-3 rounded-xl border flex justify-between items-center shadow-sm hover:border-gray-300 transition">
        <div class="flex-1 pr-2">
          <div class="font-bold text-gray-800 text-xs">
            <span class="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded mr-1 font-mono">#${item.sort_order || 99}</span>
            ${item.name_fr || ''} (${item.name_zh || ''})
          </div>
          <div class="text-green-600 font-extrabold text-xs mt-1">
            ${item.price} € 
            <span class="text-gray-400 font-normal text-[10px] ml-1">| ${item.category || '未归类'}</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <button type="button" onclick="toggleDishAvailability(event, '${item.id}', ${!isAvailable})" class="px-2 py-1 rounded text-[10px] font-bold transition ${isAvailable ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}">
            ${isAvailable ? 'En vente / 上架中' : 'Masqué / 已下架'}
          </button>
          <button type="button" onclick="openDishModal('${item.id}')" class="bg-orange-100 text-orange-600 px-2 py-1 rounded text-[10px] font-bold hover:bg-orange-200">
            Modifier / 编辑
          </button>
          <button type="button" onclick="deleteDish(event, '${item.id}', '${item.name_zh}')" class="bg-red-100 text-red-600 px-2 py-1 rounded text-[10px] font-bold hover:bg-red-200">
            Supprimer / 删除
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

  if (id) {
    const item = menuData.find(m => m.id === id);
    if (!item) return;
    title.innerText = 'Modifier le plat / 編輯菜品';
    document.getElementById('dish-id').value = item.id;
    document.getElementById('dish-name-fr').value = item.name_fr || '';
    document.getElementById('dish-name-zh').value = item.name_zh || '';
    document.getElementById('dish-price').value = item.price || '';
    if (sortInput) sortInput.value = item.sort_order || 1;
    
    // 下拉菜单匹配
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
  const sort_order = sortInput ? (parseInt(sortInput.value) || 1) : 1;
  const category = document.getElementById('dish-category').value;

  if (!name_fr || !name_zh || isNaN(price)) {
    return alert('Veuillez remplir tous les champs / 請完整填寫名稱與價格！');
  }

  const payload = { 
    name_fr, 
    name_zh, 
    price, 
    sort_order,
    category, 
    is_available: true 
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
