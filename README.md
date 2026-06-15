# nazeyama 公式サイト — 編集ガイド

**普段触るのは `content/site.yaml` だけ**です。  
動画・登録者数・本の表紙は **自動更新** されます。

---

## 編集のしかた（GitHub）

1. リポジトリを開く
2. **`content/site.yaml`** を開く
3. 右上の **鉛筆アイコン** で編集
4. **Commit changes** を押す
5. 1〜3分でサイトに反映

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

```yaml
      - title: "本のタイトル"
        author: "著者名"
        comment: "ひとことコメント"
```

表紙と Amazon リンクは **自動取得**（`asin` は書かなくてOK）

**セクションを一時的に消す** → ⑪ `display:` で `false`

```yaml
display:
  fanletter: false   # おたより欄を非表示
```

**TikTok を載せる** → ⑤の TikTok 3行の `#` を外す

**Google でヒットさせたい言葉** → ① `seo:` の `keywords:` に追加（例: リケジョ）

**公開URLを設定** → ① `site.url:` に GitHub Pages のアドレスを入れる（sitemap 生成用）

**画像を差し替える** → `assets/images/` に同名ファイルを上書き  
ファイル名を変えたときだけ ② `images:` を更新

---

## フォルダ構成

```
nazeyama/
│
├─ content/
│   └─ site.yaml          ★ 文言・リンク・本リストはここだけ編集
│
├─ assets/images/         ★ 画像を差し替えるとき（任意）
│   ├─ nazeyama.jpg       … ロゴ・アイコン
│   └─ physicsneko.png    … ネッコのイラスト
│
├─ data/                  🤖 自動更新（触らない）
│   ├─ videos.json        … 動画一覧
│   ├─ stats.json         … 登録者数など
│   └─ books.json         … 本の表紙・Amazonリンク
│
├─ index.html             … トップページ（触らない）
├─ books.html             … 本のページ（触らない）
│
├─ css/  js/  scripts/    … デザイン・自動取得の仕組み（触らない）
└─ .github/workflows/     … 6時間ごとの自動更新（触らない）

README.md                 … この編集ガイド
```

**フォルダに `node_modules` や `docs` があったら消してOK**（サイトには不要です）。

### 記号の意味

| 記号 | 意味 |
| --- | --- |
| ★ | **自分が編集する**場所 |
| 🤖 | **GitHub が自動で書き換える**（手で直すと上書きされる） |
| （触らない） | 壊れやすいので **開かなくてOK** |

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

**今すぐ更新したい** → GitHub **Actions** → **Update data** → **Run workflow**

---

## 困ったとき

- 保存後 **Actions** の **Validate content** が赤 × → インデント（行頭の空白）や `"` の付け忘れを確認
- 動画が一時的に消えた → 数時間待つか **Update data** を手動実行
- ローカル確認 → `python3 -m http.server 8000` → http://localhost:8000
