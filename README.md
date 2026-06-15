# nazeyama 公式サイト — 編集ガイド

**普段触るのは `content/site.yaml` だけ**です。  
動画・登録者数・本の表紙は **自動更新** されます。

**基本は GitHub のブラウザで編集** すればOKです（VS Code や特別なツールは不要）。

---

## 編集のしかた（GitHub・おすすめ）

1. リポジトリを開く → https://github.com/shiori-02-14/nazeyama
2. **`content/site.yaml`** を開く
3. 右上の **鉛筆アイコン（Edit）** で編集
4. 下の **Commit changes** を押す
5. 1〜3分でサイトに反映

これだけで完了です。ローカルにダウンロードしたり、VS Code を開く必要はありません。

---

## VS Code で編集する場合（任意）

PC に VS Code がある人向けです。**Git 拡張機能**（最初から入っている）だけ使います。

1. リポジトリを PC に **Clone**（GitHub の緑ボタン → HTTPS の URL をコピー）
2. VS Code でフォルダを開く
3. **`content/site.yaml`** を編集して保存
4. 左の **ソース管理**（分岐マーク）を開く
5. 変更一覧で **site.yaml だけ** にチェック
6. メッセージを書いて **コミット**
7. **同期**（↑ または「プルしてからプッシュ」）をクリック

### push できないとき

| 症状 | 対処 |
|---|---|
| 同期ボタンが出ない | まず **コミット** する |
| push が失敗する | **プル** してから、もう一度 **同期** |
| よくわからないファイルが出る | **site.yaml 以外は選ばない** |

`seo:`（検索・LINE プレビュー用）を変えたあと、すぐ反映したい → GitHub **Actions** → **Update data** → **Run workflow**

---

## site.yaml の見方

ファイル内の **①〜⑫** が、サイトの各ブロックに対応しています。

| 番号 | 内容 | 例 |
| --- | --- | --- |
| ① | サイト名・キャッチ・**検索キーワード** | `tagline:` / `seo:` |
| ② | 画像ファイル名 | `logo:` / `neko:` |
| ③ | YouTube チャンネル | `channel_id:` |
| ④ | プロフィール | `path:` / `bio:` |
| ⑤ | SNS リンク | `sns:` のリスト |
| ⑥ | LINEスタンプ | `line_stamp:` |
| ⑦ | メンバーシップ | `price:` |
| ⑧ | おたより送り先 | `fanletter:` |
| ⑨ | お問い合わせ | `formspree_endpoint:` |
| ⑩ | Amazonアフィリエイト | `amazon_tag:` |
| ⑪ | セクション表示 ON/OFF | `display:` |
| ⑫ | おすすめの本 | `books:` |

### よく使う編集

**SNSのURLを変える** → ⑤ `sns:` の `url:` と `handle:`

**おたよりの住所を変える** → ⑧ `fanletter:` の `postal:` / `address:`

**本を増やす** → ⑫ `books:` にブロックをコピペ

**Google でヒットさせたい言葉** → ① `seo:` の `keywords:` に追加

**画像を差し替える** → `assets/images/` に同名ファイルを上書き

---

## フォルダ構成

```
nazeyama/
│
├─ content/
│   └─ site.yaml          ★ 文言・リンク・本リストはここだけ編集
│
├─ assets/images/         ★ 画像を差し替えるとき（任意）
│   ├─ nazeyama.jpg
│   └─ physicsneko.png
│
├─ data/                  🤖 自動更新（触らない）
│   ├─ videos.json
│   ├─ stats.json
│   └─ books.json
│
├─ index.html             … トップページ（触らない）
├─ books.html             … 本のページ（触らない）
│
├─ css/  js/  scripts/   … デザイン・自動取得の仕組み（触らない）
└─ .github/workflows/     … 6時間ごとの自動更新（触らない）
```

### 覚え方

- **文章を変えたい** → `content/site.yaml`
- **写真を変えたい** → `assets/images/` に上書き
- **動画や登録者数** → 何もしなくてOK（自動）
- **それ以外** → 基本触らない

---

## 自動更新

| 内容 | 保存先 | タイミング |
| --- | --- | --- |
| 動画・ショート・再生数 | `data/videos.json` | 6時間ごと |
| 登録者数 | `data/stats.json` | 6時間ごと |
| 本の表紙・Amazonリンク | `data/books.json` | 6時間ごと |

**今すぐ更新** → GitHub **Actions** → **Update data** → **Run workflow**

---

## 困ったとき

- 保存後 **Actions** が赤 × → インデントや `"` の付け忘れを確認
- 動画が消えた → **Update data** を手動実行
- サイトの確認 → https://shiori-02-14.github.io/nazeyama/
- ローカルで動画が出ない → **「すべて」タブ**を選ぶ（ライブは0件のことがある）。`index.html` を直接開かず VS Code の **Live Server** か `python3 -m http.server 8000` で開く
