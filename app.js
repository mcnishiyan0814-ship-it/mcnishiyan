(() => {
  const STORAGE_KEY = "daily-dashboard:schedule:v1";

  const MOCK_NEWS = [
    {
      category: "テクノロジー",
      title: "生成AIの企業導入が加速、業務効率化に貢献",
      summary:
        "国内大手企業の70%以上が生成AIの導入を検討しており、文書作成やカスタマーサポートで成果が出ている。",
    },
    {
      category: "経済",
      title: "日経平均、3日連続で上昇 半導体関連株が牽引",
      summary:
        "本日の東京株式市場は半導体関連の銘柄が大きく値上がりし、日経平均は前日比1.2%高で取引を終えた。",
    },
    {
      category: "スポーツ",
      title: "サッカー日本代表、親善試合で勝利",
      summary:
        "国際親善試合で日本代表は2-0で勝利。若手選手の活躍が目立ち、次戦への期待が高まる。",
    },
    {
      category: "国際",
      title: "気候変動サミット開催、各国が新たな目標を発表",
      summary:
        "今年の気候変動サミットでは、主要国が2030年までのカーボンニュートラル達成に向けた具体的な施策を共有した。",
    },
    {
      category: "サイエンス",
      title: "新しい系外惑星を発見、生命存在の可能性を調査",
      summary:
        "天文学者チームが地球から約40光年離れた位置に新たな系外惑星を発見。大気組成の分析が進められている。",
    },
    {
      category: "カルチャー",
      title: "国内映画館の入場者数、コロナ前の水準に回復",
      summary:
        "本年度の映画館入場者数は前年比15%増加し、コロナ禍前の水準にほぼ戻ったと業界団体が発表した。",
    },
  ];

  // ---------- DateTime ----------
  const dateEl = document.getElementById("date");
  const timeEl = document.getElementById("time");
  const greetingEl = document.getElementById("greeting");

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  function updateDateTime() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const w = weekdays[now.getDay()];
    dateEl.textContent = `${y}年${m}月${d}日 (${w})`;

    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    timeEl.textContent = `${hh}:${mm}:${ss}`;
  }

  function setGreeting() {
    const hour = new Date().getHours();
    let msg;
    if (hour < 5) msg = "夜更かしお疲れさまです。無理せずお過ごしください。";
    else if (hour < 11) msg = "おはようございます。今日も良い一日になりますように。";
    else if (hour < 17) msg = "こんにちは。一息ついていきましょう。";
    else if (hour < 21) msg = "こんばんは。今日の振り返りはいかがですか？";
    else msg = "お疲れさまでした。ゆっくり休んでくださいね。";
    greetingEl.textContent = msg;
  }

  updateDateTime();
  setGreeting();
  setInterval(updateDateTime, 1000);

  // ---------- Schedule ----------
  const form = document.getElementById("schedule-form");
  const timeInput = document.getElementById("schedule-time");
  const textInput = document.getElementById("schedule-text");
  const listEl = document.getElementById("schedule-list");
  const emptyEl = document.getElementById("schedule-empty");
  const countEl = document.getElementById("schedule-count");

  let schedule = loadSchedule();

  function loadSchedule() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveSchedule() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
  }

  function renderSchedule() {
    schedule.sort((a, b) => a.time.localeCompare(b.time));
    listEl.innerHTML = "";

    for (const item of schedule) {
      const li = document.createElement("li");
      li.className = "schedule-item" + (item.done ? " done" : "");

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "schedule-check";
      check.checked = !!item.done;
      check.addEventListener("change", () => {
        item.done = check.checked;
        saveSchedule();
        renderSchedule();
      });

      const time = document.createElement("span");
      time.className = "schedule-item-time";
      time.textContent = item.time;

      const text = document.createElement("span");
      text.className = "schedule-text";
      text.textContent = item.text;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-icon";
      del.title = "削除";
      del.textContent = "×";
      del.addEventListener("click", () => {
        schedule = schedule.filter((s) => s.id !== item.id);
        saveSchedule();
        renderSchedule();
      });

      li.append(check, time, text, del);
      listEl.appendChild(li);
    }

    countEl.textContent = String(schedule.length);
    emptyEl.classList.toggle("visible", schedule.length === 0);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const time = timeInput.value;
    const text = textInput.value.trim();
    if (!time || !text) return;

    schedule.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      time,
      text,
      done: false,
    });
    saveSchedule();
    renderSchedule();
    textInput.value = "";
    textInput.focus();
  });

  renderSchedule();

  // ---------- News ----------
  const newsListEl = document.getElementById("news-list");
  const refreshBtn = document.getElementById("refresh-news");

  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function renderNews() {
    const items = shuffle(MOCK_NEWS).slice(0, 5);
    newsListEl.innerHTML = "";
    for (const n of items) {
      const li = document.createElement("li");
      li.className = "news-item";

      const cat = document.createElement("span");
      cat.className = "news-category";
      cat.textContent = n.category;

      const title = document.createElement("h3");
      title.className = "news-title";
      title.textContent = n.title;

      const summary = document.createElement("p");
      summary.className = "news-summary";
      summary.textContent = n.summary;

      li.append(cat, title, summary);
      newsListEl.appendChild(li);
    }
  }

  refreshBtn.addEventListener("click", renderNews);
  renderNews();
})();
