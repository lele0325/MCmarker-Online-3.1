// popup.js

// 🚨 根據您的 TSV 標題，定義所有可選的鍵
const ALL_MC_KEYS = [
    "小韻號", "切韻音系描述", "攝", "方音字彙描述", "廣韻韻目", 
    "平水韻目", "反切或直音", "切韻拼音", "白一平拼音", "古韻羅馬字", 
    "有女羅馬字", "高本漢", "王力1957", "王力1985", "李榮", "邵榮芬", 
    "蒲立本", "鄭張尚芳", "潘悟雲2000", "潘悟雲2013", "潘悟雲2023", 
    "unt2020", "unt2022", "unt通俗擬音", "msoeg", "釋義"
];

// 🚨 預設顯示的鍵 (建議初始選幾項核心資訊)
const DEFAULT_KEYS_TO_SHOW = [
    "切韻音系描述", "攝", "廣韻韻目", "平水韻目", "反切或直音", "切韻拼音", "釋義"
];

const STORAGE_KEY = 'mc_display_keys';

document.addEventListener('DOMContentLoaded', function() {
    const toggleButton = document.getElementById('togglePinyin'); 
    const refreshButton = document.getElementById('refreshPage');
    const statusElement = document.getElementById('status');
    const fieldCheckboxesContainer = document.getElementById('fieldCheckboxes');
    const saveStatus = document.getElementById('saveStatus');
    
    // 🚨 獲取新的按鈕元素
    const selectAllButton = document.getElementById('selectAll');
    const selectNoneButton = document.getElementById('selectNone'); // 更改為 selectNone

    // 1. 初始化並載入設置
    initSettings();

    // 2. 核心控制邏輯 (保持不變)
    toggleButton.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'togglePinyin'}, function(response) {
                if (response && response.success) {
                    const statusText = response.enabled ? '已開啟中古音標記' : '已關閉中古音標記';
                    statusElement.textContent = statusText;
                } else {
                    statusElement.textContent = '操作失敗，請嘗試重新載入頁面';
                }
            });
        });
    });

    refreshButton.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'refreshPage'});
        });
        statusElement.textContent = '已發送重新載入頁面請求...';
    });
    
    // 🚨 3. 新增按鈕事件監聽器
    selectAllButton.addEventListener('click', () => handleSelection(true));
    selectNoneButton.addEventListener('click', () => handleSelection(false)); // 點擊 '全不選' 執行 handleSelection(false)


    // 4. 設置函數 (保持不變)
    function initSettings() {
        chrome.storage.sync.get([STORAGE_KEY], function(result) {
            const savedKeys = result[STORAGE_KEY];
            const keysToShow = savedKeys || DEFAULT_KEYS_TO_SHOW;
            
            // 生成勾選框
            ALL_MC_KEYS.forEach(key => {
                if (key === '字頭') return; 
                
                const isChecked = keysToShow.includes(key);
                
                const label = document.createElement('label');

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.name = 'displayField';
                checkbox.value = key;
                checkbox.checked = isChecked;
                
                checkbox.addEventListener('change', saveSettings);
                
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(key));
                fieldCheckboxesContainer.appendChild(label);
            });

            sendDisplayKeysToContentScript(keysToShow);
        });
    }

    // 儲存設置到 chrome.storage.sync (保持不變)
    function saveSettings() {
        const checkedBoxes = document.querySelectorAll('input[name="displayField"]:checked');
        const selectedKeys = Array.from(checkedBoxes).map(cb => cb.value);

        chrome.storage.sync.set({[STORAGE_KEY]: selectedKeys}, function() {
            saveStatus.textContent = '偏好已儲存';
            setTimeout(() => { saveStatus.textContent = ''; }, 1500);

            sendDisplayKeysToContentScript(selectedKeys);
        });
    }

    // 🚨 5. 處理全選和全不選的函數
    function handleSelection(selectAll = false) {
        const checkboxes = document.querySelectorAll('input[name="displayField"]');
        let shouldSave = false;

        checkboxes.forEach(cb => {
            const targetCheckedState = selectAll; // 全選 = true, 全不選 = false
            
            if (cb.checked !== targetCheckedState) {
                cb.checked = targetCheckedState;
                shouldSave = true;
            }
        });
        
        if (shouldSave) {
            saveSettings();
        }
    }


    // 將偏好發送給當前頁面的 content-script (保持不變)
    function sendDisplayKeysToContentScript(keys) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs.length > 0) {
                 chrome.tabs.sendMessage(tabs[0].id, {action: 'updateDisplayKeys', keys: keys});
            }
        });
    }
});