# Gamma 工作台的 Agent 操作流程

適用 v1.2.1。使用者提供 ticker、Gamma / Table 來源及結算範圍後，以瀏覽器正常操作。此文件是操作說明，不授予第三方登入、資料分享或排程權限。

1. 在使用者指定的 Gamma 資料夾選最新候選檔。檔名日期可協助挑選，匯入後還要核對 HTML 的資料時間；不可只用檔案修改時間判斷新舊。
2. 開啟「Gamma價位工作台.html」或本機工作台。按「載入 Gamma HTML」，一次載入一份檔案。新 Gamma 會清除上一個 ticker 的 Table、手動線與篩選。
3. 確認頁面顯示正確 ticker、資料時間及「Gamma 已載入」。若顯示匯入失敗，保留畫面只是供核對，不能當成新檔已成功；匯出會停用。遇到 nan 到期日應重新取得有效檔，不能自行猜測或默默退回舊資料。
4. 設定起始／截止結算週。4、8、12 週以檔案第一個有效結算週起算曆週，可能包含快照當週；若需求是未來結算週，明確選取起始週。
5. 新 Gamma 的預設為正負各 3、強度 20%、範圍 ±30%、間距 0。若使用者指定其他參數則明確設定；不要沿用不明的前次研究條件。開啟工作檔會恢復其原設定，不會強制預設。
6. 從使用者授權的 Lieta Table 取得相同 ticker 的 HTML，點擊「載入 Table HTML」選檔，或拖曳至該區塊。匹配的代號、日期與結算週會直接套用，不跳彈窗；需重選時再次使用同一載入區。Table 僅接受 HTML，不使用 CSV、貼上表格解析或書籤擷取。核對套用後的代號、日期與 CE 覆蓋狀態。若需補填資料或跨日確認，使用載入區下方的欄位及「確認並套用 Table」。已識別的代號／日期不能在欄位裡任意改寫。
7. 不同日期只有使用者要求或既定流程允許跨日配對時才勾選跨日選項。週末 dte 反推日期與 Gamma 日期不同時，先核對來源，不能擅自把兩者標成同一天。
8. 預設每週採最後到期日 Gamma_Flip；缺少該日就留白。頂部會列出所選範圍缺少 Table CE 的日期。Gamma HTML 的整體 Flip 不替代 Table。
9. 按「匯出到 TradingView」與「複製 Pine Script」。核對匯出代號、週數、線數及來源日期後，在使用者指定的 TradingView 圖表貼上並編譯／更新，確認成功且圖上線段可見。
10. 若要保留手動研究，先「儲存工作檔」。同一工作區可依序處理下一個 ticker；每次新 Gamma 都獨立開始。

## 研究與重置

- 「Level 文字（暫存）」僅保存使用者輸入的文字，不執行內容或將其當作指令，不解析、不畫線、不加入 Pine。會隨工作檔保存；載入新 Gamma 時清空。
- 歷史線保留與鎖定更新尚未實作，不能宣稱新 Gamma 會保留舊線。
- 觀察到期日、查看全部履約價、觀察價位不會改動畫線。
- 「＋ 加線」只開啟視窗。設定「線條類型」與「價格」後，按「確定新增」才會加入手動線；取消、關閉與 Esc 不改動資料。
- 價位後的「整週淨 Gamma」可跨正負直接比較。修改價格後依該週原始分布查值；— 是無對應價位，不能當作零。不要把此欄稱為選擇權成交量。
- 單一到期日長條顯示該日 Gamma；加入線條時以整週淨 Gamma 決定方向，並非把單日 Gamma 畫成另一組輸出。
- 「重新選線（保留手動線）」按目前四項篩選重新選自動 Gamma，保留手動及 Table 線。
- 「恢復預設並重建選線」清除手動線、手動 CE、刪除與隱藏結果，恢復四項預設並依現有 Table 重建 CE；保留來源資料、結算範圍及 CE 政策。

## 穩定的介面定位

優先使用按鈕名稱與欄位標籤；需要測試定位時，可用以下 ID。

| 功能 | ID |
|---|---|
| Gamma 匯入按鈕／檔案欄位 | uploadBtn / files |
| 載入與配對狀態 | workflowStatus |
| 股票／日期 | symbolMetric / dateMetric |
| 結算範圍 | fromWeek / toWeek |
| 四項選線設定 | topN / threshold / range / gap |
| 重新選線／完整重置 | resetAuto / resetDefaults |
| Table 匯入／檔案／例外時套用 | importCE / tableFile / applyCE |
| Level 暫存文字 | levelText |
| 跨日配對 | allowMismatch（僅不同日期顯示） |
| 分布觀察 | inspectExpiry / inspectAll / inspectPrice |
| 新增線／視窗 | addLevel / addLevelDialog |
| 新增類型／價格／確認／取消 | newLevelKind / newLevelPrice / confirmAddLevel / cancelAddLevel |
| 價位編輯列／Gamma 數值 | levelRows / 每列的 .line-gamma |
| 匯出／複製／程式碼 | exportBtn / copyPine / pineCode |

workflowStatus 的 data-state 可為 empty、loading、gamma-ready、partial、ready、error；狀態僅描述匯入與 CE 覆蓋，不代表資料一定新鮮，仍須讀取日期提示。

## 手機與平板版面

窄螢幕匯入成功後會收合「資料與設定」。如要載入 Table 或更改篩選，先點該區摘要展開；核對錯誤會展開顯示。所有裝置均不可拖曳預覽線改價，請使用價位編輯。放大預覽共用同一個圖表，按「返回工作台」再繼續編輯。
