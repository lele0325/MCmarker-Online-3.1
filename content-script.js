// 存储中古音数据
let mcData = {}; // middle chinese data
let isMcEnabled = true; // 中古音功能开关
let isProcessing = false;
let processedFlag = Symbol('mc_processed');
let currentTooltip = null; // 当前显示的提示框

// 🚨 預設顯示的鍵 (與 popup.js 中的 DEFAULT_KEYS_TO_SHOW 保持一致)
const DEFAULT_MC_KEYS = [
    "切韻音系描述", "攝", "廣韻韻目", "平水韻目", "反切或直音", "切韻拼音", "釋義"
];
let mcDisplayKeys = DEFAULT_MC_KEYS; // 🚨 運行時會被 popup.js 更新

console.log('中古音標記擴展：內容腳本開始加載...');

// 1. 加载中古音数据 (middle-chinese-data.json)
fetch(chrome.runtime.getURL('middle-chinese-data.json'))
  .then(response => {
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    mcData = data; 
    console.log('中古音數據加載完成，字符數量:', Object.keys(data).length);
    
    // 🚨 載入時從 storage 獲取最新的偏好
    chrome.storage.sync.get(['mc_display_keys'], function(result) {
        if (result.mc_display_keys) {
            mcDisplayKeys = result.mc_display_keys;
            console.log('從 storage 載入顯示偏好:', mcDisplayKeys);
        } else {
            console.log('使用預設顯示偏好');
        }
        processPage();
    });

  })
  .catch(error => {
    console.error('加載中古音數據失敗:', error);
    mcData = {};
    processPage();
  });

// 处理整个页面的文本 (邏輯不變)
function processPage() {
  if (!isMcEnabled || isProcessing) {
    console.log('跳过处理：功能关闭或正在处理');
    return;
  }
  
  isProcessing = true;
  console.log('開始處理頁面內容...');
  
  try {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          if (node[processedFlag]) {
            return NodeFilter.FILTER_REJECT;
          }
          
          if (node.parentNode && node.parentNode.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.parentNode.nodeName;
            const className = node.parentNode.className || '';
            
            if (!['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'NOSCRIPT'].includes(tagName) &&
                !node.parentNode.classList.contains('mc-char-wrapper') &&
                !node.parentNode.classList.contains('mc-tooltip') &&
                !node.parentNode.classList.contains('mc-processed')) { 
              
              const text = node.nodeValue || '';
              if (text.length > 0 && text.length < 5000 && /[\u4e00-\u9fa5]/.test(text)) {
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          }
          return NodeFilter.FILTER_REJECT;
        }
      },
      false
    );

    let node;
    const textNodes = [];
    let nodeCount = 0;
    
    while ((node = walker.nextNode()) && nodeCount < 10000) {
      textNodes.push(node);
      nodeCount++;
      node[processedFlag] = true;
    }

    console.log(`找到 ${textNodes.length} 个需要處理的文本節點`);

    textNodes.forEach((node, index) => {
      if (index < 5000) {
        try {
          processTextNode(node);
        } catch (error) {
          console.error(`處理節點 ${index} 時出錯:`, error);
        }
      }
    });

    console.log('頁面處理完成，共處理了', textNodes.length, '個節點');
    
  } catch (error) {
    console.error('處理頁面時發生錯誤:', error);
  } finally {
    isProcessing = false;
  }
}

// 2. 處理單個文本節點 (邏輯不變)
function processTextNode(textNode) {
  if (textNode[processedFlag] === 'processed') {
    return;
  }
  
  const originalText = textNode.nodeValue;
  if (!originalText || originalText.trim().length === 0) {
    return;
  }
  
  const hanziRegex = /[\u4e00-\u9fa5]/g;
  
  if (hanziRegex.test(originalText)) {
    try {
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match;
      
      hanziRegex.lastIndex = 0;
      
      while ((match = hanziRegex.exec(originalText)) !== null) {
        const char = match[0];
        const index = match.index;
        
        if (index > lastIndex) {
          const textBefore = originalText.substring(lastIndex, index);
          fragment.appendChild(document.createTextNode(textBefore));
        }
        
        const wrapperElement = createCharWrapper(char);
        fragment.appendChild(wrapperElement);
        
        lastIndex = index + 1;
      }
      
      if (lastIndex < originalText.length) {
        const textAfter = originalText.substring(lastIndex);
        fragment.appendChild(document.createTextNode(textAfter));
      }
      
      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
        textNode.parentNode.classList.add('mc-processed');
      }
      
      textNode[processedFlag] = 'processed';
      
    } catch (error) {
      console.error('處理文本節點時出錯:', error);
      textNode[processedFlag] = 'error';
    }
  } else {
    textNode[processedFlag] = 'skipped';
  }
}

// 3. 創建字符包裹元素並添加事件 (邏輯不變)
function createCharWrapper(char) {
  const wrapper = document.createElement('span');
  wrapper.textContent = char;

  let lookupChar = char; 
  
  // 1. 執行繁簡通配查找
  if (!mcData[lookupChar] && typeof simplifiedToTraditionalMap !== 'undefined') {
      const traditionalKey = simplifiedToTraditionalMap[char];
      
      if (traditionalKey) {
          if (mcData[traditionalKey]) {
              lookupChar = traditionalKey; 
          } 
      }
  }

  // 2. 現在使用 lookupChar 進行最終檢查和標記
  if (mcData[lookupChar]) { 
      wrapper.className = 'mc-char-wrapper';
      
      wrapper.dataset.lookupChar = lookupChar;
      
      // 添加右鍵點擊事件 (contextmenu)
      wrapper.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          e.stopPropagation(); 
          
          const finalCharKey = e.target.dataset.lookupChar || e.target.textContent;

          if (currentTooltip && currentTooltip.dataset.charKey === finalCharKey) {
              hideMcTooltip();
          } else {
              showMcTooltip(e.target, e.target.textContent, finalCharKey, e.clientX, e.clientY);
          }
      });
  }
  
  return wrapper;
}


