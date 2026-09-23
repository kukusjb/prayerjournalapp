/* The guide uses the same signed-in session as the existing journal. */
window.PrayerJourneys = (() => {
  const titles = ["Bring It Before God", "Surrender the Outcome", "Listen Through Scripture", "Pray Specifically", "Choose Faith", "Walk in Obedience"];
  const descriptions = [
    "Begin by honestly bringing what is on your heart before God.",
    "Prayer isn't only bringing God the outcome we want. It's trusting Him with the outcome.",
    "God's Word gives us truth to hold onto as we pray. Take time to find a passage that speaks into what you're facing.",
    "Now bring your request before God. In light of what you've read in Scripture, tell Him specifically what you're asking Him to do.",
    "Faith doesn't mean knowing exactly how God will answer. It means trusting who God is while you wait.",
    "Prayer should shape how we live. Consider whether God is calling you to take a step of obedience while you wait."
  ];
  const choices = [
    ["power", "Help me see God's power and faithfulness"],
    ["blessing", "Help me recognize God's blessings, even when they come differently than I expect"],
    ["character", "Grow Christlike character in me"],
    ["prayer", "Deepen my relationship with God through prayer"],
    ["serve", "Help me encourage or serve someone else"], ["other", "Other"]
  ];
  const labels = { in_progress: "In Progress", praying: "Praying", answered: "Answered", in_prayer: "In Progress", waiting: "Praying" };
  const books = "Genesis:50|Exodus:40|Leviticus:27|Numbers:36|Deuteronomy:34|Joshua:24|Judges:21|Ruth:4|1 Samuel:31|2 Samuel:24|1 Kings:22|2 Kings:25|1 Chronicles:29|2 Chronicles:36|Ezra:10|Nehemiah:13|Esther:10|Job:42|Psalms:150|Proverbs:31|Ecclesiastes:12|Song of Solomon:8|Isaiah:66|Jeremiah:52|Lamentations:5|Ezekiel:48|Daniel:12|Hosea:14|Joel:3|Amos:9|Obadiah:1|Jonah:4|Micah:7|Nahum:3|Habakkuk:3|Zephaniah:3|Haggai:2|Zechariah:14|Malachi:4|Matthew:28|Mark:16|Luke:24|John:21|Acts:28|Romans:16|1 Corinthians:16|2 Corinthians:13|Galatians:6|Ephesians:6|Philippians:4|Colossians:4|1 Thessalonians:5|2 Thessalonians:3|1 Timothy:6|2 Timothy:4|Titus:3|Philemon:1|Hebrews:13|James:5|1 Peter:5|2 Peter:3|1 John:5|2 John:1|3 John:1|Jude:1|Revelation:22".split("|").map(value => { const [name, count] = value.split(":"); return [name, Number(count)]; });
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  let passageCache = null, screen = "home", actionBusy = false;
  function normalize(journey) {
    const d = journey.data;
    if (d.formatVersion !== 2) {
      if (!d.title.trim()) d.title = "Untitled prayer journey";
      Object.assign(d, { formatVersion: 2, legacy: true, surrender: "", glorifyOther: "", lessons: "", scriptureReference: "", scriptureBook: "", scriptureChapter: "", scriptureVerses: "",
        status: d.status === "waiting" ? "praying" : d.status === "answered" ? "answered" : "in_progress",
        view: d.status === "in_prayer" ? "guide" : "review" });
    }
    return journey;
  }
  let root, current = null, token = null, timer, pending = null, revision = 0, savedRevision = 0, generation = 0;
  let journeys = [], categories = () => [], onUpdate = () => {};
  function publish(journey) {
    if (journey) journeys = [structuredClone(journey), ...journeys.filter(j => j.id !== journey.id)];
    onUpdate();
  }
  function items() {
    return journeys.filter(j => j.data.frequency !== "none").map(j => ({
      id: j.id, journeyId: j.id, person: j.data.title || "Untitled prayer journey",
      need: j.data.specificRequest || j.data.problem,
      frequency: j.data.frequency || "daily",
      category: categories().includes(j.data.category) ? j.data.category : (categories()[0] || "Uncategorized"),
      lastPrayed: j.data.lastPrayed, answered: j.data.status === "answered",
      answeredDate: j.data.answeredDate, answerNote: j.data.godActions
    }));
  }
  async function open(id) {
    await save();
    const result = await api("/" + id);
    current = normalize(result.journey); revision = savedRevision = 0; screen = current.data.view; render();
  }
  async function markPrayed(id, date) {
    if (current?.id === id) {
      current.data.lastPrayed = date || ""; changed(); await save(); return;
    }
    await save();
    const { journey } = await api("/" + id);
    const result = await api("/" + id, "PUT", { data: {...journey.data, lastPrayed: date || ""}, version: journey.version });
    publish(result.journey);
  }
  function scheduleFields() {
    const wrap = node("div", undefined, "journey-field");
    const label = node("label", "Prayer frequency"), select = node("select");
    label.htmlFor = "journey-frequency"; select.id = label.htmlFor;
    for (const [value, text] of [["daily", "Daily"], ["weekly", "Weekly"], ["none", "Guide only"]]) {
      const option = node("option", text); option.value = value; select.append(option);
    }
    select.value = current.data.frequency || "daily";
    select.onchange = () => { current.data.frequency = select.value; changed(); render(); };
    wrap.append(label, select, node("p", "This same journey appears in Prayer Lists. Changes here update its list entry automatically.", "journey-muted"));
    if (select.value === "weekly") {
      const caption = node("label", "Weekly prayer category"), category = node("select");
      caption.htmlFor = "journey-category"; category.id = caption.htmlFor;
      for (const value of categories()) { const option = node("option", value); option.value = value; category.append(option); }
      category.value = categories().includes(current.data.category) ? current.data.category : categories()[0];
      category.onchange = () => { current.data.category = category.value; changed(); };
      wrap.append(caption, category, node("p", "Weekly prayers appear in Today when their category comes up in your rotation.", "journey-muted"));
    }
    return wrap;
  }
  const dirty = () => revision !== savedRevision;
  const node = (tag, text, className) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  };
  function button(text, action, secondary = false) {
    const b = node("button", text, secondary ? "journey-secondary" : "journey-primary");
    b.type = "button";
    b.onclick = async () => {
      if (actionBusy) return;
      actionBusy = true; b.disabled = true;
      try { await action(); } catch (e) { status(e.message, true); }
      finally { actionBusy = false; b.disabled = false; }
    };
    return b;
  }
  function status(message, error = false) {
    const e = root?.querySelector(".journey-status");
    if (e) { e.textContent = message; e.classList.toggle("journey-error", error); }
  }
  function statusNode() {
    const e = node("p", "", "journey-status");
    e.setAttribute("role", "status"); e.setAttribute("aria-live", "polite");
    return e;
  }
  async function api(path = "", method = "GET", body) {
    const session = token, epoch = generation;
    const response = await fetch("/api/journeys" + path, {
      method, cache: "no-store",
      headers: { Authorization: "Bearer " + session, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json().catch(() => ({}));
    if (epoch !== generation || session !== token) throw new Error("The signed-in account changed. Reopen Guided Prayer.");
    if (!response.ok) throw new Error(result.error || "Could not reach your saved journeys. Please try again.");
    return result;
  }
  function changed() {
    revision++;
    status("Unsaved changes…");
    clearTimeout(timer);
    timer = setTimeout(() => { save().catch(() => {}); }, 1200);
  }
  async function save() {
    clearTimeout(timer);
    if (pending) { await pending; if (dirty()) return save(); return; }
    if (!current || !dirty()) return;
    const target = current, epoch = generation;
    pending = (async () => {
      try {
        while (target === current && epoch === generation && dirty()) {
          const sentRevision = revision;
          const result = await api("/" + target.id, "PUT", { data: structuredClone(target.data), version: target.version });
          target.version = result.journey.version;
          target.updatedAt = result.journey.updatedAt;
          savedRevision = sentRevision;
          publish(result.journey);
        }
        status("Saved to your account");
      } catch (e) {
        status("Not saved. " + e.message + " Your answers are still on this screen. Use Save now to retry.", true);
        throw e;
      }
    })();
    try { await pending; } finally { pending = null; }
  }
  function focusHeading() { root.querySelector("h2")?.focus(); }
  function textField(key, label, type = "textarea") {
    const wrap = node("div", undefined, "journey-field");
    const id = "journey-" + key;
    const caption = node("label", label); caption.htmlFor = id;
    const input = node(type === "textarea" ? "textarea" : "input");
    input.id = id; input.name = key;
    if (type !== "textarea") input.type = type;
    input.value = current.data[key] || "";
    input.maxLength = key === "title" ? 160 : 10000;
    if (type === "textarea") input.rows = 4;
    input.addEventListener("input", () => { current.data[key] = input.value; changed(); });
    wrap.append(caption, input); return wrap;
  }
  function heading(text) { const h = node("h2", text, "serif"); h.tabIndex = -1; return h; }
  function blank() {
    return { formatVersion: 2, legacy: false, view: "guide", surrender: "", glorifyOther: "", lessons: "", scriptureReference: "", scriptureBook: "", scriptureChapter: "", scriptureVerses: "", frequency: "daily", category: categories()[0] || "", lastPrayed: "", title: "", problem: "", questionToGod: "", scripture: "", scriptureApplication: "", specificRequest: "", belief: "", plannedActions: "", godActions: "", nextActions: "", abiding: "", godFirst: "", inWord: "", willingToWait: "", spiritLeading: "", promiseAccepted: "", possibleUses: [], step: 0, status: "in_progress", submittedDate: "", answeredDate: "" };
  }
  async function refresh() {
    await save();
    const result = await api(); journeys = result.journeys; publish();
    current = null; revision = savedRevision = 0;
  }
  async function home() {
    await refresh(); screen = "home";
    root.replaceChildren(heading("Guided Prayer"), node("p", "Slow down, seek God's Word, and walk through your prayer one step at a time."), node("p", "Private to your account. Your reflections save as you go while you are online.", "journey-muted"), statusNode());
    const id = crypto.randomUUID();
    const actions = node("div", undefined, "journey-actions");
    actions.append(button("Begin a Prayer Journey", async () => {
      const result = await api("", "POST", { id, data: blank() });
      current = result.journey; revision = savedRevision = 0; screen = "guide"; publish(current); render();
    }), button("My Prayer Journeys", list, true)); root.append(actions); focusHeading();
  }
  async function list() {
    await refresh(); screen = "list";
    root.replaceChildren(heading("My Prayer Journeys"), node("p", "Return to your prayers, listen again, and remember what God has done."), button("Guided Prayer", home, true), statusNode());
    if (!journeys.length) root.append(node("p", "Your prayer journeys will appear here. Begin a prayer whenever you are ready.", "journey-muted"));
    for (const state of ["In Progress", "Praying", "Answered"]) {
      const group = journeys.filter(j => labels[j.data.status] === state);
      if (!group.length) continue;
      root.append(node("h3", state, "serif"));
      for (const journey of group) {
        const d = journey.data, card = node("article", undefined, "journey-card");
        card.append(node("span", state, "journey-badge"), node("h4", d.title || "Untitled prayer journey", "serif"), node("p", "Started " + new Date(journey.createdAt).toLocaleDateString(), "journey-muted"));
        if (d.submittedDate) card.append(node("p", "Committed " + d.submittedDate, "journey-muted"));
        if (d.scriptureReference) card.append(node("p", d.scriptureReference + " · ESV", "journey-reference"));
        if (d.answeredDate && state === "Answered") card.append(node("p", "Answered " + d.answeredDate, "journey-muted"));
        const actions = node("div", undefined, "journey-actions");
        actions.append(button(state === "In Progress" ? "Continue Journey" : state === "Answered" ? "Remember This Prayer" : "Continue Praying", () => open(journey.id), true));
        if (state === "Praying") actions.append(button("Record an Answer", async () => { await open(journey.id); await answer(); }));
        card.append(actions); root.append(card);
      }
    }
    focusHeading();
  }
  function shell(title, description) {
    root.replaceChildren(button("My Prayer Journeys", list, true), heading(title));
    if (description) root.append(node("p", description));
    root.append(statusNode()); status(dirty() ? "Unsaved changes…" : "Saved to your account");
  }
  function reflection(label, value) {
    const section = node("section", undefined, "journey-reflection");
    section.append(node("h3", label, "serif"), node("p", value || "Left open for reflection.", "journey-answer"));
    return section;
  }
  function scripturePanel(reference) {
    const pane = node("section", undefined, "journey-scripture verse-display");
    pane.setAttribute("aria-label", "Selected Scripture");
    pane.append(node("h3", reference ? reference + " · ESV" : "A passage to pray with", "serif"));
    if (!reference) { pane.append(node("p", "Choose a passage above. You can also continue and return to Scripture later.")); return pane; }
    const text = node("p", "Loading Scripture…", "journey-passage"); text.setAttribute("aria-live", "polite"); pane.append(text);
    const link = node("a", "Read on ESV.org"); link.href = "https://www.esv.org/" + encodeURIComponent(reference) + "/"; link.target = "_blank"; link.rel = "noopener noreferrer"; pane.append(link);
    const load = async () => {
      text.textContent = "Loading Scripture…";
      try { const result = await lookup(reference); if (pane.isConnected) text.textContent = result.passages[0].trim(); }
      catch (e) { if (pane.isConnected) text.textContent = "Scripture is unavailable right now. Your saved reference and reflections are safe. " + e.message; }
    };
    pane.append(button("Reload Scripture", load, true));
    // Queue until this panel has been attached to the current screen.
    Promise.resolve().then(load); return pane;
  }
  async function lookup(reference) {
    if (passageCache?.reference === reference) return passageCache.result;
    const epoch = generation;
    const response = await fetch("/api/esv?guided=1&q=" + encodeURIComponent(reference), { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => ({}));
    if (epoch !== generation) throw new Error("The signed-in account changed.");
    if (!response.ok || !result.passages?.[0]) throw new Error(result.error || "Please check the book, chapter, and verses, then try again.");
    passageCache = { reference, result }; return result;
  }
  function scripturePicker() {
    const d = current.data, target = current, wrap = node("div", undefined, "journey-field");
    const bookLabel = node("label", "Book"), book = node("select"); book.id = "journey-book"; bookLabel.htmlFor = book.id;
    const empty = node("option", "Choose a book"); empty.value = ""; book.append(empty);
    for (const [name] of books) { const o = node("option", name); o.value = name; book.append(o); }
    book.value = d.scriptureBook;
    const chapterLabel = node("label", "Chapter"), chapter = node("select"); chapter.id = "journey-chapter"; chapterLabel.htmlFor = chapter.id;
    const fillChapters = () => {
      chapter.replaceChildren(); const empty = node("option", "Choose a chapter"); empty.value = ""; chapter.append(empty);
      const count = books.find(([name]) => name === book.value)?.[1] || 0;
      for (let i=1; i<=count; i++) { const o = node("option", String(i)); o.value = String(i); chapter.append(o); }
      chapter.value = d.scriptureChapter; chapter.disabled = !count;
    }; fillChapters();
    const verseLabel = node("label", "Verse or verse range"), verses = node("input"); verses.type = "text"; verses.id = "journey-verses"; verseLabel.htmlFor = verses.id; verses.placeholder = "For example, 6–7"; verses.maxLength = 12; verses.value = d.scriptureVerses;
    const hint = node("p", "Choose a short passage of up to 20 verses in one chapter, then select Look up Scripture. For short books, choose a smaller passage.", "journey-muted"); hint.id = "journey-verse-hint"; verses.setAttribute("aria-describedby", hint.id);
    book.onchange = () => { d.scriptureBook = book.value; d.scriptureChapter = ""; fillChapters(); changed(); };
    chapter.onchange = () => { d.scriptureChapter = chapter.value; changed(); };
    verses.oninput = () => { d.scriptureVerses = verses.value; changed(); };
    wrap.append(bookLabel, book, chapterLabel, chapter, verseLabel, verses, hint, button("Look up Scripture", async () => {
      const range = verses.value.trim().replace(/[–—]/g, "-");
      if (!book.value || !chapter.value || !/^\d{1,3}(-\d{1,3})?$/.test(range)) throw new Error("Choose a book, chapter, and verse or verse range, such as 6–7.");
      const start = Number(range.split("-")[0]), end = Number(range.split("-")[1] || start);
      if (start < 1 || end < start || end - start >= 20) throw new Error("Choose a passage of 1 to 20 verses in order.");
      const reference = book.value + " " + chapter.value + ":" + range;
      const selection = [d.scriptureBook, d.scriptureChapter, d.scriptureVerses].join("|");
      status("Looking up Scripture…"); const result = await lookup(reference);
      if (current !== target || screen !== "guide" || current.data.step !== 3 || selection !== [d.scriptureBook, d.scriptureChapter, d.scriptureVerses].join("|")) return;
      d.scriptureReference = result.canonical || reference;
      passageCache = {reference: d.scriptureReference, result}; changed(); await save(); render();
    }, true)); return wrap;
  }
  function render() {
    if (!current) return;
    const d = current.data;
    if (screen === "review") return review();
    if (screen === "answer") return renderAnswer();
    screen = "guide";
    shell(d.step === 0 ? "A name for this prayer" : titles[d.step-1], d.step === 0 ? "Give this prayer a short name so you can easily return to it later." : descriptions[d.step-1]);
    if (d.step === 0) root.append(textField("title", "A name for this prayer", "text"), scheduleFields());
    else {
      const progress = node("progress"); progress.max = 6; progress.value = d.step; progress.setAttribute("aria-label", "Stage " + d.step + " of 6");
      root.append(node("p", "Stage " + d.step + " of 6", "journey-muted"), progress);
    }
    if (d.step === 1) {
      root.append(textField("problem", "What's weighing on your heart right now?"));
      const set = node("fieldset", undefined, "journey-field"); set.append(node("legend", "How can my prayer glorify God?"));
      const other = textField("glorifyOther", "Your own response"); other.hidden = !d.possibleUses.includes("other");
      for (const [value, text] of choices) {
        const label = node("label", undefined, "journey-check"), input = node("input"); input.type = "checkbox"; input.checked = d.possibleUses.includes(value);
        input.onchange = () => { d.possibleUses = input.checked ? [...d.possibleUses, value] : d.possibleUses.filter(v => v !== value); other.hidden = !d.possibleUses.includes("other"); changed(); };
        label.append(input, document.createTextNode(text)); set.append(label);
      }
      root.append(set, other);
    }
    if (d.step === 2) root.append(textField("surrender", "What would it look like to trust God's will in this situation?"));
    if (d.step === 3) root.append(scripturePicker(), scripturePanel(d.scriptureReference), textField("scriptureApplication", "What does this Scripture reveal about God, your situation, or how you should respond?"));
    if (d.step === 4) root.append(textField("specificRequest", "What are you asking God to do?"));
    if (d.step === 5) root.append(textField("belief", "What truth about God's character or promises will you trust while you wait?"));
    if (d.step === 6) root.append(textField("plannedActions", "Is there something Scripture is calling you to do now?"), textField("submittedDate", "Date committed to prayer", "date"));
    const actions = node("div", undefined, "journey-actions");
    actions.append(button("Back", d.step === 0 ? list : () => move(-1), true), button("Save now", save, true), button(d.step === 6 ? "Save Prayer Journey" : "Continue", d.step === 6 ? complete : () => move(1)));
    root.append(actions, node("p", "You may leave reflections open and return to them later. Wait for “Saved to your account” before closing.", "journey-muted")); focusHeading();
  }
  async function move(delta) {
    if (current.data.step === 0 && delta > 0 && !current.data.title.trim()) { root.querySelector("#journey-title")?.focus(); throw new Error("Give this prayer a name so you can find it later."); }
    await save(); current.data.step += delta;
    if (current.data.step === 6 && !current.data.submittedDate) current.data.submittedDate = today();
    changed(); render(); await save();
  }
  async function complete() {
    const d = current.data;
    if (!d.title.trim() || !d.submittedDate) throw new Error("Add a prayer name and date committed to prayer before finishing.");
    await save(); d.status = d.status === "answered" ? "answered" : "praying"; d.view = "review"; changed(); await save(); screen = "review";
    shell("Your prayer journey is saved", "Keep bringing this prayer before God. You can return to Scripture, continue praying, and record what God teaches you along the way.");
    root.append(button("Continue Praying", review)); focusHeading();
  }
  function review() {
    screen = "review"; const d = current.data;
    shell(d.title || "Prayer Journey", labels[d.status]);
    if (d.scriptureReference) root.append(scripturePanel(d.scriptureReference));
    const glorify = choices.filter(([key]) => d.possibleUses.includes(key)).map(([key, label]) => key === "other" ? d.glorifyOther || label : label).join("\n");
    for (const [label, value] of [["What's on your heart", d.problem], ["Glorifying God", glorify], ["Surrendering the outcome", d.surrender], ["Scripture reflection", d.scriptureApplication], ["Your specific prayer", d.specificRequest], ["Truth you are trusting", d.belief], ["Walking in obedience", d.plannedActions], ["Date committed to prayer", d.submittedDate]]) root.append(reflection(label, value));
    if (d.legacy) {
      const earlier = node("details", undefined, "journey-reflection"); earlier.append(node("summary", "Earlier journey notes"));
      for (const [key, label] of [["scripture", "Earlier Scripture notes"], ["questionToGod", "Earlier prayer reflection"], ["abiding", "Abiding"], ["godFirst", "Turning to God"], ["inWord", "Time in the Word"], ["willingToWait", "Waiting"], ["spiritLeading", "Seeking the Spirit's leading"], ["promiseAccepted", "Earlier faith response"]]) if (d[key]) earlier.append(reflection(label, d[key]));
      root.append(earlier);
    }
    if (d.status === "answered") {
      root.append(node("h3", "God Answered", "serif"));
      for (const [label, value] of [["How God answered", d.godActions], ["What God taught you", d.lessons], ["Your next step", d.nextActions], ["Date answered", d.answeredDate]]) root.append(reflection(label, value));
    }
    root.append(scheduleFields(), button("Save now", save, true));
    const actions = node("div", undefined, "journey-actions");
    actions.append(button("Edit Journey", async () => { await save(); d.step = 0; d.view = "guide"; screen = "guide"; changed(); await save(); render(); }, true));
    actions.append(button(d.status === "answered" ? "Edit Answer Reflection" : "Record an Answer", answer)); root.append(actions); focusHeading();
  }
  async function answer() {
    await save(); const d = current.data; d.view = "answer"; if (!d.answeredDate) d.answeredDate = today();
    screen = "answer"; changed(); renderAnswer(); await save();
  }
  function renderAnswer() {
    shell("God Answered", "Take time to remember what God has done and what He has taught you through this prayer.");
    root.append(textField("godActions", "How did God answer this prayer?"), textField("lessons", "What has God taught you through this journey?"), textField("nextActions", "Is there a next step God is calling you to take?"), textField("answeredDate", "Date answered", "date"));
    const actions = node("div", undefined, "journey-actions");
    actions.append(button("Back", async () => { await save(); current.data.view = "review"; changed(); await save(); review(); }, true), button("Save now", save, true), button("Save Answer", async () => {
      const d = current.data;
      if (!d.godActions.trim() || !d.answeredDate) throw new Error("Add how God answered and the date answered. Other reflections can be left open.");
      await save(); d.status = "answered"; d.view = "review"; changed(); await save(); review();
    })); root.append(actions); focusHeading();
  }
  function reset() {
    generation++; clearTimeout(timer); token = null; current = null; journeys = []; passageCache = null; screen = "home"; publish();
    revision = savedRevision = 0; root?.replaceChildren();
  }
  async function start(session, options = {}) {
    categories = options.categories || (() => []); onUpdate = options.onUpdate || (() => {});
    reset(); token = session; root = document.getElementById("journeyRoot");
    root.replaceChildren(heading("Guided Prayer"), statusNode(), button("Load Guided Prayer", home));
    try { await home(); } catch (e) { status(e.message, true); }
  }
  window.addEventListener("beforeunload", e => { if (dirty() || pending) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save().catch(() => {}); });
  return { start, reset, save, items, open, markPrayed, async exportData() { await save(); return (await api()).journeys; } };
})();
