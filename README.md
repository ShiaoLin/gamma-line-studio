# Gamma Line Studio

將 Lieta Gamma 分布整理成每週價位，手動微調後匯出 TradingView Pine Script。支援正負 Gamma 選線、Table CE / Levels、結算範圍與工作檔保存。

**[直接開啟線上工作台](https://shiaolin.github.io/gamma-line-studio/)** · [下載離線版](https://github.com/ShiaoLin/gamma-line-studio/releases/latest)

不需要 Codex，也不需要安裝套件。線上版與離線版均在使用者自己的瀏覽器內解析匯入檔案，不會上傳 Gamma / Table / 工作檔；專案與下載包不附真實行情或私人工作檔。

## 線上使用

開啟 [Gamma Line Studio](https://shiaolin.github.io/gamma-line-studio/)，選取自己的 Gamma HTML，再視需要匯入 Table HTML。分析與編輯功能和離線版相同；網站不會自動取得行情，也不會將研究同步到雲端。

開啟網站需要網路；要穩定離線使用，請保留 Release 的單檔 HTML。重新整理或關閉前，仍需自行儲存工作檔，並確認 JSON 已下載。

## 下載與開始使用

1. 前往 [最新 Release](https://github.com/ShiaoLin/gamma-line-studio/releases/latest)，下載 `Gamma-Line-Studio-v1.2.1.zip` 並解壓縮。也可只下載 Release 中的單一 HTML。
2. 用 Chrome、Edge 或 Firefox 開啟 `Gamma-Line-Studio-v1.2.1.html`。原始碼目錄內的建置結果名為 **Gamma價位工作台.html**。
3. 準備自己的 Gamma HTML；如需黃線與 Levels，再準備相同 ticker 的 Table HTML。

分析已下載資料可離線進行。取得新行情與在 TradingView 使用指標仍需網路。本專案沒有背景抓取或自動更新資料。

若複製受瀏覽器限制，使用「全選程式碼」後按 Ctrl+C（Mac：⌘C）。工作檔保存須確認 JSON 已實際下載；頁面本身不會自動保存。

## 使用流程

1. 載入一份 Lieta Gamma HTML。一次處理一個 ticker；新 Gamma 會取代目前資料、清除舊 Table 與手動線，並恢復預設篩選。頁面不內建資料，重新開啟或整理會回到等待匯入狀態。
2. 選擇起始／截止結算週，或快速選 4、8、12 週。
3. 預設正負各取最多 3 條、最低相對強度 20%、快照現價上下 ±30%、同向最小間距 0。相近的大價位都保留；各設定的說明與範例可在「這些設定如何選線？」展開查看。
4. 進入 [Lieta 平台](https://www.lietaresearch.com/platform)，模型選 Table，輸入相同 ticker 後按 Enter。下載 Table HTML，點擊工作台的「載入 Table HTML」選檔，或直接拖入該區塊。代號與日期匹配且有對應結算週時，直接更新 CE 與 Levels，不跳彈窗。需要補填資料、跨日核對或遇到錯誤時，在載入區下方處理；日期不同仍須明確確認，代號不同禁止套用。Table 僅接受 HTML；不提供 CSV / TSV、貼上表格解析與書籤擷取。只有資料日期不同時才顯示跨日配對選項。
5. **Gamma Flip、Gamma Field、Call/Put Wall 等 Level 值以 Table 為準**。每週黃色線預設採該週最後到期日的 Gamma_Flip；若星期五沒有交易而最後到期在星期四，取星期四。缺少最後到期日 CE 時留白，不拿其他日期或 HTML 整體 Flip 補值。其他 Table Levels 顯示於核對表，不擅自指派正負 Gamma 色。
6. 可切換整週／單一到期日分布、勾選「查看全部履約價」，並用「觀察價位」查看各到期日的 Gamma 貢獻。這些觀察設定不改動選線。點分布長條或按「加入／隱藏本週價位」才會變更繪圖，加入的方向仍依整週淨 Gamma；整週抵銷為 0 不加入線條。
7. 按「＋ 加線」後，在小視窗選擇正 Gamma／負 Gamma／Flip CE，輸入價格並按「確定新增」。取消、關閉或 Esc 都不新增；空白與非正數不接受。也可拖曳線條或輸入精確價格。拖曳以 0.5 為間距；數字欄可輸入任意正數。手動變更標示為「手動」。「重新選線」保留手動線；「恢復預設並重建選線」將四項篩選恢復預設，清除手動線與隱藏狀態，並重新套用 Table CE。資料、結算範圍與 CE 取值方式保留。
8. 按「匯出到 TradingView」，複製 Pine Script，在 Pine 編輯器新建指標、貼上並新增到圖表。價位標籤預設為 Large，可在指標設定調整。複製按鈕會顯示進度與完成結果；瀏覽器超過 1.5 秒未完成時，全選程式碼並提示按 Ctrl+C（Mac：⌘C）。也可直接按「全選程式碼」，或下載 .pine。
9. 每週 CE 取值下的「Level 文字（暫存）」可貼上長文字（最多 50,000 字元），目前只保存文字，不解析、不畫線，也不加入 Pine。載入新 Gamma 會清空，調整篩選或重新選線則保留。
10. 「儲存工作檔」下載 JSON；下次用載入按鈕開啟，可恢復手動線、Table、Level 文字、篩選、週別與觀察設定。也支援舊版工作檔。歷史線保留／鎖定更新尚未實作，新 Gamma 仍會取代目前資料。

## 資料規則

- 同週一至週五的各到期日，在相同履約價上加總 **帶正負號的 Gamma**。正 Gamma 綠線、負 Gamma 紅線。方向與價位高低無關。
- 自動排序用 |Gamma|；正負分開取前 N。相對強度以該週篩選範圍內同向最大值為分母。沒有選擇權成交量資料，所以這不是 Volume 排名。
- 價位編輯的「整週淨 Gamma」欄，顯示目前價格在該週原始分布的帶正負號加總，使用 K／M／B 縮寫，游標停留可見完整數字。這個數值可直接跨正負比較，不按各方向重新正規化，也不受觀察到期日或手動線條顏色影響。修改價格後重新查值；沒有對應原始價位顯示「—」，實際相抵為零顯示 0。Flip / CE 同樣依價格查詢 Gamma，CE 本身仍是 Table 價位。預覽提示採相同查值規則。
- 每週畫一段美東週一 09:30 至週五 09:30 的水平線，標籤在中間。預設保留週間隔；可在 Pine 指標設定關閉「週間留白」延長到週五 16:00。Pine 以 `America/New_York` 和時間座標處理夏令時間。只定義曆週，不宣稱提供交易所假日資料庫。
- 畫線預覽中，同週啟用的 Flip / CE 黃線與負 Gamma 紅線在相同價位時，隱藏紅色數值並保留黄色數值。移開或停用黃線，紅字恢復。僅調整預覽標籤，不刪除紅線、不取消價位編輯的勾選，也不改動 Pine 匯出。
- Gamma 日期取 HTML 的資料時間，優先於檔名和電腦今天日期。已到期資料不補回，缺少的整週不捏造。
- Gamma 資料日期超過 7 個曆日會提示資料年齡，歷史研究仍可使用；這不是交易日／假日判定。最新存檔不等於最新市場資料，仍需核對時間。
- 匯入失敗時保留先前畫面供核對，顯示錯誤並停用 Pine 匯出，直到重新匯入有效資料。長條到期日為 nan 的 Gamma 無法可靠分週，不用 sigma 日期猜測。
- Table 日期從 dte 反推、明示 metadata 或檔名取得；無法識別時要求補上。日期不同預設阻止套用，使用者明確勾選跨日比較後才放行。匯出的圖表會標示兩者日期。
- HTML 匯入只擷取 JSON 或表格文字，不將匯入節點插入工作台，也不執行內含程式或上傳原始檔。一般 HTML 表格使用瀏覽器 DOMParser，外部資源行為尚未逐一驗證各瀏覽器；建議匯入可信來源的 Lieta 下載檔。
- Gamma / Table HTML 上限 35 MB。解析最多 64 個候選圖表、64 層 JSON，並限制累計掃描量。Table 上限為 64 欄、10,000 列、200,000 個儲存格；超限或截斷明確拒絕，不截掉部分數據繼續分析。
- 不提供 CSV 匯入或匯出。JSON 工作檔與 Pine 輸出保留。
- TradingView 指標是靜態快照，不會自行從 Lieta 更新。Pine 線條不是原生可拖曳物件，需回工作台調整後重新貼上。
- 這些水平線回畫整個結算週，資料本身可能在該週較晚才產生，不可把圖示當成當週第一天已知的回測訊號。

## Agent 操作

頁面提供股票、來源時間、Table 配對結果及所選範圍缺少的 CE 日期，讓 agent 核對每一步。找最新檔、從已登入的 Lieta 取得 Table，以及貼到 TradingView，仍由 agent 執行；沒有背景抓取或排程。可參考同目錄「Agent操作說明.md」。

## 開發與驗證

無第三方執行期依賴。`node build.js` 由 core.js、clipboard.js、app.js、table.js、shell.html 與 styles.css 重建單一 HTML。`node --test core.test.js clipboard.test.js security.test.js table-ui.test.js` 驗證資料解析、週分組、符號、CE 選取、錯誤處理、Pine 輸出及複製成功／拒絕／逾時。`node server.js` 可在本機 `http://127.0.0.1:8765` 開啟，僅監聽本機。

介面參考 [GEX 熱力圖生產器](https://claude.ai/artifact/1DzmawhDymBEvzHMCKLhFh)。主要差異：用每週獨立水平線取代熱力區塊；顏色依 Gamma 正負；同週短到期合併；Table CE 與 Level 保留來源；支援手動拖曳與工作檔保存。


## 維護與版本發布

程式更新持續提交至本 GitHub 專案做版本控制。推送到 `main` 後，GitHub Actions 會先執行測試、建置並核對單檔 HTML；全部通過才部署至 GitHub Pages。Pull Request 只執行檢查，不部署。設定見 `.github/workflows/pages.yml`。

網站只發布 `_site/index.html` 與 `.nojekyll`，不將整個程式庫或本機資料夾作為網站根目錄。GitHub 專案的 Pages 來源設定為 **GitHub Actions**。可在 Actions 查看每次發布結果；失敗時既有網站保留上一個成功版本。必要時回復程式提交，再經同一流程重新發布。

網站更新與 Release 分開：網站隨通過檢查的 `main` 更新；正式離線版本另外建立標籤與 Release，保留舊版下載，不覆蓋已發布的檔案。

開發需 Node.js 22 以上，無須執行套件安裝：

```sh
node --test core.test.js clipboard.test.js security.test.js table-ui.test.js
node build.js
node server.js
```

用 `npm run build:site` 產生網站檔案；此指令同時重建單檔 HTML。若修改程式，請一併提交重建後的 `Gamma價位工作台.html`。`_site/` 是產物，不納入版本控制。

測試程式只使用程式內的人工數值，不依賴或附帶真實行情資料。

Windows 發布包可在專案目錄執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1
```

打包流程先測試與建置，再於 `dist/` 產生單檔 HTML、ZIP 與 SHA-256 校驗檔。ZIP 僅包含 HTML、快速開始與本說明，不包含原始碼測試、行情或工作檔。新版本請更新 `package.json`、`START-HERE.txt` 與版本紀錄，提交後建立版本標籤及 GitHub Release。

主要檔案：

| 檔案 | 用途 |
|---|---|
| Gamma價位工作台.html | 可直接開啟的完整程式 |
| core.js | Gamma / Table 解析、週分組、選線與 Pine 匯出 |
| app.js / table.js / clipboard.js | 操作介面、Table 配對與複製 |
| shell.html / styles.css / build.js | 頁面模板、樣式與單檔建置 |
| core.test.js / clipboard.test.js / security.test.js / table-ui.test.js | 自動檢查計算、匯出、複製與安全限制 |
| Agent操作說明.md | 供 AI agent 使用的操作與核對流程 |

## 已知限制

- 靜態 Pine 指標需重新匯出才能更新；不提供即時行情串流。
- Codex 內嵌瀏覽器的自動下載驗證曾未完成，原因尚未確認。下載 JSON / Pine 後，以實際取得檔案為準；遇到限制可改用一般桌面瀏覽器。
- 未提供交易所假日資料庫，也不會補出缺少的到期日。

## 授權狀態

本專案目前公開原始碼，但尚未附加開源授權；公開不代表採用 MIT 或其他開源授權。

版本變更見 [CHANGELOG.md](CHANGELOG.md)。
