/* Private internationalization workspace for administrators. XLSX is parsed on the server. */
(() => {
  const t = (id, en) => uxText(id, en),
    $ = (id) => document.getElementById(id);
  let enabled = false,
    data = null,
    pending = false,
    loadVersion = 0,
    filters = { query: "", year: "", group: "", notes: "" },
    page = 1,
    preview = null,
    importFile = null,
    importRetry = null,
    editor = null,
    saveRetry = null,
    returnFocus = null,
    previewRevision = null;
  const perPage = 20;
  function busy(value) {
    pending = value;
    document
      .querySelectorAll(
        "[data-refresh-international],[data-preview-international],[data-confirm-international-import],#intl-file,[data-edit-international]",
      )
      .forEach((el) => (el.disabled = value));
  }
  function previewHtml() {
    return preview
      ? `<p>${preview.rows.length} ${t("baris valid. Data sumber sebelumnya akan diganti; edit manual tetap dipertahankan.", "valid records. The previous source dataset will be replaced; manual edits are retained.")}</p><ul>${preview.summary.map((group) => `<li>${group.angkatan} · ${t("Kelas", "Class")} ${escapeHtml(group.kelas || "—")}: ${group.total}</li>`).join("")}</ul><button type="button" class="btn-primary" data-confirm-international-import>${t("Konfirmasi Impor", "Confirm Import")}</button>`
      : "";
  }

  async function api(payload) {
    const epoch = sessionEpoch,
      result = await apiPostSuccess(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
    if (epoch !== sessionEpoch)
      throw Object.assign(Error("Session changed"), { staleSession: true });
    return result;
  }
  function lang(id, en) {
    return `<span class="lang" data-id="${escapeHtml(id)}" data-en="${escapeHtml(en)}">${t(id, en)}</span>`;
  }
  function apply(snapshot) {
    enabled =
      currentUser.role === "admin" && snapshot.internationalSupported === true;
    const nav = $("nav-internationalization");
    if (nav) nav.hidden = currentUser.role !== "admin";
    if (currentUser.role !== "admin") {
      reset();
      return;
    }
    if (
      $("internationalization").classList.contains("active") &&
      !pending &&
      !editor &&
      !preview &&
      !$("intl-file")?.files.length
    )
      open();
  }
  function total() {
    const summary = data?.summary || [];
    return {
      all: summary.reduce((sum, g) => sum + g.total, 0),
      noted: summary.reduce((sum, g) => sum + g.withNotes, 0),
    };
  }
  function render() {
    const root = $("internationalization-content");
    if (!root) return;
    const selectedFile = $("intl-file"),
      expanded = document.querySelector(".intl-import")?.open;
    const admin = currentUser.role === "admin";
    if (currentUser.role !== "admin") {
      root.replaceChildren();
      return;
    }
    if (!enabled) {
      root.innerHTML = `<p>${t("Data internasionalisasi menunggu aktivasi backend.", "Internationalization data is awaiting backend activation.")}</p>`;
      return;
    }
    if (!data) {
      root.innerHTML = `<p role="status">${pending ? t("Memuat data…", "Loading data…") : t("Data belum dimuat.", "Data has not been loaded.")}</p><button type="button" class="btn-secondary" data-refresh-international>${t("Muat Ulang", "Reload")}</button>`;
      return;
    }
    const counts = total();
    root.innerHTML = `<div class="intl-header"><div><p>${t("Kegiatan dan pengalaman internasional mahasiswa IPCOS.", "IPCOS student international activities and experiences.")}</p><p class="field-helper">${data.meta.updatedAt ? t("Terakhir diimpor: ", "Last imported: ") + escapeHtml(formatDateTime(data.meta.updatedAt).replace(/<[^>]*>/g, "")) : t("Belum ada impor sumber. Daftar mahasiswa baru tetap tersedia untuk admin.", "No source imported yet. New student records remain available to admin.")}</p></div><button type="button" class="btn-secondary" data-refresh-international ${pending ? "disabled" : ""}>${t("Segarkan Data", "Refresh Data")}</button></div><p id="intl-feedback" class="field-error" role="status"></p><div class="intl-stats"><div><strong>${counts.all}</strong><span>${t("Mahasiswa dalam data", "Students in the dataset")}</span></div><div><strong>${counts.noted}</strong><span>${t("Keterangan terisi", "Records with notes")}</span></div><div><strong>${counts.all - counts.noted}</strong><span>${t("Keterangan belum dicatat", "Records without notes")}</span></div></div><p class="field-helper">${t("Keterangan kosong berarti belum dicatat. Satu mahasiswa dihitung satu kali, meskipun keterangannya memuat beberapa kegiatan.", "Blank notes mean not recorded. Each student is counted once, even when their notes describe several activities.")}</p><div class="responsive-table-wrapper"><table><caption>${t("Ringkasan per Angkatan dan Kelas", "Summary by Cohort and Class")}</caption><thead><tr><th>${t("Angkatan", "Cohort")}</th><th>${t("Kelas", "Class")}</th><th>${t("Mahasiswa", "Students")}</th><th>${t("Keterangan Terisi", "With Notes")}</th><th>${t("Belum Dicatat", "Without Notes")}</th></tr></thead><tbody>${data.summary.map((group) => `<tr><td>${group.angkatan}</td><td>${escapeHtml(group.kelas || t("Belum dicatat", "Not recorded"))}</td><td>${group.total}</td><td>${group.withNotes}</td><td>${group.total - group.withNotes}</td></tr>`).join("") || `<tr><td colspan="5">${t("Belum ada data mahasiswa.", "No student data yet.")}</td></tr>`}</tbody></table></div>${admin ? adminHtml() : `<p class="field-helper">${t("Ringkasan tidak menampilkan nama, NIM, atau keterangan pribadi mahasiswa.", "This summary does not show student names, IDs or personal notes.")}</p>`}`;
    if (admin) renderRows();
    if (selectedFile?.files.length && $("intl-file"))
      $("intl-file").replaceWith(selectedFile);
    if (expanded && document.querySelector(".intl-import"))
      document.querySelector(".intl-import").open = true;
    if (preview && $("intl-import-preview"))
      $("intl-import-preview").innerHTML = previewHtml();
  }
  function adminHtml() {
    const years = [
      ...new Set((data.rows || []).map((row) => row.angkatan)),
    ].sort((a, b) => b - a);
    return `<details class="intl-import"><summary>${t("Impor dan Sumber Data", "Import and Data Source")}</summary><p>${t("Impor XLSX dengan kolom NIM, Nama, Keterangan, dan lembar bernama angkatan. Tabel kelas I dan J berdampingan didukung. Edit manual tetap dipertahankan saat impor ulang.", "Import an XLSX with Student ID, Name, Notes, and cohort-named sheets. Side-by-side class I and J tables are supported. Manual edits are retained on re-import.")}</p>${data.meta.sourceUrl ? `<a href="${escapeHtml(safeUrl(data.meta.sourceUrl))}" target="_blank" rel="noopener noreferrer" class="text-link">${t("Buka File Sumber SharePoint", "Open SharePoint Source File")}</a>` : ""}<label for="intl-file">${t("File Excel · maksimum 2 MB", "Excel file · maximum 2 MB")}</label><input type="file" id="intl-file" accept=".xlsx"><button type="button" class="btn-secondary" data-preview-international ${pending ? "disabled" : ""}>${t("Periksa Impor", "Review Import")}</button><div id="intl-import-preview"></div><p id="intl-import-feedback" class="field-error" role="status"></p></details><h2>${t("Data Mahasiswa Lengkap", "Full Student Records")}</h2><div class="intl-filters"><label>${t("Cari Mahasiswa atau Keterangan", "Search Students or Notes")}<input type="search" id="intl-search" value="${escapeHtml(filters.query)}"></label><label>${t("Angkatan", "Cohort")}<select id="intl-year"><option value="">${t("Semua Angkatan", "All Cohorts")}</option>${years.map((year) => `<option value="${year}" ${String(year) === filters.year ? "selected" : ""}>${year}</option>`).join("")}</select></label><label>${t("Kelas", "Class")}<select id="intl-class"><option value="">${t("Semua Kelas", "All Classes")}</option><option value="I" ${filters.group === "I" ? "selected" : ""}>I</option><option value="J" ${filters.group === "J" ? "selected" : ""}>J</option><option value="unknown" ${filters.group === "unknown" ? "selected" : ""}>${t("Belum dicatat", "Not recorded")}</option></select></label><label>${t("Keterangan", "Notes")}<select id="intl-notes"><option value="">${t("Semua", "All")}</option><option value="yes" ${filters.notes === "yes" ? "selected" : ""}>${t("Terisi", "Recorded")}</option><option value="no" ${filters.notes === "no" ? "selected" : ""}>${t("Belum dicatat", "Not recorded")}</option></select></label></div><p id="intl-result-count" role="status"></p><div class="responsive-table-wrapper"><table><thead><tr><th>NIM</th><th>${t("Nama", "Name")}</th><th>${t("Angkatan", "Cohort")}</th><th>${t("Kelas", "Class")}</th><th>${t("Keterangan Internasionalisasi", "Internationalization Notes")}</th><th>${t("Status Sumber", "Source Status")}</th><th>${t("Aksi", "Actions")}</th></tr></thead><tbody id="intl-records"></tbody></table></div><div class="button-row"><button type="button" class="btn-secondary" data-intl-page="-1">${t("Sebelumnya", "Previous")}</button><span id="intl-page-info"></span><button type="button" class="btn-secondary" data-intl-page="1">${t("Berikutnya", "Next")}</button></div>`;
  }
  function renderRows() {
    if (currentUser.role !== "admin" || !data?.rows || !$("intl-records"))
      return;
    const query = filters.query.toLocaleLowerCase(),
      rows = data.rows.filter(
        (row) =>
          (!query ||
            [row.nim, row.nama, row.keterangan].some((value) =>
              value.toLocaleLowerCase().includes(query),
            )) &&
          (!filters.year || String(row.angkatan) === filters.year) &&
          (!filters.group ||
            (filters.group === "unknown"
              ? !row.kelas
              : row.kelas === filters.group)) &&
          (!filters.notes ||
            (filters.notes === "yes" ? !!row.keterangan : !row.keterangan)),
      );
    const pages = Math.max(1, Math.ceil(rows.length / perPage));
    page = Math.min(pages, Math.max(1, page));
    $("intl-records").innerHTML =
      rows
        .slice((page - 1) * perPage, page * perPage)
        .map(
          (row) =>
            `<tr><td>${escapeHtml(row.nim)}</td><td>${escapeHtml(row.nama)}</td><td>${row.angkatan}</td><td>${escapeHtml(row.kelas || "—")}</td><td class="preserve-lines">${escapeHtml(row.keterangan || t("Belum dicatat", "Not recorded"))}${row.manual ? `<small class="field-helper">${t("Diperbarui manual", "Manually updated")}</small>` : ""}</td><td>${escapeHtml(row.status || "—")}</td><td><button type="button" class="intl-edit-button" data-edit-international="${escapeHtml(row.nim)}">${t("Kelola Kegiatan", "Manage Activities")}</button></td></tr>`,
        )
        .join("") ||
      `<tr><td colspan="7">${t("Tidak ada data yang cocok.", "No matching records.")}</td></tr>`;
    $("intl-result-count").textContent =
      rows.length + " " + t("mahasiswa cocok", "matching students");
    $("intl-page-info").textContent = page + " / " + pages;
    document.querySelector('[data-intl-page="-1"]').disabled = page <= 1;
    document.querySelector('[data-intl-page="1"]').disabled = page >= pages;
  }
  async function open() {
    if (currentUser.role !== "admin" || pending) return;
    const epoch = sessionEpoch,
      version = ++loadVersion;
    busy(true);
    if (!data) render();
    try {
      const result = await api({ action: "get_internationalization" });
      if (epoch !== sessionEpoch || version !== loadVersion) return;
      data = result;
      render();
    } catch (error) {
      if (epoch === sessionEpoch && !error.staleSession) {
        render();
        const target = $("intl-feedback");
        if (target) target.textContent = systemText(error.message);
        else
          $("internationalization-content").insertAdjacentHTML(
            "beforeend",
            `<p class="field-error">${escapeHtml(systemText(error.message))}</p>`,
          );
      }
    } finally {
      if (epoch === sessionEpoch && version === loadVersion) {
        busy(false);
      }
    }
  }
  async function reviewImport() {
    if (currentUser.role !== "admin" || pending) return;
    const file = $("intl-file")?.files[0];
    if (
      !file ||
      !file.name.toLowerCase().endsWith(".xlsx") ||
      file.size > 2 * 1024 * 1024
    ) {
      $("intl-import-feedback").textContent = t(
        "Pilih XLSX hingga 2 MB.",
        "Choose an XLSX up to 2 MB.",
      );
      return;
    }
    const epoch = sessionEpoch;
    busy(true);
    preview = null;
    previewRevision = data.meta.revision;
    importRetry = null;
    $("intl-import-feedback").textContent = t(
      "Memeriksa isi Excel…",
      "Checking Excel contents…",
    );
    try {
      const base64 = await fileToBase64(file);
      if (epoch !== sessionEpoch) return;
      importFile = { fileName: file.name, base64 };
      const result = await api({
        action: "preview_international_excel",
        ...importFile,
      });
      if (epoch !== sessionEpoch) return;
      preview = result;
      $("intl-import-preview").innerHTML = previewHtml();
      $("intl-import-feedback").textContent = t(
        "Belum disimpan. Periksa ringkasan sebelum mengonfirmasi.",
        "Not saved yet. Review the summary before confirming.",
      );
    } catch (error) {
      if (epoch === sessionEpoch && !error.staleSession)
        $("intl-import-feedback").textContent = systemText(error.message);
    } finally {
      if (epoch === sessionEpoch) busy(false);
    }
  }
  async function confirmImport() {
    if (currentUser.role !== "admin" || pending || !preview || !importFile)
      return;
    if (
      !confirm(
        t(
          "Ganti data sumber dengan hasil impor ini? Edit manual tetap dipertahankan.",
          "Replace the source dataset with this import? Manual edits are retained.",
        ),
      )
    )
      return;
    const epoch = sessionEpoch;
    if (!importRetry)
      importRetry = {
        action: "import_international_excel",
        ...importFile,
        revision: previewRevision,
        requestId: crypto.randomUUID(),
      };
    busy(true);
    try {
      const result = await api(importRetry);
      if (epoch !== sessionEpoch) return;
      data = result;
      preview = null;
      importFile = null;
      importRetry = null;
      render();
      $("intl-feedback").textContent = t(
        "Impor berhasil disimpan.",
        "Import saved successfully.",
      );
    } catch (error) {
      if (epoch === sessionEpoch && !error.staleSession)
        $("intl-import-feedback").textContent = systemText(error.message);
    } finally {
      if (epoch === sessionEpoch) busy(false);
    }
  }
  function edit(nim) {
    if (currentUser.role !== "admin" || pending) return;
    const row = data?.rows?.find((row) => row.nim === nim);
    if (!row) return;
    returnFocus = document.activeElement;
    editor = { ...row, sourceRevision: data.meta.revision };
    saveRetry = null;
    let modal = $("modal-international-editor");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-international-editor";
      modal.className = "overlay";
      modal.style.zIndex = "5100";
      document.body.append(modal);
    }
    const initials = row.nama
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("");
    modal.style.display = "flex";
    modal.innerHTML = `<section class="modal-card intl-editor" role="dialog" aria-modal="true" aria-labelledby="intl-editor-title" aria-describedby="intl-editor-description"><header class="intl-editor-header"><div><span class="eyebrow">IPCOS · ${lang("INTERNASIONALISASI", "INTERNATIONALIZATION")}</span><h2 id="intl-editor-title">${lang("Kelola Kegiatan Mahasiswa", "Manage Student Activities")}</h2></div><button type="button" class="intl-close" data-close-international aria-label="${t("Tutup editor", "Close editor")}">×</button></header><div class="intl-editor-body"><div class="intl-student-identity"><span class="intl-avatar" aria-hidden="true">${escapeHtml(initials)}</span><div><strong>${escapeHtml(row.nama)}</strong><span>${escapeHtml(row.nim)} · ${lang("Angkatan", "Cohort")} ${row.angkatan}</span></div></div><p id="intl-editor-description" class="field-helper">${lang("Catat pengalaman internasional mahasiswa yang sudah diverifikasi.", "Record the student’s verified international experiences.")}</p><div class="intl-field"><label for="intl-edit-class">${lang("Kelas", "Class")}</label><select id="intl-edit-class"><option value="" ${!row.kelas ? "selected" : ""}>${t("Belum dicatat", "Not recorded")}</option><option value="I" ${row.kelas === "I" ? "selected" : ""}>I</option><option value="J" ${row.kelas === "J" ? "selected" : ""}>J</option></select></div><div class="intl-field"><label for="intl-edit-notes">${lang("Kegiatan Internasionalisasi", "International Activities")}</label><textarea id="intl-edit-notes" rows="6" maxlength="1500" aria-describedby="intl-notes-help intl-note-count" placeholder="${t("Contoh: Student Exchange — universitas tujuan, tahun kegiatan.", "Example: Student Exchange — host university, activity year.")}">${escapeHtml(row.keterangan)}</textarea><div class="intl-field-caption"><span id="intl-notes-help">${lang("Exchange, short-term, magang, konferensi, atau pengalaman lainnya.", "Exchange, short-term programs, internships, conferences, or other experiences.")}</span><span id="intl-note-count"></span></div></div><details class="intl-source-details"><summary>${lang("Keterangan Tambahan", "Additional Details")}</summary><div class="intl-field"><label for="intl-edit-status">${lang("Status pada Sumber (Opsional)", "Source Status (Optional)")}</label><input id="intl-edit-status" maxlength="100" value="${escapeHtml(row.status)}"><p class="field-helper">${lang("Informasi ini tidak mengubah status akademik atau akses login mahasiswa.", "This information does not change the student’s academic status or login access.")}</p></div></details><p id="intl-editor-feedback" class="field-error" role="status" aria-live="polite"></p></div><footer class="intl-editor-footer">${row.manual ? `<button type="button" class="intl-reset" data-reset-international>${lang("Gunakan Data Sumber", "Use Source Data")}</button>` : ""}<div class="button-row"><button type="button" class="btn-secondary" data-close-international>${lang("Batal", "Cancel")}</button><button type="button" class="btn-primary" data-save-international>${lang("Simpan Kegiatan", "Save Activities")}</button></div></footer></section>`;
    editorStatus();
    $("intl-edit-notes").focus();
  }
  function editorStatus() {
    const modal = $("modal-international-editor");
    if (!editor || !modal) return;
    const count = $("intl-note-count");
    if (count)
      count.textContent = $("intl-edit-notes").value.length + " / 1500";
    modal.querySelector("[data-save-international]").disabled =
      pending || !editorDirty();
    modal
      .querySelector('[role="dialog"]')
      .setAttribute("aria-busy", String(pending));
  }
  function finishEditor() {
    const nim = editor?.nim;
    const focus = returnFocus;
    editor = null;
    saveRetry = null;
    if ($("modal-international-editor"))
      $("modal-international-editor").style.display = "none";
    const replacement = [
      ...document.querySelectorAll("[data-edit-international]"),
    ].find((button) => button.dataset.editInternational === nim);
    (focus?.isConnected ? focus : replacement)?.focus();
    returnFocus = null;
  }
  function editorDirty() {
    return (
      !!editor &&
      $("intl-edit-notes") &&
      ($("intl-edit-notes").value !== editor.keterangan ||
        $("intl-edit-class").value !== editor.kelas ||
        $("intl-edit-status").value !== editor.status)
    );
  }
  function closeEditor() {
    if (pending) return;
    if (
      editorDirty() &&
      !confirm(
        t("Tutup tanpa menyimpan perubahan?", "Close without saving changes?"),
      )
    )
      return;
    finishEditor();
  }
  async function save(reset = false) {
    if (!editor || pending || currentUser.role !== "admin") return;
    if (
      reset &&
      !confirm(
        t(
          "Kembali memakai data sumber? Riwayat edit tetap tersimpan.",
          "Use source data again? Edit history is retained.",
        ),
      )
    )
      return;
    const payload = {
      action: "save_international_record",
      nim: editor.nim,
      kelas: $("intl-edit-class").value,
      keterangan: $("intl-edit-notes").value.trim(),
      recordStatus: $("intl-edit-status").value.trim(),
      revision: editor.editRevision,
      sourceRevision: editor.sourceRevision,
      reset: reset,
    };
    const signature = JSON.stringify(payload);
    if (!saveRetry || saveRetry.signature !== signature)
      saveRetry = {
        signature,
        payload: { ...payload, requestId: crypto.randomUUID() },
      };
    const epoch = sessionEpoch;
    busy(true);
    $("intl-editor-feedback").textContent = t(
      "Menyimpan kegiatan…",
      "Saving activities…",
    );
    editorStatus();
    $("modal-international-editor")
      .querySelectorAll("input,textarea,select,button")
      .forEach((el) => (el.disabled = true));
    try {
      data = await api(saveRetry.payload);
      if (epoch !== sessionEpoch) return;
      render();
      finishEditor();
      $("intl-feedback").textContent = t(
        "Perubahan tersimpan.",
        "Changes saved.",
      );
    } catch (error) {
      if (epoch === sessionEpoch && !error.staleSession)
        $("intl-editor-feedback").textContent = systemText(error.message);
    } finally {
      if (epoch === sessionEpoch) {
        busy(false);
        $("modal-international-editor")
          .querySelectorAll("input,textarea,select,button")
          .forEach((el) => (el.disabled = false));
        editorStatus();
      }
    }
  }
  function languageChanged() {
    const file = $("intl-file"),
      expanded = document.querySelector(".intl-import")?.open,
      feedback = $("intl-import-feedback")?.textContent;
    if (data || $("internationalization").classList.contains("active"))
      render();
    if (file && $("intl-file")) $("intl-file").replaceWith(file);
    const details = document.querySelector(".intl-import");
    if (details) details.open = !!expanded;
    if ($("intl-import-preview"))
      $("intl-import-preview").innerHTML = previewHtml();
    if ($("intl-import-feedback"))
      $("intl-import-feedback").textContent = feedback || "";
    busy(pending);
    if(editor){$("modal-international-editor").querySelector('.intl-close').setAttribute('aria-label',t('Tutup editor','Close editor'));$('intl-edit-class').options[0].textContent=t('Belum dicatat','Not recorded');editorStatus();}
  }
  document.addEventListener("input", (event) => {
    if (event.target.closest("#modal-international-editor")) editorStatus();
    if (event.target.id === "intl-search") {
      filters.query = event.target.value;
      page = 1;
      renderRows();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.closest("#modal-international-editor")) editorStatus();
    const key = {
      "intl-year": "year",
      "intl-class": "group",
      "intl-notes": "notes",
    }[event.target.id];
    if (key) {
      filters[key] = event.target.value;
      page = 1;
      renderRows();
    }
    if (event.target.id === "intl-file") {
      preview = null;
      importFile = null;
      importRetry = null;
      $("intl-import-preview").replaceChildren();
    }
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-refresh-international]")) open();
    if (event.target.closest("[data-preview-international]")) reviewImport();
    if (event.target.closest("[data-confirm-international-import]"))
      confirmImport();
    const editButton = event.target.closest("[data-edit-international]");
    if (editButton) edit(editButton.dataset.editInternational);
    if (event.target.closest("[data-save-international]")) save();
    if (event.target.closest("[data-reset-international]")) save(true);
    if (event.target.closest("[data-close-international]")) closeEditor();
    const paging = event.target.closest("[data-intl-page]");
    if (paging) {
      page += Number(paging.dataset.intlPage);
      renderRows();
    }
  });
  document.addEventListener(
    "keydown",
    (event) => {
      const modal = $("modal-international-editor");
      if (!modal || modal.style.display !== "flex") return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeEditor();
      }
      if (event.key === "Tab") {
        event.stopImmediatePropagation();
        const controls = [
            ...modal.querySelectorAll("button,input,select,textarea"),
          ].filter((el) => !el.disabled),
          first = controls[0],
          last = controls.at(-1);
        if (!modal.contains(document.activeElement)) {
          event.preventDefault();
          first?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    },
    true,
  );
  function reset() {
    loadVersion++;
    enabled = false;
    data = null;
    busy(false);
    editor = null;
    preview = null;
    previewRevision = null;
    importFile = null;
    importRetry = null;
    saveRetry = null;
    returnFocus = null;
    filters = { query: "", year: "", group: "", notes: "" };
    $("internationalization-content")?.replaceChildren();
    $("modal-international-editor")?.remove();
    if ($("nav-internationalization"))
      $("nav-internationalization").hidden = true;
  }
  window.addEventListener("ipcos:logout", reset);
  window.IPCOSInternational = {
    apply,
    open,
    languageChanged,
    reset,
    dirty: editorDirty,
    busy: () => pending,
  };
})();
