const SUPABASE_URL = 'https://zcivplddxtaqlefrtajr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eQG7FVgOU36Z8edfnrf27w_5A7tlNiq';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cart = {};
let menuData = [];
let currentCategory = 'ALL';
let lastOrderDetails = null;

// 分類標準化映射表（精準匹配資料庫中的中文分類）
const categoryMap = {
  'ALL': { fr: 'Tout', zh: '全部' },
  'Viandes': { fr: 'Viandes', zh: '葷菜' },
  '葷菜': { fr: 'Viandes', zh: '葷菜' },
  'Viandes / 葷菜': { fr: 'Viandes', zh: '葷菜' },
  'Poissons & Bœuf': { fr: 'Poissons/Bœuf', zh: '魚/牛肉類' },
  'Poissons/Bœuf': { fr: 'Poissons/Bœuf', zh: '魚/牛肉類' },
  '魚/牛肉類': { fr: 'Poissons/Bœuf', zh: '魚/牛肉類' },
  'Poissons & Bœuf / 魚牛肉類': { fr: 'Poissons/Bœuf', zh: '魚/牛肉類' },
  'Légumes': { fr: 'Légumes', zh: '素菜' },
  '素菜': { fr: 'Légumes', zh: '素菜' },
  'Légumes / 素菜': { fr: 'Légumes', zh: '素菜' },
  'Accompagnements': { fr: 'Riz/Nouilles', zh: '主食' },
  '主食': { fr: 'Riz/Nouilles', zh: '主食' },
  'Accompagnements / 主食': { fr: 'Riz/Nouilles', zh: '主食' }
};

// 1. 載入所有菜單（修復：移除資料庫不存在的 created_at 排序，避免 Supabase 報錯）
async function fetchMenu() {
  try {
    const { data, error } = await supabaseClient.from('menu_items').select('*');
    if (error) {
      console.error('Menu Fetch Error:', error);
    }
    menuData = data || [];
    renderCategoryBar();
    renderMenu();
  } catch (err) {
    console.error('Fetch Menu Failure:', err);
    const container = document.getElementById('menu-container');
    if (container) container.innerHTML = '<div class="text-center text-red-500 py-10">Erreur de chargement / 菜單載入失敗</div>';
  }
}

// 2. 渲染左側分類（標準化處理分類名稱）
// 標準分類清單（固定 5 個側邊欄選項，不再重複）
const fixedCategories = [
  { key: 'ALL', fr: 'Tout', zh: '全部' },
  { key: 'Viandes', fr: 'Viandes', zh: '葷菜', match: ['Viandes', '葷菜', 'Viandes / 葷菜'] },
  { key: 'Poissons & Bœuf', fr: 'Poissons/Bœuf', zh: '魚/牛肉類', match: ['Poissons & Bœuf', 'Poissons/Bœuf', '魚/牛肉類', '魚/牛肉類', 'Poissons & Bœuf / 魚牛肉類'] },
  { key: 'Légumes', fr: 'Légumes', zh: '素菜', match: ['Légumes', '素菜', 'Légumes / 素菜'] },
  { key: 'Accompagnements', fr: 'Riz/Nouilles', zh: '主食', match: ['Accompagnements', '主食', 'Riz/Nouilles', 'Accompagnements / 主食'] }
];

// 2. 渲染左側分類（使用固定選單，徹底修復重複問題）
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

// 3. 渲染前台菜單列表（相容中英文分類匹配）
function renderMenu() {
  const container = document.getElementById('menu-container');
  if (!container) return;

  const currentCatObj = fixedCategories.find(c => c.key === currentCategory);

  const filtered = currentCategory === 'ALL' 
    ? menuData 
    : menuData.filter(i => {
        const itemCat = i.category || '葷菜';
        return currentCatObj && currentCatObj.match && currentCatObj.match.includes(itemCat);
      });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-400 py-10">Aucun plat / 暫無菜品</div>';
    return;
  }

  container.innerHTML = filtered.map(item => {
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

// 4. 更新購物車
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

// 5. 彈窗控制
function openCheckoutModal() {
  if (Object.keys(cart).length === 0) return alert('Votre panier est vide ! / 購物車是空的！');
  document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.add('hidden');
}

// 6. 提交訂單
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

// 7. 電子小票彈窗
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

// ----------------------------------------------------
// 🔐 暗號連擊 + 密碼驗證邏輯
// ----------------------------------------------------

let secretClickCount = 0;
let secretClickTimer = null;

function handleSecretClick() {
  secretClickCount++;
  clearTimeout(secretClickTimer);
  
  secretClickTimer = setTimeout(() => {
    secretClickCount = 0;
  }, 3000);

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
    supabaseClient.channel('public:orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
        alert('🔔 Nouvelle commande reçue ! / 收到新訂單！');
        fetchOrders();
      }).subscribe();
  }
}

