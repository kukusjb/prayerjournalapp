/* The guide uses the same signed-in session as the existing journal. */
window.PrayerJourneys = (() => {
  const titles = ["Name This Prayer", "Bring It Before God", "Surrender the Outcome", "Listen Through Scripture", "Pray Specifically", "Choose Faith", "Walk in Obedience"];
  const descriptions = [
    "Give this prayer a short name so you can easily return to it later.",
    "Begin by honestly bringing what is on your heart before God.",
    "Prayer isn't only bringing God the outcome we want. It's trusting Him with the outcome.",
    "God's Word gives us truth to hold onto as we pray. Take time to find a passage that speaks into what you're facing.",
    "Now bring your request before God. In light of what you've read in Scripture, tell Him specifically what you're asking Him to do.",
    "Faith doesn't mean knowing exactly how God will answer. It means trusting who God is while you wait.",
    "Prayer should shape how we live. Consider whether God is calling you to take a step of obedience while you wait."
  ];
  const choices = [["power", "Help me see God's power and faithfulness"], ["blessing", "Help me recognize God's blessings, even when they come differently than I expect"], ["character", "Grow Christlike character in me"], ["prayer", "Deepen my relationship with God through prayer"], ["serve", "Help me encourage or serve someone else"], ["other", "Other"]];
  const labels = { in_progress: "In Progress", praying: "Praying", answered: "Answered", in_prayer: "In Progress", waiting: "Praying" };
  const books = "Genesis:50|Exodus:40|Leviticus:27|Numbers:36|Deuteronomy:34|Joshua:24|Judges:21|Ruth:4|1 Samuel:31|2 Samuel:24|1 Kings:22|2 Kings:25|1 Chronicles:29|2 Chronicles:36|Ezra:10|Nehemiah:13|Esther:10|Job:42|Psalms:150|Proverbs:31|Ecclesiastes:12|Song of Solomon:8|Isaiah:66|Jeremiah:52|Lamentations:5|Ezekiel:48|Daniel:12|Hosea:14|Joel:3|Amos:9|Obadiah:1|Jonah:4|Micah:7|Nahum:3|Habakkuk:3|Zephaniah:3|Haggai:2|Zechariah:14|Malachi:4|Matthew:28|Mark:16|Luke:24|John:21|Acts:28|Romans:16|1 Corinthians:16|2 Corinthians:13|Galatians:6|Ephesians:6|Philippians:4|Colossians:4|1 Thessalonians:5|2 Thessalonians:3|1 Timothy:6|2 Timothy:4|Titus:3|Philemon:1|Hebrews:13|James:5|1 Peter:5|2 Peter:3|1 John:5|2 John:1|3 John:1|Jude:1|Revelation:22".split("|").map(v => { const [name, count] = v.split(":"); return [name, Number(count)]; });
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  let busy = false, screen = "home", passageCache = null;
  const chapterCounts = new Map();
  const versionMessage = "Guided Prayer is updating. The page and server versions do not match. Keep any unsaved text, wait for the full deployment, then reload.";
  function upgrade(journey) {
    const d = journey.data;
    if (d.formatVersion === 3) return journey;
    const previous = d.formatVersion;
    const range = (d.scriptureVerses || "").split(/[–—-]/);
    Object.assign(d, {
      formatVersion: 3, legacy: previous === 2 ? !!d.legacy : true,
      step: previous === 2 ? d.step + 1 : (!d.title.trim() ? 1 : d.step + 1),
      status: d.status === "in_prayer" ? "in_progress" : d.status === "waiting" ? "praying" : d.status,
      view: d.view || (["in_prayer", "in_progress"].includes(d.status) ? "guide" : "review"),
      surrender: d.surrender || "", glorifyOther: d.glorifyOther || "", lessons: d.lessons || "",
      scriptureReference: d.scriptureReference || "", scriptureBook: d.scriptureBook || "", scriptureChapter: d.scriptureChapter || "",
      scriptureStart: range[0] || "", scriptureEnd: range[1] || ""
    });
    if (d.status !== "in_progress" && !d.title.trim()) d.title = "Untitled prayer journey";
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
      need: j.data.specificRequest || j.data.questionToGod || j.data.problem,
      frequency: j.data.frequency || "daily",
      category: categories().includes(j.data.category) ? j.data.category : (categories()[0] || "Uncategorized"),
      lastPrayed: j.data.lastPrayed, answered: j.data.status === "answered",
      answeredDate: j.data.answeredDate, answerNote: j.data.godActions
    }));
  }
  async function open(id) {
    await save();
    const result = await api("/" + id);
    current = upgrade(result.journey); revision = savedRevision = 0; screen = current.data.view; render();
  }
  async function markPrayed(id, date) {
    if (current?.id === id) {
      current.data.lastPrayed = date || ""; changed(); await save(); return;
    }
    await save();
    const resultRead = await api("/" + id);
    const journey = upgrade(resultRead.journey);
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
      if (busy) return;
      busy = true; b.disabled = true;
      try { await action(); } catch (e) { status(e.message, true); }
      finally { busy = false; b.disabled = false; }
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
      headers: { Authorization: "Bearer " + session, "Content-Type": "application/json", ...(method === "DELETE" ? { "If-Match": String(body.version) } : {}) },
      ...(body && method !== "DELETE" ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json().catch(() => ({}));
    if (epoch !== generation || session !== token) throw new Error("The signed-in account changed. Reopen Guided Prayer.");
    if (!response.ok) {
      const error = new Error((["Invalid step.", "Invalid status.", "Method not allowed."].includes(result.error) ? versionMessage : result.error) || "Could not reach your saved journeys. Please try again.");
      error.status = response.status; throw error;
    }
    if (result.journeyFormat !== 3) throw new Error(versionMessage);
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
    return { formatVersion: 3, legacy: false, view: "guide", surrender: "", glorifyOther: "", lessons: "", scriptureReference: "", scriptureBook: "", scriptureChapter: "", scriptureStart: "", scriptureEnd: "", frequency: "daily", category: categories()[0] || "", lastPrayed: "", title: "", problem: "", questionToGod: "", scripture: "", scriptureApplication: "", specificRequest: "", belief: "", plannedActions: "", godActions: "", nextActions: "", abiding: "", godFirst: "", inWord: "", willingToWait: "", spiritLeading: "", promiseAccepted: "", possibleUses: [], step: 1, status: "in_progress", submittedDate: "", answeredDate: "" };
  }
  function confirmDelete(journey) {
    return new Promise(resolve => {
      const dialog = node("dialog", undefined, "journey-delete-dialog");
      dialog.setAttribute("aria-labelledby", "journey-delete-title");
      dialog.setAttribute("aria-describedby", "journey-delete-description");
      const title = node("h2", "Delete this prayer journey?", "serif"); title.id = "journey-delete-title";
      const description = node("p", "This will permanently delete “" + (journey.data.title || "Untitled prayer") + "” and its reflections. Its linked Daily or Weekly entry will also disappear. This cannot be undone."); description.id = "journey-delete-description";
      const feedback = node("p", "", "journey-status journey-error"); feedback.setAttribute("role", "alert");
      let busy = false;
      const cancel = node("button", "Cancel", "journey-secondary"); cancel.type = "button";
      const remove = node("button", "Delete permanently", "journey-delete-button"); remove.type = "button";
      const close = () => { dialog.close(); dialog.remove(); resolve(); };
      cancel.onclick = close;
      dialog.addEventListener("cancel", event => { event.preventDefault(); if (!busy) close(); });
      remove.onclick = async () => {
        if (busy) return;
        busy = true; cancel.disabled = remove.disabled = true; feedback.textContent = "Deleting…";
        try {
          try { await api("/" + journey.id, "DELETE", { version: journey.version }); }
          catch (e) { if (e.status !== 404) throw e; }
          journeys = journeys.filter(j => j.id !== journey.id); publish();
          // Update locally even if a later refresh would fail; never leave a deleted row on screen.
          const card = root.querySelector('[data-journey-id="' + journey.id + '"]'); card?.remove();
          if (!journeys.length) root.append(node("p", "Your prayer journeys will appear here. Begin a prayer whenever you are ready.", "journey-muted"));
          close(); status("Prayer journey deleted."); focusHeading();
        } catch (e) { feedback.textContent = "Not deleted. " + e.message; }
        finally { busy = false; cancel.disabled = remove.disabled = false; }
      };
      const actions = node("div", undefined, "journey-actions"); actions.append(cancel, remove);
      dialog.append(title, description, feedback, actions); root.append(dialog); dialog.showModal(); cancel.focus();
    });
  }
  async function refresh() {
    await save(); const result = await api(); journeys = result.journeys; publish();
    current = null; revision = savedRevision = 0;
  }
  async function home() {
    await refresh(); screen = "home";
    root.replaceChildren(heading("Guided Prayer"), node("p", "Slow down, seek God's Word, and walk through your prayer one step at a time."), node("p", "Private to your account. Your reflections save as you go while you are online.", "journey-muted"), statusNode());
    const id = crypto.randomUUID(), actions = node("div", undefined, "journey-actions");
    actions.append(button("Begin a Prayer Journey", async () => {
      const result = await api("", "POST", { id, data: blank() });
      current = result.journey; revision = savedRevision = 0; screen = "guide"; publish(current); render();
    }), button("My Prayer Journeys", list, true)); root.append(actions); focusHeading();
  }
  async function list() {
    await refresh(); screen = "list";
    root.replaceChildren(heading("My Prayer Journeys"), node("p", "Return to your prayers and remember what God has done."), button("Guided Prayer", home, true), statusNode());
    if (!journeys.length) root.append(node("p", "Your prayer journeys will appear here. Begin a prayer whenever you are ready.", "journey-muted"));
    for (const journey of journeys) {
      const d = journey.data, state = labels[d.status] || "In Progress";
      const card = node("article", undefined, "journey-card"); card.dataset.journeyId = journey.id;
      card.append(node("span", state, "journey-badge"), node("h4", d.title || "Untitled prayer", "serif"), node("p", "Started " + new Date(journey.createdAt).toLocaleDateString(undefined, {month:"long", day:"numeric", year:"numeric"}), "journey-muted"));
      if (d.submittedDate) card.append(node("p", "Committed " + d.submittedDate, "journey-muted"));
      if (d.scriptureReference) card.append(node("p", d.scriptureReference + " · ESV", "journey-reference"));
      if (d.status === "answered") card.append(node("p", "Answered " + d.answeredDate, "journey-muted"));
      const actions = node("div", undefined, "journey-actions");
      actions.append(button(state === "In Progress" ? "Continue Journey" : state === "Answered" ? "Remember This Prayer" : "Continue Praying", () => open(journey.id), true));
      if (state === "Praying") actions.append(button("Record an Answer", async () => { await open(journey.id); await answer(); }));
      const remove = button("Delete Journey", () => confirmDelete(journey), true); remove.classList.add("journey-delete-link");
      card.append(actions, remove); root.append(card);
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
    section.append(node("h3", label, "serif"), node("p", value || "Left open for reflection.", "journey-answer")); return section;
  }
  async function fetchPassage(reference) {
    const epoch = generation;
    const response = await fetch("/api/esv?guided=1&q=" + encodeURIComponent(reference), { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => ({}));
    if (epoch !== generation) throw new Error("The signed-in account changed.");
    if (!response.ok || !result.passages?.[0]) throw new Error(result.error || "Scripture could not be loaded. Please try again.");
    return result;
  }
  function scripturePanel(reference) {
    const pane = node("section", undefined, "journey-scripture"); pane.setAttribute("aria-label", "Selected Scripture");
    pane.append(node("h3", reference ? reference + " · ESV" : "A passage to pray with", "serif"));
    if (!reference) { pane.append(node("p", "Choose a passage above, or return to Scripture later.")); return pane; }
    const text = node("p", "Loading Scripture…", "journey-passage"); text.setAttribute("aria-live", "polite"); pane.append(text);
    const load = async (force = false) => {
      text.textContent = "Loading Scripture…";
      try {
        const result = !force && passageCache?.reference === reference ? passageCache.result : await fetchPassage(reference);
        if (!pane.isConnected) return;
        passageCache = {reference, result}; text.textContent = result.passages[0].trim();
      } catch (e) { if (pane.isConnected) text.textContent = "Your reference and reflections are saved. " + e.message; }
    };
    const link = node("a", "Read on ESV.org"); link.href = "https://www.esv.org/" + encodeURIComponent(reference) + "/"; link.target = "_blank"; link.rel = "noopener noreferrer";
    pane.append(link, button("Reload Scripture", () => load(true), true)); Promise.resolve().then(() => load()); return pane;
  }
  function scriptureHelp() {
    const target=current, epoch=generation, section=node("details",undefined,"journey-field journey-helper");
    section.append(node("summary","Need help finding Scripture?"));
    section.append(node("p","Share a little about what you’re praying through, and I can suggest passages to read and reflect on."));
    const label=node("label","What would you like help finding Scripture for?"), input=node("textarea");
    label.htmlFor="scripture-help-topic"; input.id=label.htmlFor; input.rows=4; input.maxLength=1000;
    input.placeholder="I’m praying for a brother in Christ facing health challenges.";
    const notice=node("p","When you select Find Scripture, only this text is sent to Google Gemini. Leave out names and private medical details. This search is not saved in your journey.","journey-muted");
    notice.id="scripture-help-notice"; input.setAttribute("aria-describedby",notice.id);
    const info=node("p","","journey-status"), results=node("div"); info.setAttribute("role","status");
    const find=button("Find Scripture",async()=>{
      if(input.value.trim().length<5){info.textContent="Please describe your topic in at least five characters.";input.focus();return;}
      info.textContent="Finding passages to reflect on…";results.replaceChildren();
      try {
        const response=await fetch("/api/scripture-help",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(25000),headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({topic:input.value.trim()})});
        const data=await response.json();
        if(epoch!==generation || current!==target || !section.isConnected)return;
        if(!response.ok)throw new Error(data.error||"Suggestions are unavailable. Please use the passage picker below.");
        if(!Array.isArray(data.suggestions))throw new Error("Please reload the page and try again.");
        info.textContent="AI suggestions can be mistaken. Read each passage in context as you reflect.";
        for(const suggestion of data.suggestions){
          const card=node("div",undefined,"journey-suggestion"), message=node("p");message.setAttribute("role","status");
          card.append(node("h4",suggestion.reference,"serif"),node("p",suggestion.reason));
          let passage=null;
          const use=button("Use This Scripture",async()=>{
            if(!passage)return;
            const parts=suggestion.reference.match(/^(.+) (\d+):(\d+)(?:-(\d+))?$/);
            if(!parts || !books.some(([name])=>name===parts[1])){message.textContent="Please select this reference with the passage picker below.";return;}
            if(epoch!==generation || current!==target)return;
            Object.assign(target.data,{scriptureReference:passage.canonical||suggestion.reference,scriptureBook:parts[1],scriptureChapter:parts[2],scriptureStart:parts[3],scriptureEnd:parts[4]||""});
            passageCache={reference:target.data.scriptureReference,result:passage};changed();await save();render();
          });use.hidden=true;
          card.append(button("Read Passage",async()=>{
            message.textContent="Loading ESV Scripture…";
            try{
              const loaded=await fetchPassage(suggestion.reference);
              if(epoch!==generation || current!==target || !card.isConnected)return;
              passage=loaded;message.textContent=loaded.passages[0].trim();message.className="journey-passage";use.hidden=false;
            }catch{if(card.isConnected)message.textContent="We couldn't verify this passage through ESV. Try again or choose a passage below.";}
          },true),message,use);results.append(card);
        }
      }catch(e){if(epoch===generation && section.isConnected)info.textContent=e.name==="TimeoutError"?"Suggestions took too long. Please try again or use the passage picker below.":e.message;}
    });
    section.append(label,input,notice,find,info,results);return section;
  }
  function scripturePicker() {
    const d = current.data, target = current, wrap = node("div", undefined, "journey-field");
    wrap.append(node("h3", "Find a Scripture", "serif"));
    function select(label, id) {
      const caption = node("label", label), control = node("select"); control.id = id; caption.htmlFor = id; wrap.append(caption, control); return control;
    }
    function options(control, entries, placeholder) {
      control.replaceChildren(); const empty = node("option", placeholder); empty.value = ""; control.append(empty);
      for (const [value, label] of entries) { const option = node("option", label); option.value = String(value); control.append(option); }
    }
    const book = select("Book", "journey-book"), chapter = select("Chapter", "journey-chapter"), start = select("Verse", "journey-start"), end = select("Through verse (optional)", "journey-end");
    options(book, books.map(([name]) => [name, name]), "Choose a book"); book.value = d.scriptureBook;
    let verseCount = 0, requestNumber = 0;
    const numbers = (first, last) => Array.from({length: Math.max(0,last-first+1)}, (_, i) => [first+i, String(first+i)]);
    function chapters() {
      const count = books.find(([name]) => name === book.value)?.[1] || 0;
      options(chapter, numbers(1,count), "Choose a chapter"); chapter.value = d.scriptureChapter; chapter.disabled = !count;
    }
    function ends() {
      options(end, numbers(Number(start.value),verseCount), "Same verse"); end.value = d.scriptureEnd; end.disabled = !start.value;
    }
    const info = node("p", "Choose a book and chapter to load its verse choices.", "journey-muted"); info.setAttribute("aria-live", "polite");
    async function loadVerses() {
      const sequence = ++requestNumber, key = book.value + " " + chapter.value;
      start.disabled = end.disabled = true; options(start, [], "Choose a verse"); options(end, [], "Same verse");
      if (!book.value || !chapter.value) return;
      info.textContent = "Loading verse choices…";
      try {
        let count = chapterCounts.get(key);
        if (!count) {
          const result = await fetchPassage(key + ":1");
          const range = result.passage_meta?.[0]?.chapter_start;
          count = range?.[1] % 1000;
          if (!Number.isInteger(count) || count < 1 || count > 176) throw new Error("Verse choices are unavailable. Please retry.");
          chapterCounts.set(key,count);
        }
        if (sequence !== requestNumber || current !== target || !wrap.isConnected) return;
        verseCount = count; options(start,numbers(1,count),"Choose a verse"); start.disabled=false; start.value=d.scriptureStart; ends();
        info.textContent = "Choose a short passage, then select Show Scripture. Up to 20 verses; smaller limits apply to short books.";
      } catch (e) { if (sequence === requestNumber && wrap.isConnected) info.textContent = e.message; }
    }
    book.onchange = () => { d.scriptureBook=book.value; d.scriptureChapter=d.scriptureStart=d.scriptureEnd=""; chapters(); changed(); loadVerses(); };
    chapter.onchange = () => { d.scriptureChapter=chapter.value; d.scriptureStart=d.scriptureEnd=""; changed(); loadVerses(); };
    start.onchange = () => { d.scriptureStart=start.value; d.scriptureEnd=""; ends(); changed(); };
    end.onchange = () => { d.scriptureEnd=end.value; changed(); };
    chapters(); wrap.append(info, button("Retry verse choices",loadVerses,true), button("Show Scripture",async () => {
      if (!book.value || !chapter.value || !start.value) throw new Error("Choose a book, chapter, and verse first.");
      const reference = book.value + " " + chapter.value + ":" + start.value + (end.value && end.value !== start.value ? "-" + end.value : "");
      const selection = [d.scriptureBook,d.scriptureChapter,d.scriptureStart,d.scriptureEnd].join("|");
      status("Looking up Scripture…"); const result = await fetchPassage(reference);
      if (current !== target || !wrap.isConnected || selection !== [d.scriptureBook,d.scriptureChapter,d.scriptureStart,d.scriptureEnd].join("|")) return;
      d.scriptureReference = result.canonical || reference; passageCache = {reference:d.scriptureReference,result}; changed(); await save(); render();
    }));
    Promise.resolve().then(loadVerses); return wrap;
  }
  function render() {
    if (!current) return;
    if (screen === "review") return review();
    if (screen === "answer") return renderAnswer();
    const d = current.data; screen = "guide";
    shell(titles[d.step-1], descriptions[d.step-1]);
    const progress = node("progress"); progress.max=7; progress.value=d.step; progress.setAttribute("aria-label", "Step " + d.step + " of 7");
    root.append(node("p", "Step " + d.step + " of 7", "journey-muted"), progress);
    if (d.step === 1) root.append(textField("title", "A name for this prayer", "text"), scheduleFields());
    if (d.step === 2) {
      root.append(textField("problem", "What’s weighing on your heart right now?"));
      const set = node("fieldset", undefined, "journey-field"); set.append(node("legend", "How can my prayer glorify God?"));
      const other = textField("glorifyOther", "Your own response"); other.hidden = !d.possibleUses.includes("other");
      for (const [value, text] of choices) {
        const label=node("label", undefined, "journey-check"), input=node("input"); input.type="checkbox"; input.checked=d.possibleUses.includes(value);
        input.onchange=()=>{d.possibleUses=input.checked?[...d.possibleUses,value]:d.possibleUses.filter(v=>v!==value);other.hidden=!d.possibleUses.includes("other");changed();};
        label.append(input,document.createTextNode(text));set.append(label);
      }
      root.append(set,other);
    }
    if (d.step === 3) root.append(textField("surrender", "What would it look like to trust God's will in this situation?"));
    if (d.step === 4) root.append(scriptureHelp(), scripturePicker(), scripturePanel(d.scriptureReference), textField("scriptureApplication", "What does this Scripture reveal about God, your situation, or how you should respond?"));
    if (d.step === 5) root.append(textField("specificRequest", "What are you asking God to do?"));
    if (d.step === 6) root.append(textField("belief", "What truth about God's character or promises will you trust while you wait?"));
    if (d.step === 7) root.append(textField("plannedActions", "Is there something Scripture is calling you to do now?"),textField("submittedDate", "Date committed to prayer", "date"));
    const actions=node("div",undefined,"journey-actions");
    actions.append(button("Back",d.step===1?list:()=>move(-1),true),button("Save now",save,true),button(d.step===7?"Save Prayer Journey":"Continue",d.step===7?complete:()=>move(1)));
    root.append(actions,node("p","You can leave reflections open and return later. Wait for “Saved to your account” before closing.","journey-muted"));focusHeading();
  }
  async function move(delta) {
    if (delta>0 && current.data.step===1 && !current.data.title.trim()) throw new Error("Give this prayer a name so you can find it later.");
    await save();current.data.step+=delta;
    if(current.data.step===7 && !current.data.submittedDate)current.data.submittedDate=today();
    changed();render();await save();
  }
  async function complete() {
    const d=current.data;
    if(!d.title.trim() || !d.submittedDate)throw new Error("Add a prayer name and date committed to prayer.");
    await save();d.status=d.status==="answered"?"answered":"praying";d.view="review";changed();await save();screen="review";
    shell("Your prayer journey is saved","Keep bringing this prayer before God. Return to His Word, continue praying, and record what He teaches you along the way.");
    root.append(button("Continue Praying",review));focusHeading();
  }
  function review() {
    screen="review";const d=current.data;shell(d.title || "Prayer Journey",labels[d.status]);
    if(d.scriptureReference)root.append(scripturePanel(d.scriptureReference));
    const glorify=choices.filter(([key])=>d.possibleUses.includes(key)).map(([key,label])=>key==="other"?d.glorifyOther||label:label).join("\n");
    for(const [label,value] of [["What's on your heart",d.problem],["Glorifying God",glorify],["Surrendering the outcome",d.surrender],["Scripture reflection",d.scriptureApplication],["Your specific prayer",d.specificRequest],["Truth you are trusting",d.belief],["Walking in obedience",d.plannedActions],["Date committed to prayer",d.submittedDate]])root.append(reflection(label,value));
    if(d.legacy){
      const notes=node("details",undefined,"journey-reflection");notes.append(node("summary","Earlier journey notes"));
      for(const [key,label] of [["scripture","Earlier Scripture notes"],["questionToGod","Earlier prayer reflection"],["abiding","Abiding"],["godFirst","Turning to God"],["inWord","Time in the Word"],["willingToWait","Waiting"],["spiritLeading","Seeking the Spirit's leading"],["promiseAccepted","Earlier faith response"]])if(d[key])notes.append(reflection(label,d[key]));
      root.append(notes);
    }
    if(d.status==="answered"){
      root.append(node("h3","God Answered","serif"));
      for(const [label,value] of [["How God answered",d.godActions],["What God taught you",d.lessons],["Your next step",d.nextActions],["Date answered",d.answeredDate]])root.append(reflection(label,value));
    }
    root.append(scheduleFields(),button("Save now",save,true));
    const actions=node("div",undefined,"journey-actions");actions.append(button("Edit Journey",async()=>{await save();d.step=1;d.view="guide";screen="guide";changed();await save();render();},true),button(d.status==="answered"?"Edit Answer Reflection":"Record an Answer",answer));root.append(actions);focusHeading();
  }
  async function answer(){
    await save();current.data.view="answer";if(!current.data.answeredDate)current.data.answeredDate=today();screen="answer";changed();renderAnswer();await save();
  }
  function renderAnswer(){
    shell("God Answered","Take time to remember what God has done and what He has taught you through this prayer.");
    root.append(textField("godActions","How did God answer this prayer?"),textField("lessons","What has God taught you through this journey?"),textField("nextActions","Is there a next step God is calling you to take?"),textField("answeredDate","Date answered","date"));
    const actions=node("div",undefined,"journey-actions");actions.append(button("Back",async()=>{await save();current.data.view="review";changed();await save();review();},true),button("Save now",save,true),button("Save Answer",async()=>{
      const d=current.data;if(!d.godActions.trim() || !d.answeredDate)throw new Error("Describe how God answered and choose the date answered.");
      await save();d.status="answered";d.view="review";changed();await save();review();
    }));root.append(actions);focusHeading();
  }
  function reset() {
    generation++;clearTimeout(timer);token=null;current=null;journeys=[];passageCache=null;chapterCounts.clear();publish();revision=savedRevision=0;root?.replaceChildren();
  }
  async function start(session,options={}){
    categories=options.categories||(()=>[]);onUpdate=options.onUpdate||(()=>{});reset();token=session;root=document.getElementById("journeyRoot");
    root.replaceChildren(heading("Guided Prayer"),statusNode(),button("Load Guided Prayer",home));
    try{await home();}catch(e){status(e.message,true);}
  }
  window.addEventListener("beforeunload",e=>{if(dirty()||pending){e.preventDefault();e.returnValue="";}});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")save().catch(()=>{});});
  return {start,reset,save,items,open,markPrayed,async exportData(){await save();return(await api()).journeys;}};
})();
