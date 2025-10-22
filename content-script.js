// 存储中古音数据
let mcData = {}; // middle chinese data
let isMcEnabled = true; // 中古音功能开关
let isProcessing = false;
let processedFlag = Symbol('mc_processed');
let currentTooltip = null; // 当前显示的提示框

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
    // 假设数据结构可能需要预处理，例如确保单音字也被包装成数组
    mcData = data; 
    console.log('中古音數據加載完成，字符數量:', Object.keys(data).length);
    processPage();
  })
  .catch(error => {
    console.error('加載中古音數據失敗:', error);
    mcData = {};
    processPage();
  });

// 处理整个页面的文本 (此段逻辑保持不变)
function processPage() {
  if (!isMcEnabled || isProcessing) {
    console.log('跳过处理：功能关闭或正在处理');
    return;
  }
  
  isProcessing = true;
  console.log('开始处理页面内容...');
  
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

    console.log(`找到 ${textNodes.length} 个需要处理的文本节点`);

    textNodes.forEach((node, index) => {
      if (index < 5000) {
        try {
          processTextNode(node);
        } catch (error) {
          console.error(`处理节点 ${index} 时出错:`, error);
        }
      }
    });

    console.log('页面处理完成，共处理了', textNodes.length, '个节点');
    
  } catch (error) {
    console.error('处理页面时發生錯誤:', error);
  } finally {
    isProcessing = false;
  }
}

// 2. 处理单个文本节点 (此段逻辑保持不变)
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
      console.error('处理文本节点时出错:', error);
      textNode[processedFlag] = 'error';
    }
  } else {
    textNode[processedFlag] = 'skipped';
  }
}

// 3. 创建字符包裹元素并添加事件 (此段逻辑保持不变)
function createCharWrapper(char) {
  const wrapper = document.createElement('span');
  wrapper.textContent = char;

  if (mcData[char]) {
      wrapper.className = 'mc-char-wrapper';
      
      // 添加右鍵點擊事件 (contextmenu)
      wrapper.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          e.stopPropagation(); 
          
          // 检查是否点击的是同一个字
          const targetChar = e.target.textContent; 
          if (currentTooltip && currentTooltip.dataset.char === targetChar) {
              hideMcTooltip();
          } else {
              showMcTooltip(e.target, targetChar, e.clientX, e.clientY);
          }
      });
  }
  
  return wrapper;
}


// 4. 显示中古音提示框 (关键修改在此函数)
function showMcTooltip(element, char, x, y) {
  // 隐藏现有的提示框
  hideMcTooltip();
  
  let readings = mcData[char];
  if (!readings) return; 

  // 🚨 关键修改：如果 readings 不是数组，则将其包装成一个数组，以便统一处理
  if (!Array.isArray(readings)) {
      readings = [readings]; 
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'mc-tooltip'; 
  tooltip.dataset.char = char; 
  tooltip.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      hideMcTooltip();
  });


  // 设定需要显示的全部 11 个属性 (除去廣韻字頭)
  const keys = [
    "聲紐", 
    "呼", 
    "等", 
    "韻部", 
    "調", 
    "聲類", 
    "攝", 
    "中古拼音(polyhedron 版)", 
    "現代北京音理論音",
    "切韻擬音(poem版)",  
    "切韻拼音(poem版)"   
  ];

  let html = `<div class="tooltip-header">「${char}」中古音韻地位 (${readings.length} 個讀音)</div>`;
  
  // 🚨 循环处理每一个音韵地位
  readings.forEach((data, index) => {
    // 如果有多个音，添加分割线
    if (readings.length > 1 && index > 0) {
      html += '<hr style="border-top: 1px solid #444; margin: 10px 0;">';
    }
    
    html += `<div class="tooltip-content">`;
    
    // 遍歷 11 個屬性
    keys.forEach(key => {
      // data 現在是當前讀音的物件
      if (data[key] && data[key].trim().length > 0) {
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

// 5. 隐藏中古音提示框 (此段逻辑保持不变)
function hideMcTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
    console.log('提示框已隱藏');
  }
}

// 6. 检查鼠标是否在提示框上 (此段逻辑保持不变)
function isMouseOverTooltip() {
  return currentTooltip && currentTooltip.matches(':hover');
}

// 8. 基于鼠标点击坐标定位 (此段逻辑保持不变)
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


// 9. 移除所有标记 (此段逻辑保持不变)
function removeMcMarks() {
  console.log('开始移除中古音標記...');
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
  
  console.log(`移除了 ${removedCount} 个中古音標記`);
}

// 10. 监听来自popup的消息 (此段逻辑保持不变)
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
  
  if (request.action === 'refreshPage') {
    console.log('刷新頁面');
    location.reload();
  }
});

console.log('中古音標記擴展：內容腳本加載完成');