function checkUrlAdminParam() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('admin') === 'true') {
    const btn = document.getElementById('admin-btn');
    if (btn) btn.classList.remove('hidden');
  }
}

// ----------------------------------------------------
// 🛠️ 群主後台 Tab 切換與菜單管理邏輯
// ----------------------------------------------------

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
  const { data } = await supabaseClient.from('orders').select('*');
  const container = document.getElementById('order-list');
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="text-gray-400">Aucune commande / 暫無訂單</div>';
    return;
  }
  container.innerHTML = data.map(o => `
    <div class="bg-white p-3.5 rounded-xl border-l-4 border-orange-500 shadow-sm space-y-2">
      <div class="flex justify-between font-bold text-gray-800">
        <span>👤 ${o.customer_name}</span>
        <span class="text-green-600 text-lg">${o.total_price} €</span>
      </div>
      <div class="text-xs font-bold text-orange-600 bg-orange-50 p-1.5 rounded border border-orange-100">
        📍 配送與聯繫資訊: ${o.phone || 'N/A'}
      </div>
      <div class="text-[10px] text-gray-400">${o.created_at ? new Date(o.created_at).toLocaleString() : ''}</div>
      <ul class="text-xs bg-gray-50 p-2.5 rounded-lg border space-y-1">
        ${o.items ? o.items.map(i => `<li class="flex justify-between"><span>${i.name}</span><span class="font-bold">x${i.qty}</span></li>`).join('') : ''}
      </ul>
    </div>
  `).join('');
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

  container.innerHTML = menuData.map(item => {
    const isAvailable = item.is_available !== false;
    return `
      <div class="bg-white p-3 rounded-xl border flex justify-between items-center shadow-sm">
        <div class="flex-1 pr-2">
          <div class="font-bold text-gray-800 text-xs">${item.name_fr || ''} (${item.name_zh || ''})</div>
          <div class="text-green-600 font-extrabold text-xs mt-0.5">${item.price} € <span class="text-gray-400 font-normal">| ${item.category || '葷菜'}</span></div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="toggleDishAvailability(event, '${item.id}', ${!isAvailable})" class="px-2.5 py-1 rounded text-[10px] font-bold transition ${isAvailable ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}">
            ${isAvailable ? 'En vente / 上架中' : 'Masqué / 已下架'}
          </button>
          <button type="button" onclick="openDishModal('${item.id}')" class="bg-orange-100 text-orange-600 px-2 py-1 rounded text-[10px] font-bold">
            Modifier / 編輯
          </button>
        </div>
      </div>
    `;
  }).join('');
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
  
  if (id) {
    const item = menuData.find(m => m.id === id);
    if (!item) return;
    title.innerText = 'Modifier le plat / 編輯菜品';
    document.getElementById('dish-id').value = item.id;
    document.getElementById('dish-name-fr').value = item.name_fr;
    document.getElementById('dish-name-zh').value = item.name_zh;
    document.getElementById('dish-price').value = item.price;
    document.getElementById('dish-category').value = item.category || '葷菜';
  } else {
    title.innerText = 'Ajouter un plat / 新增菜品';
    document.getElementById('dish-id').value = '';
    document.getElementById('dish-name-fr').value = '';
    document.getElementById('dish-name-zh').value = '';
    document.getElementById('dish-price').value = '';
    document.getElementById('dish-category').value = 'Viandes';
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
  const category = document.getElementById('dish-category').value;

  if (!name_fr || !name_zh || isNaN(price)) {
    return alert('Veuillez remplir tous les champs / 請完整填寫名稱與價格！');
  }

  const payload = { name_fr, name_zh, price, category, is_available: true };

  let res;
  if (id) {
    res = await supabaseClient.from('menu_items').update(payload).eq('id', id);
  } else {
    res = await supabaseClient.from('menu_items').insert([payload]);
  }

  if (res.error) {
    alert('保存失敗: ' + res.error.message);
  } else {
    closeDishModal();
    await fetchMenu();
    fetchAdminMenu();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  fetchMenu();
  checkUrlAdminParam();
});
