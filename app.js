const SUPABASE_URL = 'https://zcivplddxtaqlefrtajr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eQG7FVgOU36Z8edfnrf27w_5A7tlNiq';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cart = {};
let menuData = [];
let currentCategory = 'ALL';
let lastOrderDetails = null;

// 標準分類清單（固定 5 個側邊欄選項，分類內部邏輯完全對齊）
const fixedCategories = [
  { key: 'ALL', fr: 'Tout', zh: '全部' },
  { key: 'Viandes', fr: 'Viandes', zh: '葷菜', match: ['Viandes', '葷菜', 'Viandes / 葷菜'] },
  { key: 'Poissons & Bœuf', fr: 'Poissons/Bœuf', zh: '魚/牛肉類', match: ['Poissons & Bœuf', 'Poissons/Bœuf', '魚/牛肉類', '魚/牛肉類', 'Poissons & Bœuf / 魚牛肉類'] },
  { key: 'Légumes', fr: 'Légumes', zh: '素菜', match: ['Légumes', '素菜', 'Légumes / 素菜'] },
  { key: 'Accompagnements', fr: 'Riz/Nouilles', zh: '主食', match: ['Accompagnements', '主食', 'Riz/Nouilles', 'Accompagnements / 主食'] }
];

// 1. 載入所有菜單
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

// 2. 渲染左側分類
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

// 3. 渲染前台菜單列表（包含 sort_order 排序與下架過濾邏輯）
function renderMenu() {
  const container = document.getElementById('menu-container');
  if (!container) return;

  // 定義 Tout 分類下的標準大類順序
  const categoryPriority = {
    'Viandes': 1, '葷菜': 1, 'Viandes / 葷菜': 1,
    'Poissons & Bœuf': 2, 'Poissons/Bœuf': 2, '魚/牛肉類': 2, 'Poissons & Bœuf / 魚牛肉類': 2,
    'Légumes': 3, '素菜': 3, 'Légumes / 素菜': 3,
    'Accompagnements': 4, '主食': 4, 'Riz/Nouilles': 4, 'Accompagnements / 主食': 4
  };

  let listToDisplay = [];

  if (currentCategory === 'ALL') {
    // 【Tout 全部】分類：
    // 1. 自動隱藏已下架的菜品 (is_available === false)
    listToDisplay = menuData.filter(i => i.is_available !== false);

    // 2. 先按大類順序排列，同類內部按 sort_order 從小到大升序
    listToDisplay.sort((a, b) => {
      const catA = categoryPriority[a.category] || 99;
      const catB = categoryPriority[b.category] || 99;
      if (catA !== catB) {
        return catA - catB;
      }
      return (a.sort_order || 99) - (b.sort_order || 99);
    });

  } else {
    // 【單一分類】：
    const currentCatObj = fixedCategories.find(c => c.key === currentCategory);

    // 1. 篩選該分類下的所有菜品（包含已下架）
    listToDisplay = menuData.filter(i => {
      const itemCat = i.category || '葷菜';
      return currentCatObj && currentCatObj.match && currentCatObj.match.includes(itemCat);
    });

    // 2. 排序：上架在上（按 sort_order 升序），下架的自動排到最後面
    listToDisplay.sort((a, b) => {
      const availA = a.is_available !== false ? 1 : 0;
      const availB = b.is_available !== false ? 1 : 0;

      if (availA !== availB) {
        return availB - availA; // 上架(1) 優先於 下架(0)
      }
      return (a.sort_order || 99) - (b.sort_order || 99);
    });
  }

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
    const frPhoneRegex = /^(?:(?:\+33|0
