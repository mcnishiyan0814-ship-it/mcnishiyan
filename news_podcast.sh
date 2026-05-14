#!/usr/bin/env bash
# news_podcast.sh
#
# 「サイバーセキュリティ」「フィジカルAI」を含む日本語ニュースを
# Google News RSS から取得し、NotebookLM の Audio Overview に
# 投入できる Markdown ソース文書を生成する。
#
# 使い方:
#   ./news_podcast.sh                # ./output/ 配下に当日分を生成
#   ./news_podcast.sh -o my_dir      # 出力ディレクトリを指定
#   ./news_podcast.sh -n 15          # 取得件数を変更 (デフォルト 10)
#
# 生成物:
#   <出力ディレクトリ>/news_YYYYMMDD.md
#     -> NotebookLM の「ソースを追加 > テキストを貼り付け」または
#        ファイルアップロードで読み込み、Audio Overview を生成する。

set -euo pipefail

# ---------- 引数解析 ----------
OUT_DIR="./output"
LIMIT=10
KEYWORDS=("サイバーセキュリティ" "フィジカルAI")

while getopts "o:n:h" opt; do
  case "$opt" in
    o) OUT_DIR="$OPTARG" ;;
    n) LIMIT="$OPTARG" ;;
    h)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$OUT_DIR"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

DATE_TAG="$(date +%Y%m%d)"
DATE_HUMAN="$(date '+%Y年%m月%d日')"
OUT_FILE="$OUT_DIR/news_${DATE_TAG}.md"

# ---------- フィード取得 ----------
# Google News RSS は ?q=<keyword>&hl=ja&gl=JP&ceid=JP:ja で
# 日本語ニュースの検索結果を返す。
fetch_feed() {
  local kw="$1"
  local enc_kw
  enc_kw="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$kw")"
  local url="https://news.google.com/rss/search?q=${enc_kw}&hl=ja&gl=JP&ceid=JP:ja"
  curl -fsSL --max-time 20 -A "Mozilla/5.0 news_podcast.sh" "$url"
}

for kw in "${KEYWORDS[@]}"; do
  safe="$(printf '%s' "$kw" | tr -c '[:alnum:]' _)"
  echo "==> Fetching: $kw" >&2
  fetch_feed "$kw" > "$TMP_DIR/${safe}.xml" || {
    echo "    取得失敗: $kw" >&2
    : > "$TMP_DIR/${safe}.xml"
  }
done

# ---------- パース & マージ ----------
# Python の標準ライブラリだけで RSS を解析し、
# キーワード、タイトル、リンク、配信元、公開日時、要約 (description) を抽出する。
python3 - "$TMP_DIR" "$OUT_FILE" "$LIMIT" "$DATE_HUMAN" "${KEYWORDS[@]}" <<'PY'
import os, sys, re, html, glob
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

tmp_dir, out_file, limit, date_human, *keywords = sys.argv[1:]
limit = int(limit)

def strip_tags(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    return html.unescape(text).strip()

items = []
seen_links = set()
seen_titles = set()

for path in sorted(glob.glob(os.path.join(tmp_dir, "*.xml"))):
    if os.path.getsize(path) == 0:
        continue
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        continue
    for it in root.iter("item"):
        title = strip_tags(it.findtext("title", default=""))
        link = (it.findtext("link", default="") or "").strip()
        pub = it.findtext("pubDate", default="") or ""
        desc = strip_tags(it.findtext("description", default=""))
        source_el = it.find("source")
        source = (source_el.text or "").strip() if source_el is not None else ""
        if not title or not link:
            continue
        # 重複除去 (リンクとタイトル両方で)
        if link in seen_links or title in seen_titles:
            continue
        seen_links.add(link)
        seen_titles.add(title)
        try:
            dt = parsedate_to_datetime(pub)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            dt = datetime.fromtimestamp(0, tz=timezone.utc)
        matched = [k for k in keywords if k in title or k in desc]
        items.append({
            "title": title,
            "link": link,
            "pub": dt,
            "source": source,
            "desc": desc,
            "matched": matched or ["(関連)"],
        })

# 新しい順にソートして上位 N 件
items.sort(key=lambda x: x["pub"], reverse=True)
items = items[:limit]

if not items:
    sys.stderr.write("ニュースが取得できませんでした。ネットワークまたはキーワードを確認してください。\n")
    sys.exit(2)

lines = []
lines.append(f"# 本日のニュース ({date_human})")
lines.append("")
lines.append(f"対象キーワード: {' / '.join(keywords)}")
lines.append(f"件数: {len(items)} 件 (Google News RSS, 日本語)")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## ポッドキャストでの読み上げ用イントロ")
lines.append("")
lines.append(
    f"こんにちは。{date_human} のニュースダイジェストです。"
    f"今日は「{'」「'.join(keywords)}」に関する最新ニュースを {len(items)} 件、"
    "順番にご紹介します。"
)
lines.append("")
lines.append("---")
lines.append("")
lines.append("## ニュース一覧")
lines.append("")

for i, it in enumerate(items, 1):
    pub_str = it["pub"].astimezone().strftime("%Y-%m-%d %H:%M")
    lines.append(f"### {i}. {it['title']}")
    lines.append("")
    lines.append(f"- 配信元: {it['source'] or '不明'}")
    lines.append(f"- 公開日時: {pub_str}")
    lines.append(f"- マッチしたキーワード: {', '.join(it['matched'])}")
    lines.append(f"- リンク: {it['link']}")
    if it["desc"]:
        snippet = it["desc"][:300]
        lines.append("")
        lines.append(f"> {snippet}")
    lines.append("")

lines.append("---")
lines.append("")
lines.append("## ポッドキャストでの読み上げ用アウトロ")
lines.append("")
lines.append(
    "以上、本日のサイバーセキュリティとフィジカルAIに関するニュースでした。"
    "詳細は各リンクからご確認ください。"
)
lines.append("")

with open(out_file, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(out_file)
PY

echo ""
echo "✅ 生成完了: $OUT_FILE"
echo ""
echo "次のステップ (NotebookLM):"
echo "  1. https://notebooklm.google.com を開く"
echo "  2. 新規ノートブックを作成し、「ソースを追加」を選択"
echo "  3. $OUT_FILE をアップロード (または中身を貼り付け)"
echo "  4. 右側パネルの「Audio Overview」→「生成」をクリック"
