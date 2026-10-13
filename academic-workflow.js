/* Admin-verified stages; approvals and student self-checks stay separate. */
(() => {
  const t = (id, en) => uxText(id, en),
    $ = (id) => document.getElementById(id);
  let enabled = false,
    mine = null,
    byNim = {},
    busy = false,
    editing = "",
    base = null,
    retry = null,
    typeDrafts = {};
  const levels = () => [
    t("Belum menyelesaikan Outline", "Outline not completed"),
    t("Outline selesai", "Outline completed"),
    t("Sempro selesai", "Proposal seminar completed"),
    t("Pendadaran selesai", "Thesis defence completed"),
  ];
  function summary(value) {
    if (!value || value.unavailable)
      return t("Status belum dapat dimuat", "Status could not be loaded");
    return value.exists
      ? levels()[value.level]
      : t("Tahap belum dicatat admin", "Stage not yet recorded by admin");
  }
  function historyHtml(value) {
    return (
      value.events
        .map(
          (event) =>
            `<p><strong>${escapeHtml(levels()[event.to])}</strong> · ${escapeHtml(formatDateTime(event.time).replace(/<[^>]*>/g, ""))}<br>${escapeHtml(event.actor)}<br>${escapeHtml(event.reason)}</p>`,
        )
        .join("") ||
      `<p>${t("Belum ada perubahan tercatat.", "No recorded changes.")}</p>`
    );
  }
  function languageChanged() {
    render();
    const modal = $("modal-academic-editor");
    if (!editing || !modal || modal.style.display !== "flex") return;
    $("academic-editor-title").textContent = t(
      "Kelola Tahap Akademik",
      "Manage Academic Stage",
    );
    modal.querySelector(".eyebrow").textContent = t(
      "IPCOS · TAHAP AKADEMIK",
      "IPCOS · ACADEMIC STAGES",
    );
    const close = modal.querySelector(".intl-close");
    close.setAttribute(
      "aria-label",
      t("Tutup pengelolaan tahap", "Close stage management"),
    );
    if (!base) {
      $("academic-editor-body").textContent = t(
        "Memuat status…",
        "Loading status…",
      );
      return;
    }
    const body = $("academic-editor-body");
    body.querySelector(".verified-stages").outerHTML = stageHtml(base);
    body.querySelector(".field-helper").textContent = t(
      "Pilih tahap terakhir yang sudah selesai. Tahap sebelumnya dianggap telah dilalui; pengajuan berkas tetap diperiksa terpisah.",
      "Choose the last completed stage. Previous stages are treated as completed; document requests are reviewed separately.",
    );
    body.querySelector('label[for="academic-level"]').textContent = t(
      "Tahap terakhir selesai",
      "Last completed stage",
    );
    body.querySelector('label[for="academic-reason"]').textContent = t(
      "Keterangan perubahan",
      "Reason for change",
    );
    for (const option of $("academic-level").options)
      option.textContent = levels()[Number(option.value)];
    $("academic-reason").placeholder = t(
      "Contoh: Sempro selesai sebelum website digunakan.",
      "Example: Proposal seminar completed before this website was introduced.",
    );
    body.querySelector("details>summary").textContent = t(
      "Riwayat perubahan tahap",
      "Stage change history",
    );
    $("academic-editor-history").innerHTML = historyHtml(base);
    body.querySelector("[data-close-academic]").textContent = t(
      "Tutup",
      "Close",
    );
    body.querySelector("[data-save-academic]").textContent = t(
      "Simpan Tahap",
      "Save Stage",
    );
  }
  function stageHtml(value) {
    return `<ol class="verified-stages">${["Outline", t("Sempro", "Proposal Seminar"), t("Pendadaran", "Thesis Defence")].map((name, i) => `<li class="${value?.exists && value.level > i ? "is-complete" : ""}"><strong>${name}</strong><span>${value?.exists ? (value.level > i ? t("Selesai", "Completed") : t("Belum selesai", "Not completed")) : t("Belum dicatat", "Not recorded")}</span></li>`).join("")}</ol>`;
  }
  function reason(type) {
    if (
      !enabled ||
      currentUser.role !== "mhs" ||
      !["Outline", "Proposal", "Pendadaran"].includes(type)
    )
      return "";
    if (!mine || mine.unavailable)
      return t(
        "Status akademik belum tersedia. Segarkan data sebelum mendaftar.",
        "Academic status is unavailable. Refresh before submitting.",
      );
    const index = ["Outline", "Proposal", "Pendadaran"].indexOf(type);
    if (mine.level > index)
      return t(
        "Tahap ini sudah selesai. Pilih tahap berikutnya.",
        "This stage is completed. Choose the next stage.",
      );
    if (mine.level < index)
      return index === 1
        ? t(
            "Outline belum ditandai selesai oleh admin. Hubungi admin untuk verifikasi tahapan sebelumnya.",
            "Admin has not marked Outline completed. Contact admin to verify your previous stages.",
          )
        : t(
            "Sempro belum ditandai selesai oleh admin. Hubungi admin untuk verifikasi tahapan sebelumnya.",
            "Admin has not marked the proposal seminar completed. Contact admin to verify your previous stages.",
          );
    return "";
  }
  function render() {
    let root = $("verified-academic-status");
    if (!root) {
      root = document.createElement("section");
      root.id = "verified-academic-status";
      root.className = "card student-only";
      $("task-home")?.before(root);
    }
    root.hidden = !enabled || currentUser.role !== "mhs";
    if (!root.hidden)
      root.innerHTML = `<h2>${t("Tahap Akademik Anda", "Your Academic Stage")}</h2><p>${escapeHtml(summary(mine))}</p>${stageHtml(mine)}<p class="field-helper">${t("Status ini ditetapkan admin. Jika ujian sudah dilakukan sebelum website digunakan, hubungi admin untuk mencatatnya.", "Admin verifies these stages. Contact admin to record an exam completed before this website was introduced.")}</p>`;
    const select = $("reg-jenis-utama");
    if (select)
      for (const option of select.options) {
        if (!["Outline", "Proposal", "Pendadaran"].includes(option.value))
          continue;
        const blocked = reason(option.value);
        option.disabled = !!blocked && !activeSameType(option.value);
        option.textContent =
          serviceLabel(option.value) +
          (blocked
            ? " — " +
              (mine?.level >
              ["Outline", "Proposal", "Pendadaran"].indexOf(option.value)
                ? t("Selesai", "Completed")
                : t("Prasyarat belum selesai", "Prerequisite not completed"))
            : "");
      }
    document.querySelectorAll("[data-academic-nim]").forEach((node) => {
      const nim = node.dataset.academicNim;
      node.innerHTML = `<span>${escapeHtml(enabled ? summary(byNim[nim] || { exists: false, level: 0 }) : t("Menunggu aktivasi backend", "Awaiting backend activation"))}</span>${enabled ? `<button type="button" class="text-link" data-edit-academic="${escapeHtml(nim)}">${t("Kelola Tahap", "Manage Stage")}</button>` : ""}`;
    });
  }
  function apply(data) {
    enabled = data.academicSupported === true;
    mine = data.academicUnavailable
      ? { unavailable: true }
      : data.academic || null;
    byNim = data.academicByNim || {};
    render();
  }
  async function api(data) {
    const epoch = sessionEpoch,
      result = await apiPostSuccess(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(data),
      });
    if (epoch !== sessionEpoch)
      throw Object.assign(Error("Session changed"), { staleSession: true });
    return result;
  }
  function shell(title) {
    let modal = $("modal-academic-editor");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-academic-editor";
      modal.className = "overlay";
      modal.style.zIndex = "5000";
      document.body.append(modal);
    }
    modal.style.display = "flex";
    modal.innerHTML = `<section class="modal-card academic-editor" role="dialog" aria-modal="true" aria-labelledby="academic-editor-title"><header class="academic-editor-heading"><div><span class="eyebrow">${t("IPCOS · TAHAP AKADEMIK", "IPCOS · ACADEMIC STAGES")}</span><h2 id="academic-editor-title">${title}</h2></div><button type="button" class="intl-close" data-close-academic aria-label="${t("Tutup pengelolaan tahap", "Close stage management")}">×</button></header><div id="academic-editor-body"></div><p id="academic-editor-feedback" class="field-error" role="status"></p></section>`;
    return modal;
  }
  async function open(nim) {
    if (currentUser.role !== "admin" || !enabled || busy) return;
    const epoch = sessionEpoch;
    editing = nim;
    base = null;
    retry = null;
    shell(t("Kelola Tahap Akademik", "Manage Academic Stage"));
    $("academic-editor-body").textContent = t(
      "Memuat status…",
      "Loading status…",
    );
    try {
      const result = await api({ action: "get_academic_progress", nim });
      if (epoch !== sessionEpoch || editing !== nim) return;
      base = result.academic;
      const student =
        readStoredJSON(sessionStorage, "ipcos_students", []).find(
          (s) => String(s.NIM ?? s.nim) === nim,
        ) ||
        readStoredJSON(sessionStorage, "ipcos_registrations", []).find(
          (s) => String(s.nim) === nim,
        );
      const name = student?.Nama || student?.nama || nim;
      $("academic-editor-body").innerHTML =
        `<p><strong>${escapeHtml(name)}</strong> · ${escapeHtml(nim)}</p>${stageHtml(base)}<p class="field-helper">${t("Pilih tahap terakhir yang sudah selesai. Tahap sebelumnya dianggap telah dilalui; pengajuan berkas tetap diperiksa terpisah.", "Choose the last completed stage. Previous stages are treated as completed; document requests are reviewed separately.")}</p><label for="academic-level">${t("Tahap terakhir selesai", "Last completed stage")}</label><select id="academic-level">${levels()
          .map(
            (label, i) =>
              `<option value="${i}" ${base.level === i ? "selected" : ""}>${label}</option>`,
          )
          .join(
            "",
          )}</select><label for="academic-reason">${t("Keterangan perubahan", "Reason for change")}</label><textarea id="academic-reason" rows="3" maxlength="500" placeholder="${t("Contoh: Sempro selesai sebelum website digunakan.", "Example: Proposal seminar completed before this website was introduced.")}"></textarea><details><summary>${t("Riwayat perubahan tahap", "Stage change history")}</summary><div id="academic-editor-history">${historyHtml(base)}</div></details><div class="button-row"><button type="button" class="btn-secondary" data-close-academic>${t("Tutup", "Close")}</button><button type="button" class="btn-primary" data-save-academic>${t("Simpan Tahap", "Save Stage")}</button></div>`;
      $("academic-level").focus();
    } catch (error) {
      if (epoch === sessionEpoch && !error.staleSession)
        $("academic-editor-feedback").textContent = systemText(error.message);
    }
  }
  async function save() {
    if (busy || !base || currentUser.role !== "admin") return;
    const epoch = sessionEpoch,
      nim = editing,
      level = Number($("academic-level").value),
      note = $("academic-reason").value.trim();
    if (!note) {
      $("academic-editor-feedback").textContent = t(
        "Isi keterangan perubahan.",
        "Enter a reason for the change.",
      );
      $("academic-reason").focus();
      return;
    }
    if (
      !confirm(
        t(
          "Simpan status akademik ini setelah memverifikasi tahapan mahasiswa?",
          "Save this academic status after verifying the student’s completed stages?",
        ),
      )
    )
      return;
    const signature = JSON.stringify([level, note]);
    if (!retry || retry.signature !== signature)
      retry = {
        signature,
        payload: {
          action: "save_academic_progress",
          nim,
          level,
          reason: note,
          revision: base.revision,
          requestId: crypto.randomUUID(),
        },
      };
    busy = true;
    $("modal-academic-editor")
      .querySelectorAll("button,input,textarea,select")
      .forEach((el) => (el.disabled = true));
    try {
      const result = await api(retry.payload);
      if (epoch !== sessionEpoch) return;
      byNim[nim] = result.academic;
      base = result.academic;
      retry = null;
      $("academic-editor-feedback").textContent = t(
        "Tahap akademik tersimpan.",
        "Academic stage saved.",
      );
      $("academic-reason").value = "";
      document.querySelector(
        "#modal-academic-editor .verified-stages",
      ).outerHTML = stageHtml(result.academic);
      $("academic-editor-history").innerHTML = historyHtml(result.academic);
      await syncDatabase();
    } catch (error) {
      if (epoch === sessionEpoch && !error.staleSession)
        $("academic-editor-feedback").textContent = systemText(error.message);
    } finally {
      if (epoch === sessionEpoch) {
        busy = false;
        $("modal-academic-editor")
          .querySelectorAll("button,input,textarea,select")
          .forEach((el) => (el.disabled = false));
      }
    }
  }
  async function changeType() {
    const item = currentCase();
    if (currentUser.role !== "admin" || !enabled || busy || !item) return;
    if (
      (window.IPCOSReviewTools?.dirty() ||
        $("case-action-panel")?.dataset.dirty === "true") &&
      !confirmLeaveCase()
    )
      return;
    const type = $("correct-request-type")?.value,
      note = $("correct-request-reason")?.value.trim();
    if (!note) {
      $("correct-request-feedback").textContent = t(
        "Isi alasan koreksi jenis pengajuan.",
        "Explain the request type correction.",
      );
      return;
    }
    if (
      !confirm(
        t(
          "Ubah jenis pengajuan ini? Berkas dan riwayat dipertahankan; pastikan berkas sesuai jenis tujuan.",
          "Change this request type? Files and history are retained; verify the files match the destination requirements.",
        ),
      )
    )
      return;
    const epoch = sessionEpoch,
      id = String(item.id),
      signature = JSON.stringify([
        id,
        type,
        note,
        item.reviewVersion || item.note,
      ]);
    // Lock before preparing the version: it can make a network request.
    // A second click or a logout during that request must not start a mutation.
    busy = true;
    activeUpdateIds.add(id);
    window.IPCOSReview?.actionsChanged();
    $("correct-request-feedback").textContent = t(
      "Menyimpan koreksi…",
      "Saving correction…",
    );
    try {
      if (!retry || retry.signature !== signature) {
        const version = await window.IPCOSReviewTools.version(item);
        if (
          epoch !== sessionEpoch ||
          currentUser.role !== "admin" ||
          selectedCaseId !== id
        )
          return;
        retry = {
          signature,
          payload: {
            action: "change_request_type",
            id,
            type,
            reason: note,
            version,
            requestId: crypto.randomUUID(),
          },
        };
      }
      await api(retry.payload);
      if (epoch !== sessionEpoch) return;
      retry = null;
      delete typeDrafts[id];
      if ($("correct-request-reason")) $("correct-request-reason").value = "";
      window.IPCOSAdminDrafts?.forget(id);
      window.IPCOSReviewTools?.discardLocal();
      await syncDatabase();
      if (syncPhase === "success" && selectedCaseId === id) openCaseDetail(id);
    } catch (error) {
      if (
        epoch === sessionEpoch &&
        !error.staleSession &&
        $("correct-request-feedback")
      )
        $("correct-request-feedback").textContent = systemText(error.message);
    } finally {
      if (epoch === sessionEpoch) {
        busy = false;
        activeUpdateIds.delete(id);
        window.IPCOSReview?.actionsChanged();
      }
    }
  }
  function caseHtml(item) {
    if (!enabled) return "";
    const draft = typeDrafts[String(item.id)] || {
      type: item.jenis,
      reason: "",
    };
    const value =
      currentUser.role === "admin"
        ? byNim[String(item.nim)] || { exists: false, level: 0 }
        : mine;
    return `<section class="case-academic-stage"><h3>${t("Tahap Akademik", "Academic Stage")}</h3><p>${escapeHtml(summary(value))}</p>${currentUser.role === "admin" ? `<button type="button" class="text-link" data-edit-academic="${escapeHtml(item.nim)}">${t("Kelola Tahap Akademik", "Manage Academic Stage")}</button>` : ""}</section>${currentUser.role === "admin" && ["Outline", "Proposal", "Pendadaran"].includes(item.jenis) && ["pending", "revision", "resubmitted"].includes(String(item.status).toLowerCase()) ? `<details class="request-type-correction"><summary>${t("Koreksi Jenis Pengajuan", "Correct Request Type")}</summary><p class="field-helper">${t("Untuk salah memilih pendaftaran. Berkas dan riwayat tetap tersimpan. Pengajuan kembali menunggu pemeriksaan admin.", "For a wrong registration selection. Files and history are retained.")}</p><label for="correct-request-type">${t("Jenis tujuan", "Destination type")}</label><select id="correct-request-type">${["Outline", "Proposal", "Pendadaran"].map((type) => `<option value="${type}" ${type === draft.type ? "selected" : ""}>${escapeHtml(serviceLabel(type))}</option>`).join("")}</select><label for="correct-request-reason">${t("Alasan koreksi", "Correction reason")}</label><textarea id="correct-request-reason" rows="2" maxlength="500">${escapeHtml(draft.reason)}</textarea><p id="correct-request-feedback" class="field-error" role="status"></p><button type="button" class="btn-secondary" data-change-request-type>${t("Simpan Koreksi Jenis", "Save Type Correction")}</button></details>` : ""}`;
  }
  document.addEventListener("input", (event) => {
    if (
      ["correct-request-type", "correct-request-reason"].includes(
        event.target.id,
      )
    )
      typeDrafts[selectedCaseId] = {
        type: $("correct-request-type").value,
        reason: $("correct-request-reason").value,
      };
  });
  document.addEventListener(
    "keydown",
    (event) => {
      const modal = $("modal-academic-editor");
      if (!modal || modal.style.display !== "flex") return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        modal.querySelector("[data-close-academic]")?.click();
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
  document.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-academic]");
    if (edit) open(edit.dataset.editAcademic);
    if (event.target.closest("[data-close-academic]") && !busy) {
      if (
        $("academic-reason")?.value.trim() &&
        !confirm(
          t(
            "Tutup tanpa menyimpan keterangan ini?",
            "Close without saving this reason?",
          ),
        )
      )
        return;
      $("modal-academic-editor").style.display = "none";
      editing = "";
    }
    if (event.target.closest("[data-save-academic]")) save();
    if (event.target.closest("[data-change-request-type]")) changeType();
  });
  window.addEventListener("ipcos:logout", () => {
    enabled = false;
    mine = null;
    byNim = {};
    busy = false;
    editing = "";
    base = null;
    retry = null;
    typeDrafts = {};
    $("modal-academic-editor")?.remove();
    $("verified-academic-status")?.replaceChildren();
  });
  window.IPCOSAcademic = {
    apply,
    render,
    languageChanged,
    reason,
    caseHtml,
    dirty: () => $("correct-request-reason")?.value.trim().length > 0,
    enabled: () => enabled,
  };
})();
