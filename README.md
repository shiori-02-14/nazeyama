# nazeyama 公式サイト — 編集メモ

自分用のメモです。**普段触るのは `content/` の2ファイルだけ**で大丈夫です。
動画・登録者数・ショートの再生数などは **自動で更新** されます。

---

## まず覚えること

| やりたいこと | 編集するファイル |
| --- | --- |
| キャッチコピー・SNS・おたより住所・メンバー価格など | `content/site.yaml` |
| おすすめの本 | `content/books.yaml` |
| 画像の差し替え（任意） | `assets/images/` |
| 動画・登録者数 | **触らない**（6時間ごとに自動更新） |

> **YAMLのコツ** — 行頭の `#` はメモでサイトに出ません。  
> `キー: 値` の形を保ち、行頭の空白（インデント）を崩さない。  
> `:` や `#` を含む文は `"ダブルクォート"` で囲む。

---

## GitHub から編集する（いちばん簡単）

1. リポジトリを開く
2. `content/site.yaml` または `content/books.yaml` を開く
3. 右上の **鉛筆アイコン** で編集
4. 下の **Commit changes** を押す
5. 1〜3分待つとサイトに反映される

---

## よくある編集

### プロフィール・SNS・おたより → `content/site.yaml`

```yaml
site:
  tagline: "Because it's there."      # メインキャッチ
  subcopy: "ほんのり物理が香る、にゃんこの日常"

sns:
  - name: "X (Twitter)"
    url: "https://x.com/nazeyama__"     # ← URLを変える
    handle: "@nazeyama__"

fanletter:
  postal: "〒573-0073"
  address: "大阪府枚方市…"             # ← おたより送り先

membership:
  price: "月額80円"                     # ← メンバー価格
```

- **TikTok を載せたい** → `sns:` の TikTok 3行の先頭 `#` を外して URL を入れる
- **セクションを一時的に消す** → 下の `display:` で `false` にする

```yaml
display:
  books: false        # 本のページへのリンクを消したいとき
  fanletter: false    # おたより欄を消したいとき
```

### おすすめの本 → `content/books.yaml`

本は **別ページ**（`books.html`）に表示されます。

```yaml
novels:
  items:
    - title: "十角館の殺人"
      author: "綾辻行人"
      asin: ""              # ← Amazonの商品ID（B0〜 など）を入れると「Amazonで見る」が出る
      comment: "新本格の金字塔。まずはここから。"
```

- 本を **増やす** → 既存の `- title:` ブロックをコピーして追記
- アフィリエイトID → `site.yaml` の `amazon_tag:`（例: `nazeyama-22`）

### お問い合わせフォームを有効にする → `content/site.yaml`

```yaml
contact:
  formspree_endpoint: "https://formspree.io/f/xxxxxxxx"
```

1. [Formspree](https://formspree.io/) で無料アカウント作成
2. フォームを作って表示される URL を上に貼る  
   （今は `your_form_id` のままなので、フォームは動いていません）

### 画像 → `assets/images/`

詳しくは [`assets/images/README.md`](assets/images/README.md)。  
画像がなくてもサイトは表示されます（イラストはコード内の SVG）。

| ファイル | 用途 |
| --- | --- |
| `physicsneko.png` | ネッコの写真 |
| `nazeyama.jpg` | ロゴ（砂山の少年） |
| `hero.png` | トップのキービジュアル |
| `ogp.png` | X などでシェアしたときのサムネ（1200×630） |

---

## 自動で更新されるもの（触らなくてOK）

| 内容 | 保存先 | 更新タイミング |
| --- | --- | --- |
| 通常動画・ショート・メンバー限定ラベル・投稿日・再生数 | `data/videos.json` | 6時間ごと |
| 登録者数 | `data/stats.json` | 6時間ごと |

**今すぐ更新したいとき**  
GitHub → **Actions** → **Update data (videos & subscribers)** → **Run workflow**

サイト上の動画欄では、タブで **すべて / 動画 / ショート / ライブ** の切り替えや **再生数順・メンバー限定** の並び替えができます。

---

## ローカルでプレビューしたいとき

```bash
cd nazeyama
python3 -m http.server 8000
# ブラウザで http://localhost:8000
```

`index.html` をダブルクリックだけでも開けますが、本や最新データの読み込みはサーバー経由の方が確実です。

---

## 公開（GitHub Pages）

1. このフォルダを GitHub にプッシュ
2. リポジトリ **Settings → Pages → Source** を `main` / `/(root)`
3. 数分で `https://<ユーザー名>.github.io/<リポジトリ名>/` に公開

---

## 触らなくていいファイル

| ファイル | 内容 |
| --- | --- |
| `index.html` / `books.html` | ページの骨組み |
| `css/style.css` | 黒板デザイン |
| `js/main.js` | 動画マーキー・カウンターなど |
| `scripts/fetch-data.mjs` | データ取得（Actions が実行） |
| `.github/workflows/` | 自動更新・構文チェック |
| `data/*.json` | 自動生成（手編集しない） |

---

## 困ったとき

- YAML を保存したら **Actions** タブに **Validate content** が走る。赤 × ならインデントや `"` の付け忘れを疑う
- **動画が出ない・一時的に消えた** → 数時間待つか **Update data** を手動実行（YouTube 側の一時エラーで取得に失敗することがあります。前回データは可能な限り保持されます）
- 動画が古い → **Update data** を手動実行
- 出典・確認リスト → [`docs/sources.md`](docs/sources.md) / [`docs/factcheck.md`](docs/factcheck.md)

---

## フォルダ構成（ざっくり）

```
nazeyama/
├─ content/
│  ├─ site.yaml       ★ 自分が編集
│  └─ books.yaml      ★ 自分が編集
├─ assets/images/     ★ 画像（任意）
├─ data/              自動更新（触らない）
├─ index.html         トップ
├─ books.html         おすすめの本
└─ docs/              詳しいメモ・出典
```
