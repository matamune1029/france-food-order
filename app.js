// ----------------------------------------------------
// 🌟 1. 本地歷史訂單 LocalStorage 管理
// ----------------------------------------------------

// 保存訂單到本地
function saveOrderToLocalStorage(order) {
  try {
    let history = JSON.parse(localStorage.getItem('cici_order_history') || '[]');
    // 插入最前面
    history.unshift({
      ...order,
      createdAt: new Date().toLocaleString()
    });
    // 最多保留最近 20 筆
    if (history.length > 20) history = history.slice(0, 20);
    localStorage.setItem('cici_order_history', JSON.stringify(history));
  } catch (e) {
    console.error('Save local history failed:', e);
  }
}

// 打開歷史訂單彈窗
function openHistoryModal() {
  const modal = document.getElementById('history-modal');
  const container = document.getElementById('history-list');
  if (!modal || !container) return;

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('cici_order_history') || '[]');
  } catch (e) { history = []; }

  if (history.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-400 py-8 text-xs">Aucune commande récente / 尚無歷史訂單紀錄</div>';
  } else {
    container.innerHTML = history.map(o => {
      const itemsText = o.items ? o.items.map(i => `${i.name_fr} x${i.qty}`).join(', ') : '';
      return `
        <div class="bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs space-y-1.5 shadow-sm">
          <div class="flex justify-between items-center font-bold text-gray-800 border-b pb-1">
            <span class="text-green-600">#${o.orderId}</span>
            <span class="text-gray-400 text-[10px] font-normal">${o.createdAt || ''}</span>
          </div>
          <div class="text-gray-600">📅 <strong>配送:</strong> ${o.deliverySlot}</div>
          <div class="text-gray-600 truncate">🍲 <strong>明細:</strong> ${itemsText}</div>
          <div class="flex justify-between items-center pt-1 font-bold">
            <span class="text-gray-500">金額:</span>
            <span class="text-green-600 text-sm">${(o.total || 0).toFixed(2)} €</span>
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


// ----------------------------------------------------
// 🌟 2. 📸 一鍵保存電子小票為 PNG 圖片
// ----------------------------------------------------

async function downloadReceiptAsImage() {
  const receiptCard = document.getElementById('receipt-card');
  if (!receiptCard) return;

  try {
    // 使用 html2canvas 將 DOM 轉為 Canvas
    const canvas = await html2canvas(receiptCard, {
      scale: 2, // 提升生成圖片的清晰度
      backgroundColor: '#ffffff'
    });

    // 轉為 Data URL
    const image = canvas.toDataURL('image/png');

    // 創建下載鏈接並觸發下載
    const link = document.createElement('a');
    link.href = image;
    link.download = `Receipt_${lastOrderDetails ? lastOrderDetails.orderId : 'CC-0001'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  } catch (err) {
    console.error('Generate receipt image failed:', err);
    alert('❌ 生成圖片失敗，請直接使用手機截圖保存。');
  }
}


// ----------------------------------------------------
// 🌟 3. 在 submitOrder() 內觸發保存本地紀錄
// ----------------------------------------------------

async function submitOrder() {
  try {
    // ...前面表單驗證、寫入 Supabase、扣減庫存邏輯保持不變 ...

    lastOrderDetails = { orderId, deliverySlot, name, phone, address, note, items, total };

    // 保存至本地歷史訂單 LocalStorage
    saveOrderToLocalStorage(lastOrderDetails);

    cart = {};
    closeCheckoutModal();
    showReceiptModal(lastOrderDetails);

  } catch (err) {
    console.error('Submission Error:', err);
    alert('Erreur / 提交過程發生錯誤: ' + err.message);
  }
}
