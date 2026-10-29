// First paint does not download the SOP editor or admin reporting tools.
(() => {
  const pending = new Map();
  let sopContents = [],
    generation = 0;
  function load(file, ready = () => true) {
    if (pending.has(file)) return pending.get(file);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = file;
      script.async = true;
      const timeout = setTimeout(fail, 15000);
      function fail() {
        clearTimeout(timeout);
        script.remove();
        pending.delete(file);
        window.IPCOSNext?.report("module", "module");
        reject(
          Error(
            uxText(
              "Fitur belum dapat dimuat. Coba lagi.",
              "The feature could not load. Please retry.",
            ),
          ),
        );
      }
      script.onload = () => {
        // HTTP success also fires when a script is empty or has a syntax error.
        // Remove that attempt so Retry fetches a fresh script instead of looping.
        if (!ready()) { fail(); return; }
        clearTimeout(timeout);
        resolve();
      };
      script.onerror = fail;
      document.head.append(script);
    });
    pending.set(file, promise);
    return promise;
  }
  const placeholder = {
    async open(type, reload = false) {
      const epoch = sessionEpoch,
        run = generation,
        view = document.getElementById(type + "-view");
      if (view) view.textContent = uxText("Memuat SOP…", "Loading SOP…");
      try {
        await load("sop.js", () => window.IPCOSSop !== placeholder);
        if (
          epoch !== sessionEpoch ||
          run !== generation ||
          !getSessionToken()
        ) {
          window.IPCOSSop.reset();
          return;
        }
        window.IPCOSSop.receive(sopContents);
        sopContents = [];
        return window.IPCOSSop.open(type, reload);
      } catch (error) {
        if (epoch === sessionEpoch && run === generation && view)
          view.innerHTML = `<p role="status">${escapeHtml(error.message)}</p><button type="button" class="btn-secondary" data-load-sop="${type}">${uxText("Coba Lagi", "Retry")}</button>`;
      }
    },
    receive(contents) {
      sopContents = contents.filter((item) =>
        ["sop_magang", "sop_tugas_akhir"].includes(item.Tipe),
      );
    },
    snapshot() {
      if (!getSessionToken() || !['mhs','admin'].includes(currentUser.role)) return [];
      const docs=new Map(),strings=(value,keys)=>value&&keys.every(key=>typeof value[key]==='string');
      for(const item of sopContents){
        try{
          const doc=JSON.parse(item.DataJSON),ids=new Set();
          if(!doc||doc.schema!==1||doc.type!==item.Tipe||!Number.isInteger(doc.revision)||doc.revision<0||!strings(doc,['title','titleEn','intro','introEn'])||!Array.isArray(doc.sections)||doc.sections.length>20)continue;
          let invalidSection=false;
          for(const section of doc.sections){
            if(!strings(section,['id','title','titleEn','body','bodyEn'])||!/^[-A-Za-z0-9_]{1,120}$/.test(section.id)||ids.has(section.id)||!Array.isArray(section.links)||!Array.isArray(section.files)){invalidSection=true;break;}
            ids.add(section.id);
          }
          if(invalidSection)continue;
          const value={type:doc.type,title:doc.title,titleEn:doc.titleEn,intro:doc.intro,introEn:doc.introEn,sections:doc.sections.map(section=>({id:section.id,title:section.title,titleEn:section.titleEn,body:section.body,bodyEn:section.bodyEn,links:section.links.filter(link=>strings(link,['label','labelEn'])).map(link=>({label:link.label,labelEn:link.labelEn})),files:section.files.filter(file=>typeof file?.fileName==='string').map(file=>({fileName:file.fileName}))}))};
          if(!docs.has(doc.type)||docs.get(doc.type).revision<doc.revision)docs.set(doc.type,{revision:doc.revision,value});
        }catch(_){/* Malformed unpublished/legacy structures are not search results. */}
      }
      return [...docs.values()].map(entry=>entry.value);
    },
    reset() {
      generation++;
      sopContents = [];
      ["sop_magang", "sop_tugas_akhir"].forEach((type) => {
        document.getElementById(type + "-view").textContent = "";
      });
    },
    languageChanged() {},
    beforeNavigate() {
      return true;
    },
  };
  window.IPCOSSop = placeholder;
  let internationalSnapshot = null;
  const internationalPlaceholder = {
    apply(snapshot) {
      internationalSnapshot = currentUser.role === "admin" ? snapshot : null;
      const nav = document.getElementById("nav-internationalization");
      if (nav) nav.hidden = currentUser.role !== "admin";
    },
    async open() {
      if (currentUser.role !== "admin") return;
      const epoch = sessionEpoch,
        root = document.getElementById("internationalization-content");
      root.textContent = uxText(
        "Memuat data internasionalisasi…",
        "Loading internationalization data…",
      );
      try {
        await load("internationalization.js");
        if (epoch !== sessionEpoch || currentUser.role !== "admin") return;
        if (window.IPCOSInternational === internationalPlaceholder)
          throw Error(
            uxText(
              "Editor belum dapat dimuat. Coba lagi.",
              "The editor could not load. Please retry.",
            ),
          );
        window.IPCOSInternational.apply(internationalSnapshot || {});
        return window.IPCOSInternational.open();
      } catch (error) {
        if (epoch === sessionEpoch && currentUser.role === "admin")
          root.innerHTML = `<p role="status">${escapeHtml(error.message)}</p><button type="button" class="btn-secondary" data-load-international>${uxText("Coba Lagi", "Retry")}</button>`;
      }
    },
    reset() {
      internationalSnapshot = null;
      document.getElementById("internationalization-content").replaceChildren();
      document.getElementById("nav-internationalization").hidden=true;
    },
    languageChanged() {},
    dirty() {
      return false;
    },
    busy() {
      return false;
    },
  };
  window.IPCOSInternational = internationalPlaceholder;
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-load-international]"))
      window.IPCOSInternational.open();
  });
  window.addEventListener("ipcos:logout", () => internationalPlaceholder.reset());
  window.exportAdminDataCSV = async (selection = null) => {
    if (currentUser.role !== "admin") return;
    const epoch = sessionEpoch;
    try {
      await load("admin-export.js");
      if (epoch === sessionEpoch && currentUser.role === "admin")
        return window.IPCOSAdminExport.download(selection);
    } catch (error) {
      if (epoch === sessionEpoch) showToast(error.message, "error");
    }
  };
  window.downloadServiceICS = (type, date, days) => {
    if (
      !SERVICE_TYPES.includes(type) ||
      ![1, 3].includes(days) ||
      !academicCalendarDate(date)
    ) {
      showToast(
        uxText(
          "Pengingat belum tersedia untuk layanan ini.",
          "A reminder is unavailable for this service.",
        ),
        "error",
      );
      return;
    }
    downloadICS(type, date, { service: true, alarmDays: days });
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-load-sop]");
    if (button) window.IPCOSSop.open(button.dataset.loadSop);
  });
})();
