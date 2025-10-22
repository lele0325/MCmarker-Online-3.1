document.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('togglePinyin'); 
  const refreshButton = document.getElementById('refreshPage');
  const statusElement = document.getElementById('status');

  // 切换中古音标记显示
  toggleButton.addEventListener('click', function() {
    // 向內容腳本發送消息
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      // 保持 action: 'togglePinyin'，以匹配 content-script.js 中监听器的逻辑
      chrome.tabs.sendMessage(tabs[0].id, {action: 'togglePinyin'}, function(response) {
        if (response && response.success) {
          // 根據 response.enabled 更新狀態文本
          const statusText = response.enabled ? '已開啟中古音標記' : '已關閉中古音標記';
          statusElement.textContent = statusText;
        } else {
          statusElement.textContent = '操作失敗，請嘗試重新載入頁面';
        }
      });
    });
  });

  // 刷新頁面
  refreshButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'refreshPage'});
    });
    statusElement.textContent = '已發送重新載入頁面請求...';
  });
});