// 4. 顯示中古音提示框 (🚨 核心修改：使用 mcDisplayKeys)
function showMcTooltip(element, originalChar, charKey, x, y) {
  // 隱藏現有的提示框
  hideMcTooltip();
  
  let readings = mcData[charKey]; // 使用 charKey 進行查找
  if (!readings) return; 

  // 確保 readings 是数组，以便統一處理
  if (!Array.isArray(readings)) {
      readings = [readings]; 
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'mc-tooltip'; 
  tooltip.dataset.charKey = charKey; // 存儲鍵名
  tooltip.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      hideMcTooltip();
  });


    // 提示框標題：顯示原始字符，並括注用於查找的鍵名（如果是簡體字則顯示出來）
    let headerText = `「${originalChar}」中古音韻地位`;
    if (originalChar !== charKey) {
        headerText += ` (繁: ${charKey})`;
    }
    headerText += ` (${readings.length} 個讀音)`;

  let html = `<div class="tooltip-header">${headerText}</div>`;
  
  // 循環處理每一個音韻地位
  readings.forEach((data, index) => {
    // 如果有多個音，添加分割線
    if (readings.length > 1 && index > 0) {
      html += '<hr style="border-top: 1px solid #444; margin: 10px 0;">';
    }
    
    html += `<div class="tooltip-content">`;
    
    // 🚨 遍歷所有選定的屬性
    mcDisplayKeys.forEach(key => {
      // data 現在是當前讀音的物件
      // 檢查值是否存在且非空字符串 (使用 String(data[key]) 防止 key 為 0 或 null 等)
      if (data[key] && String(data[key]).trim().length > 0) {
        html += `<div class="mc-item"><strong>${key}:</strong> <span>${data[key]}</span></div>`;
      }
    });

    html += '</div>';
  });

  tooltip.innerHTML = html;
  
  document.body.appendChild(tooltip);
  currentTooltip = tooltip;
  
  positionTooltipByCoordinates(x, y, tooltip);
}

// 5. 隱藏中古音提示框 (邏輯不變)
function hideMcTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
    console.log('提示框已隱藏');
  }
}

// 6. 檢查鼠標是否在提示框上 (邏輯不變)
function isMouseOverTooltip() {
  return currentTooltip && currentTooltip.matches(':hover');
}

// 8. 基於鼠標點擊座標定位 (邏輯不變)
function positionTooltipByCoordinates(x, y, tooltip) {
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = x + 15;
    let finalY = y + 15;

    if (finalX + tooltipRect.width > viewportWidth) {
        finalX = x - tooltipRect.width - 15; 
    }

    if (finalY + tooltipRect.height > viewportHeight) {
        finalY = y - tooltipRect.height - 15;
        if (finalY < 0) finalY = 10;
    }

    if (finalX < 0) finalX = 10;

    tooltip.style.top = finalY + 'px';
    tooltip.style.left = finalX + 'px';
}


// 9. 移除所有標記 (邏輯不變)
function removeMcMarks() {
  console.log('開始移除中古音標記...');
  const mcWrappers = document.querySelectorAll('.mc-char-wrapper'); 
  let removedCount = 0;
  
  mcWrappers.forEach(wrapper => {
    const text = wrapper.textContent;
    const textNode = document.createTextNode(text);
    wrapper.parentNode.replaceChild(textNode, wrapper);
    removedCount++;
  });
  
  const processedParents = document.querySelectorAll('.mc-processed');
  processedParents.forEach(parent => {
    parent.classList.remove('mc-processed');
  });

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    if (node[processedFlag]) {
      delete node[processedFlag];
    }
  }
  
  hideMcTooltip();
  
  console.log(`移除了 ${removedCount} 個中古音標記`);
}

// 10. 監聽來自popup的消息 (🚨 核心修改：新增對 updateDisplayKeys 的處理)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  
  if (request.action === 'togglePinyin') { 
    isMcEnabled = !isMcEnabled;
    
    if (isMcEnabled) {
      console.log('開啟中古音標記功能');
      removeMcMarks();
      setTimeout(processPage, 100);
    } else {
      console.log('關閉中古音標記功能');
      removeMcMarks();
    }
    
    sendResponse({success: true, enabled: isMcEnabled});
    return true;
  }
    
    // 🚨 新增：處理來自 popup 的欄位顯示偏好更新
    if (request.action === 'updateDisplayKeys') {
        mcDisplayKeys = request.keys;
        console.log('已更新提示框顯示字段:', mcDisplayKeys);
        // 不需要重新處理頁面，因為下次點擊時會使用新的 mcDisplayKeys
        sendResponse({success: true});
        return true;
    }
  
  if (request.action === 'refreshPage') {
    console.log('刷新頁面');
    location.reload();
  }
});

console.log('中古音標記擴展：內容腳本加載完成');