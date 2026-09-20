/* The guide uses the same signed-in session as the existing journal. */
window.PrayerJourneys = (() => {
  const titles = ["Abide in Christ", "Abide in the Word", "Allow the Holy Spirit to Lead You in Truth", "Ask According to God's Will", "Accept God's Will in Faith", "Act on the Basis of God's Word to You"];
  const choices = [
    ["power", "A platform for God to demonstrate His power"],
    ["blessing", "A blessing from God for which I have not asked"],
    ["character", "An opportunity for God to develop in me faith, love, patience, or another Christlike character trait"],
    ["prayer", "An opportunity for me to develop a more effective prayer life"]
  ];
  const labels = { in_prayer: "In Prayer", waiting: "Waiting", answered: "Answered" };
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
    current = result.journey; revision = savedRevision = 0; render();
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
      b.disabled = true;
      try { await action(); } catch (e) { status(e.message, true); }
      finally { b.disabled = false; }
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
    if (epoch !== generation || session !== token) throw new Error("The signed-in account changed. Reopen Prayer Guide.");
    if (!response.ok) throw new Error(result.error || "Could not reach your saved journeys. Please try again.");
    return result;
  }
  function changed() {
    revision++;
    status("Unsaved changes…");
    clearTimeout(timer);
    timer = setTimeout(() => { save().catch(() => {}); }, 800);
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
    input.value = current.data[key];
    input.maxLength = key === "title" ? 160 : 10000;
    if (type === "textarea") input.rows = 4;
    input.addEventListener("input", () => { current.data[key] = input.value; changed(); });
    wrap.append(caption, input); return wrap;
  }
  function yesNo(key, question) {
    const set = node("fieldset", undefined, "journey-field");
    set.append(node("legend", question));
    const row = node("div", undefined, "journey-choices");
    for (const [value, text] of [["yes", "Yes"], ["no", "No"], ["", "Not answered"]]) {
      const label = node("label"), input = node("input");
      input.type = "radio"; input.name = key; input.value = value; input.checked = current.data[key] === value;
      input.onchange = () => { current.data[key] = value; changed(); };
      label.append(input, document.createTextNode(text)); row.append(label);
    }
    set.append(row); return set;
  }
  function heading(text) { const h = node("h2", text, "serif"); h.tabIndex = -1; return h; }
  function blank() {
    return { frequency: "daily", category: categories()[0] || "", lastPrayed: "", title: "", problem: "", questionToGod: "", scripture: "", scriptureApplication: "", specificRequest: "", belief: "", plannedActions: "", godActions: "", nextActions: "", abiding: "", godFirst: "", inWord: "", willingToWait: "", spiritLeading: "", promiseAccepted: "", possibleUses: [], step: 1, status: "in_prayer", submittedDate: "", answeredDate: "" };
  }
  async function list() {
    await save();
    // Keep the existing screen intact if loading fails.
    const result = await api();
    journeys = result.journeys; publish();
    current = null; revision = savedRevision = 0;
    root.replaceChildren(heading("Guide to Praying in Faith"),
      node("p", "Take time to listen, reflect, and respond through six steps. You may leave any reflection unanswered and return when you are ready."),
      node("p", "Private to your account. Your answers save automatically while you are online.", "journey-muted"));
    const newId = crypto.randomUUID();
    root.append(button("Begin New Prayer", async () => {
      const result = await api("", "POST", { id: newId, data: blank() });
      current = result.journey; revision = savedRevision = 0; publish(current); render();
    }), statusNode(), node("h3", "My Prayer Journeys", "serif"));
    if (!journeys.length) root.append(node("p", "Your prayer journeys will appear here. Begin a prayer whenever you are ready.", "journey-muted"));
    for (const journey of journeys) {
      const card = node("article", undefined, "journey-card");
      card.append(node("span", labels[journey.data.status], "journey-badge"), node("h4", journey.data.title || "Untitled prayer", "serif"),
        node("p", "Step " + journey.data.step + " of 6 · Updated " + new Date(journey.updatedAt).toLocaleDateString(), "journey-muted"));
      if (journey.data.submittedDate) card.append(node("p", "Submitted: " + journey.data.submittedDate + (journey.data.answeredDate ? " · Answered: " + journey.data.answeredDate : ""), "journey-muted"));
      card.append(button(journey.data.status === "in_prayer" ? "Continue Prayer" : "Review / Record an Answer", async () => {
        const result = await api("/" + journey.id);
        current = result.journey; revision = savedRevision = 0;
        render();
      }, true)); root.append(card);
    }
    focusHeading();
  }
  function render() {
    const d = current.data;
    root.replaceChildren();
    root.append(button("My Prayer Journeys", list, true), node("p", d.step <= 3 ? "God Communicates Truth to Me" : "I Communicate Faith to God", "journey-phase"));
    const progress = node("progress"); progress.max = 6; progress.value = d.step;
    progress.setAttribute("aria-label", "Step " + d.step + " of 6");
    root.append(node("p", "Step " + d.step + " of 6", "journey-muted"), progress, heading(titles[d.step - 1]), statusNode());
    status(dirty() ? "Unsaved changes…" : "Saved to your account");
    root.append(scheduleFields());
    if (d.step === 4) root.append(node("p", "Having reflected on God's truth, take time now to respond in faith.", "purpose-banner"));
    if (d.step === 1) {
      root.append(textField("title", "A name for this prayer (optional)", "text"), textField("problem", "What problem am I facing?"));
      const set = node("fieldset", undefined, "journey-field");
      set.append(node("legend", "How could God possibly use my problem? (Check all that apply.)"));
      for (const [value, text] of choices) {
        const label = node("label", undefined, "journey-check"), input = node("input");
        input.type = "checkbox"; input.checked = d.possibleUses.includes(value);
        input.onchange = () => { d.possibleUses = input.checked ? [...d.possibleUses, value] : d.possibleUses.filter(v => v !== value); changed(); };
        label.append(input, document.createTextNode(text)); set.append(label);
      }
      root.append(set, textField("questionToGod", "Rewrite the problem in the form of a question to God."), yesNo("abiding", "Am I abiding in Christ and committed to His will for my life?"));
    }
    if (d.step === 2) root.append(node("p", "Ask yourself:"), yesNo("godFirst", "Have I brought my problem to God first?"), yesNo("inWord", "Am I systematically abiding in His Word?"), yesNo("willingToWait", "Am I willing to wait for His solution?"));
    if (d.step === 3) root.append(yesNo("spiritLeading", "Am I allowing the Holy Spirit to fill me, to lead me to a Scripture, and to apply it to my problem?"), textField("scripture", "What is the Scripture?"), textField("scriptureApplication", "How do I think this Scripture applies to my problem?"));
    if (d.step === 4) root.append(textField("specificRequest", "What is my specific request?"));
    if (d.step === 5) root.append(textField("belief", "What do I believe that God will do about my problem?"), yesNo("promiseAccepted", "Do I accept God's promise as a God-revealed certainty?"));
    if (d.step === 6) {
      root.append(textField("plannedActions", "What action(s) will I take, based on this Word from God?"), textField("submittedDate", "Date submitted to God", "date"), node("h3", "Return later to reflect", "serif"), node("p", "You can leave these questions blank until you are ready to record an answer.", "journey-muted"), textField("godActions", "What action(s) did God take in answer to my prayer of faith?"), textField("nextActions", "What else do I need to do?"), textField("answeredDate", "Date answered", "date"));
      const wrap = node("div", undefined, "journey-field"), label = node("label", "Journey status"), select = node("select");
      label.htmlFor = "journey-state"; select.id = "journey-state";
      for (const [value, text] of Object.entries(labels)) { const option = node("option", text); option.value = value; select.append(option); }
      select.value = d.status;
      select.onchange = () => { d.status = select.value; changed(); };
      wrap.append(label, select); root.append(wrap);
    }
    const actions = node("div", undefined, "journey-actions");
    const back = button("Back", () => move(-1), true); back.disabled = d.step === 1;
    actions.append(back, button("Save now", save, true), button(d.step === 6 ? "Save & Close" : "Continue", d.step === 6 ? list : () => move(1)));
    root.append(actions, node("p", "Wait for “Saved to your account” before closing. If a save fails, keep this page open and retry.", "journey-muted"));
    focusHeading();
  }
  async function move(delta) {
    await save();
    current.data.step += delta; changed(); render();
    await save();
  }
  function reset() {
    generation++; clearTimeout(timer); token = null; current = null; journeys = []; publish();
    revision = savedRevision = 0; root?.replaceChildren();
  }
  async function start(session, options = {}) {
    categories = options.categories || (() => []); onUpdate = options.onUpdate || (() => {});
    reset(); token = session; root = document.getElementById("journeyRoot");
    root.replaceChildren(heading("Guide to Praying in Faith"), statusNode(), button("Load My Prayer Journeys", list));
    try { await list(); } catch (e) { status(e.message, true); }
  }
  window.addEventListener("beforeunload", e => { if (dirty() || pending) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save().catch(() => {}); });
  return { start, reset, save, items, open, markPrayed, async exportData() { await save(); return (await api()).journeys; } };
})();
