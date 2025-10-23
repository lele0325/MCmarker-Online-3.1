import csv
import json
import re

# ===================================================
# 配置 (請根據您的文件格式進行檢查和修正)
# ===================================================
INPUT_CSV = 'hanzi_map.csv'     # 🚨 您的繁簡對照表文件名
OUTPUT_JS = 'simplifiedToTraditionalMap.js'
DELIMITER = ','                 # 🚨 確定：分隔符號為逗號
FILE_ENCODING = 'utf-8'

# 欄位索引 (從 0 開始計數)
# 您的數據結構是：[序號], [規範字], [繁體字], [異體字]
COL_SIMPLIFIED = 1              # 規範字（簡體）在第 2 欄
COL_TRADITIONAL = 2             # 繁體字在第 3 欄
HEADER_ROWS_TO_SKIP = 10        # 跳過開頭 9 行描述 + 1 行標題 = 10 行

def generate_js_map(input_file, output_file, delimiter, encoding=FILE_ENCODING):
    """從對照表生成 '簡體字 -> 繁體字鍵名' 的映射字典 (JS 格式)"""
    
    # 最終的簡體字到繁體字鍵名映射
    simplified_to_traditional_map = {} 
    
    try:
        with open(input_file, mode='r', encoding=encoding, newline='') as infile:
            reader = csv.reader(infile, delimiter=delimiter)
            
            # 跳過開頭的描述性文字和標題行
            for _ in range(HEADER_ROWS_TO_SKIP):
                try:
                    next(reader)
                except StopIteration:
                    print("警告：對照表數據不足！")
                    return

            for row in reader:
                # 確保行足夠長，至少包含規範字和繁體字欄位
                if len(row) < 3:
                    continue
                
                # 規範字 (簡體)
                simplified_char = row[COL_SIMPLIFIED].strip()
                
                # 繁體字原始值
                traditional_char_raw = row[COL_TRADITIONAL].strip()
                
                if not simplified_char:
                    continue
                    
                # 1. 清理繁體字欄位 (移除數字、括號等)
                # 例如：將 '瞭1' 處理為 '瞭'；如果有多餘的空格也去除
                traditional_char = re.sub(r'[()\d\s]', '', traditional_char_raw)
                
                # 2. 處理映射：因為我們的數據庫 (mcData) 是以繁體字為鍵名，
                #    所以簡體字應指向其對應的繁體字。
                
                if traditional_char and traditional_char != '～':
                    # A. 簡體字 -> 明確的繁體字 (如：厂 -> 廠)
                    # 這裡使用賦值，如果一個簡體字有多個繁體對應（如'干'對應'乾'和'幹'），
                    # 由於我們不知道哪個繁體字在 mcData 中有音，我們將所有有效的繁體字都
                    # 設置為它的映射值。但瀏覽器端只會取第一個。
                    # *更穩妥的策略：優先使用與中古音數據庫鍵名一致的那個。
                    # 由於無法在 Python 腳本中訪問 JS 端的 mcData，
                    # 我們採用最簡單的：將所有有效的繁體字設為它的查找目標。
                    simplified_to_traditional_map[simplified_char] = traditional_char
                
                elif traditional_char == '～':
                    # B. 簡體字 -> 自身 (如：卜 -> ～)
                    # 規範字本身就是我們要查找的鍵名 (繁體字)。
                    # 只有在 simplified_char 還沒有被映射時才設置為自身，
                    # 否則應優先使用更明確的繁體字鍵名。
                    if simplified_char not in simplified_to_traditional_map:
                         simplified_to_traditional_map[simplified_char] = simplified_char
        
        # 寫入 JS 文件
        with open(output_file, 'w', encoding='utf-8') as outfile:
            json_str = json.dumps(simplified_to_traditional_map, ensure_ascii=False, indent=2)
            
            # 將 JSON 字符串包裝成一個 JS 變量
            js_content = f"// 繁簡字映射表：Simplified (Key) -> Traditional (Value)\nconst simplifiedToTraditionalMap = {json_str};"
            outfile.write(js_content)

        print(f"✅ 映射文件生成成功！已保存為 {output_file}")
        print(f"已生成 {len(simplified_to_traditional_map)} 個簡體字映射。")

    except FileNotFoundError:
        print(f"❌ 錯誤：找不到文件 {input_file}。請檢查文件名是否正確。")
    except Exception as e:
        print(f"❌ 發生錯誤: {e}")

# 執行腳本
generate_js_map(INPUT_CSV, OUTPUT_JS, DELIMITER)