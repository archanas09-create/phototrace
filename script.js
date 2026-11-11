(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const page = document.body.dataset.page;
  const supportedTypes = {
    jpeg: { mime: "image/jpeg", extension: "jpg", label: "JPEG" },
    png: { mime: "image/png", extension: "png", label: "PNG" },
    webp: { mime: "image/webp", extension: "webp", label: "WebP" }
  };
  const metadataFields = [
    { label: "Camera make", tags: ["Make"] },
    { label: "Camera model", tags: ["Model"] },
    { label: "Lens model", tags: ["LensModel"] },
    { label: "Date taken", tags: ["DateTimeOriginal", "DateTimeDigitized", "DateTime"] },
    { label: "Image dimensions", file: true },
    { label: "File format", file: true },
    { label: "File size", file: true },
    { label: "GPS coordinates", gps: true },
    { label: "ISO", tags: ["ISOSpeedRatings", "PhotographicSensitivity"] },
    { label: "Aperture", tags: ["FNumber", "ApertureValue"], format: "aperture" },
    { label: "Shutter speed", tags: ["ExposureTime"], format: "shutter" },
    { label: "Focal length", tags: ["FocalLength"], format: "focal" }
  ];
  const sensitiveFields = [
    ["Software", "Editing software"],
    ["Artist", "Creator name"],
    ["Copyright", "Copyright"],
    ["ImageDescription", "Image description"],
    ["UserComment", "User comment"],
    ["CameraSerialNumber", "Camera serial number"],
    ["BodySerialNumber", "Body serial number"],
    ["LensSerialNumber", "Lens serial number"],
    ["SerialNumber", "Serial number"],
    ["OwnerName", "Camera owner"],
    ["GPSAltitude", "GPS altitude"],
    ["GPSDateStamp", "GPS date"],
    ["GPSProcessingMethod", "GPS source"]
  ];
  const state = {
    generation: 0,
    file: null,
    type: null,
    image: null,
    imageUrl: null,
    cleanBlob: null,
    cleanUrl: null,
    exif: {},
    exifError: null
  };
  let toastTimer = 0;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;
  document.body.append(toast);

  function showToast(message, kind = "success") {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast toast-${kind} is-visible`;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => { toast.hidden = true; }, 220);
    }, 2900);
  }

  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
  });

  function setText(selector, text) {
    const element = $(selector);
    if (element) element.textContent = text;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
  }

  function identifyType(file) {
    const name = file.name.toLowerCase();
    const extension = name.includes(".") ? name.split(".").pop() : "";
    if (file.type === "image/jpeg" || extension === "jpg" || extension === "jpeg") return "jpeg";
    if (file.type === "image/png" || extension === "png") return "png";
    if (file.type === "image/webp" || extension === "webp") return "webp";
    return null;
  }

  async function sniffType(file) {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
    return null;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("This image could not be decoded. It may be damaged or use an unsupported encoding."));
      image.src = url;
    });
  }

  function updateClearButton(hasPhoto) {
    document.querySelectorAll("[data-clear-photo]").forEach((button) => { button.hidden = !hasPhoto; });
  }

  function clearLegacyStoredPhoto() {
    if (!window.indexedDB) return;
    const reportFailure = (message) => {
      setStatus(message, "error");
      showToast(message, "error");
    };
    try {
      const request = window.indexedDB.deleteDatabase("phototrace-local");
      request.onerror = () => {
        reportFailure("A photo saved by an older PhotoTrace version could not be cleared. Clear this site's browser data to remove it.");
      };
      request.onblocked = () => {
        reportFailure("Close other PhotoTrace tabs so this version can clear the photo saved by an older version.");
      };
    } catch {
      reportFailure("A photo saved by an older PhotoTrace version could not be cleared. Clear this site's browser data to remove it.");
    }
  }

  function showWorkflowView(view, updateHistory = true) {
    const target = document.querySelector(`[data-workflow-view="${view}"]`);
    if (!target) return;
    document.querySelectorAll("[data-workflow-view]").forEach((section) => { section.hidden = section !== target; });
    if (updateHistory && window.location.hash !== `#${view}`) {
      window.history.pushState({ view }, "", `#${view}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (view === "analysis" && state.file && state.image) {
      renderMetadata();
      renderPrivacy();
    }
    if (view === "privacy" && state.file && state.image) renderPrivacy();
    if (view === "clean" && state.file && state.image) {
      $("#clean-button").disabled = false;
      $("#before-image").src = state.imageUrl;
      $("#before-image").hidden = false;
      $("#before-image").parentElement.querySelector(".comparison-empty").textContent = "Choose a photo first";
      $("#comparison").hidden = Boolean(!state.cleanBlob);
      if (state.cleanBlob && state.cleanUrl) {
        $("#after-image").src = state.cleanUrl;
        $("#after-image").hidden = false;
        $("#download-button").hidden = false;
        $("#download-button").disabled = false;
      }
      setText("#before-caption", `${supportedTypes[state.type].label} · ${formatBytes(state.file.size)}`);
    }
  }

  function revokeImageUrls() {
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    if (state.cleanUrl) URL.revokeObjectURL(state.cleanUrl);
    state.imageUrl = null;
    state.cleanUrl = null;
    state.cleanBlob = null;
  }

  function setFilePreview(file, image) {
    const details = `${image.naturalWidth} × ${image.naturalHeight} px · ${formatBytes(file.size)} · ${supportedTypes[state.type].label}`;
    if ($("#home-sample")) $("#home-sample").hidden = true;
    if ($("#selected-photo")) {
      $("#preview-image").src = state.imageUrl;
      setText("#file-name", file.name);
      setText("#file-details", details);
      $("#selected-photo").hidden = false;
    }
    const pageBar = $("#page-file-bar");
    if (pageBar) {
      $("#page-photo").src = state.imageUrl;
      setText("#page-file-name", file.name);
      setText("#page-file-size", details);
      pageBar.hidden = false;
    }
    if ($("#analysis-preview")) {
      $("#analysis-preview").src = state.imageUrl;
      $("#analysis-preview").hidden = false;
      $("#analysis-empty").hidden = true;
      setText("#analysis-file-name", file.name);
    }
    if (page === "home" || page === "analyze") {
      $("#analyze-button").disabled = false;
      $(".button-label").textContent = page === "home" ? "Explore My Photo" : "Analyze this photo";
    }
    updateClearButton(true);
  }

  function clearRenderedPhoto() {
    revokeImageUrls();
    state.file = null;
    state.type = null;
    state.image = null;
    state.exif = {};
    state.exifError = null;
    updateClearButton(false);
    if ($("#selected-photo")) {
      $("#selected-photo").hidden = true;
      $("#preview-image").removeAttribute("src");
      $("#file-input").value = "";
      $("#analyze-button").disabled = true;
      $(".button-label").textContent = page === "home" ? "Explore My Photo" : "Analyze this photo";
      setText("#status-message", "");
      $("#status-message").className = "status-message";
    }
    if ($("#home-sample")) $("#home-sample").hidden = false;
    if ($("#page-file-bar")) {
      $("#page-file-bar").hidden = true;
      $("#page-photo").removeAttribute("src");
    }
    if ($("#analysis-preview")) {
      $("#analysis-preview").removeAttribute("src");
      $("#analysis-preview").hidden = true;
      $("#analysis-empty").hidden = false;
      setText("#analysis-file-name", "No photo selected");
      ["#camera-make", "#camera-model", "#camera-lens", "#capture-date", "#capture-time", "#capture-dimensions", "#gps-coordinates", "#image-format", "#image-size", "#image-resolution"].forEach((selector) => setText(selector, "Not available"));
      $("#gps-map-link").hidden = true;
    }
    if ($("#analysis-loading")) $("#analysis-loading").hidden = true;
    if ($("#privacy-loading")) $("#privacy-loading").hidden = true;
    if ($("#metadata-list")) $("#metadata-list").replaceChildren(makeEmpty("Choose a photo to see its details."));
    if ($("#metadata-notice")) {
      $("#metadata-notice").textContent = "Choose a photo to see its embedded details.";
      $("#metadata-notice").className = "notice notice-info";
    }
    if ($("#privacy-status-list")) $("#privacy-status-list").replaceChildren(makeEmpty("Choose and analyze a photo first."));
    if ($("#privacy-summary-title")) setText("#privacy-summary-title", "Choose a photo first");
    if ($("#privacy-summary-copy")) setText("#privacy-summary-copy", "Your privacy check will appear here.");
    if ($("#sensitive-tags")) $("#sensitive-tags").replaceChildren(makeEmpty("Choose a photo to check for these details."));
    if ($("#before-image")) {
      $("#comparison").hidden = true;
      $("#before-image").removeAttribute("src");
      $("#before-image").hidden = false;
      $("#after-image").removeAttribute("src");
      $("#after-image").hidden = true;
      $("#before-image").parentElement.querySelector(".comparison-empty").textContent = "Choose a photo first";
      $(".clean-image-wrap .comparison-empty").textContent = "Your new copy will appear here";
      setText("#before-caption", "The source stays unchanged");
      setText("#after-caption", "A new file made on this device");
      $("#download-button").disabled = true;
      $("#download-button").hidden = true;
      $("#clean-button").disabled = true;
      $(".button-label").textContent = "Create clean copy";
      setCleanStatus("");
    }
  }

  function makeEmpty(message) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    return empty;
  }

  function setStatus(message, kind = "") {
    const status = $("#status-message");
    if (!status) return;
    status.textContent = message;
    status.className = `status-message${kind ? ` is-${kind}` : ""}`;
  }

  function setCleanStatus(message, isError = false) {
    const status = $("#clean-result");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
    if (message && !message.includes("Re-encoding")) showToast(message, isError ? "error" : "success");
  }

  function tagValue(tags, key) {
    const tag = tags?.[key];
    return tag ? (tag.description ?? tag.value ?? null) : null;
  }

  function formatTagValue(value) {
    if (value === null || value === undefined || value === "") return null;
    if (Array.isArray(value)) return value.map(formatTagValue).filter(Boolean).join(", ");
    if (typeof value === "object") {
      if ("numerator" in value && "denominator" in value) {
        return value.denominator ? String(value.numerator / value.denominator) : String(value.numerator);
      }
      return null;
    }
    return String(value).trim() || null;
  }

  function firstTagText(tags, keys) {
    for (const key of keys ?? []) {
      const value = formatTagValue(tagValue(tags, key));
      if (value) return value;
    }
    return null;
  }

  function numericPart(value) {
    if (typeof value === "number") return value;
    if (Array.isArray(value) && value.length === 2) {
      const numerator = Number(value[0]);
      const denominator = Number(value[1]);
      if (Number.isFinite(numerator) && Number.isFinite(denominator)) return denominator ? numerator / denominator : Number.NaN;
    }
    if (value && typeof value === "object" && "numerator" in value && "denominator" in value) {
      return value.denominator ? value.numerator / value.denominator : Number.NaN;
    }
    return Number(value);
  }

  function coordinate(tags, key, refKey) {
    const tag = tags?.[key];
    const raw = tag?.value;
    if (raw === undefined || raw === null) return null;
    let decimal;
    if (typeof tag.description === "number" && Number.isFinite(tag.description)) {
      decimal = tag.description;
    } else if (Array.isArray(raw)) {
      const parts = raw.map(numericPart);
      if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
      decimal = parts.length >= 3 ? parts[0] + parts[1] / 60 + parts[2] / 3600 : parts[0];
    } else {
      decimal = numericPart(raw);
    }
    if (!Number.isFinite(decimal)) return null;
    const reference = formatTagValue(tagValue(tags, refKey) ?? tags?.[refKey]?.value)?.toUpperCase();
    if (reference?.startsWith("S") || reference?.startsWith("W")) decimal *= -1;
    return decimal;
  }

  function getGps(tags) {
    const latitude = coordinate(tags, "GPSLatitude", "GPSLatitudeRef");
    const longitude = coordinate(tags, "GPSLongitude", "GPSLongitudeRef");
    if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  function formattedExifValue(tags, field) {
    const raw = firstTagText(tags, field.tags);
    if (!raw) return null;
    const number = numericPart(tagValue(tags, field.tags[0]));
    if (field.format === "aperture" && Number.isFinite(number)) return `f/${number.toFixed(1).replace(/\.0$/, "")}`;
    if (field.format === "focal" && Number.isFinite(number)) return `${number} mm`;
    if (field.format === "shutter" && Number.isFinite(number) && number > 0 && number < 1) return `1/${Math.round(1 / number)}`;
    return raw;
  }

  function addMetadataRow(label, value, isFileValue = false) {
    const row = document.createElement("div");
    row.className = "metadata-row";
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value || "Not available";
    if (isFileValue) {
      const source = document.createElement("span");
      source.className = "derived-tag";
      source.textContent = "From image file";
      description.append(source);
    }
    row.append(term, description);
    return row;
  }

  function renderMetadata() {
    const list = $("#metadata-list");
    if (!list || !state.file || !state.image) return;
    list.replaceChildren(...metadataFields.map((field) => {
      let value;
      if (field.file) {
        value = field.label === "Image dimensions"
          ? `${state.image.naturalWidth} × ${state.image.naturalHeight} px`
          : field.label === "File format"
            ? supportedTypes[state.type].label
            : formatBytes(state.file.size);
      } else if (field.gps) {
        value = getGps(state.exif);
      } else {
        value = formattedExifValue(state.exif, field);
      }
      if (state.exifError && !field.file) value = "Could not read EXIF";
      return addMetadataRow(field.label, value, field.file);
    }));
    const make = firstTagText(state.exif, ["Make"]) || "Not available";
    const model = firstTagText(state.exif, ["Model"]) || "Not available";
    const lens = firstTagText(state.exif, ["LensModel", "LensSpecification"]) || "Not available";
    const capture = firstTagText(state.exif, ["DateTimeOriginal", "DateTimeDigitized", "DateTime"]);
    const dateTime = capture?.match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})[ T](.+)$/);
    const gps = state.exifError ? null : getGps(state.exif);
    const hasCamera = !state.exifError && Boolean(firstTagText(state.exif, ["Make", "Model"]));
    const values = {
      "#camera-make": state.exifError ? "Could not read EXIF" : make,
      "#camera-model": state.exifError ? "Could not read EXIF" : model,
      "#camera-lens": state.exifError ? "Could not read EXIF" : lens,
      "#capture-date": state.exifError ? "Could not read EXIF" : dateTime ? `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}` : capture || "Not available",
      "#capture-time": state.exifError ? "Could not read EXIF" : dateTime ? dateTime[4] : "Not available",
      "#capture-dimensions": `${state.image.naturalWidth} × ${state.image.naturalHeight} px`,
      "#gps-coordinates": state.exifError ? "Could not read EXIF" : gps || "Not available",
      "#image-format": supportedTypes[state.type].label,
      "#image-size": formatBytes(state.file.size),
      "#image-resolution": `${state.image.naturalWidth} × ${state.image.naturalHeight} px`
    };
    Object.entries(values).forEach(([selector, value]) => setText(selector, value));
    if ($("#image-gps-label")) $("#image-gps-label").hidden = !gps || Boolean(state.exifError);
    if ($("#image-camera-label")) $("#image-camera-label").hidden = !hasCamera;
    if ($("#privacy-observation")) {
      const observation = state.exifError
        ? "Embedded metadata could not be checked. No conclusions can be drawn from this scan."
        : gps
          ? "Location coordinates are embedded in this image. Consider whether you want them to travel with it."
          : hasCamera
            ? "Camera details are embedded in this image. No GPS coordinates were found in the readable EXIF."
            : "No GPS coordinates were found in the readable EXIF. The visible scene can still reveal details.";
      setText("#privacy-observation", observation);
    }
    const mapLink = $("#gps-map-link");
    mapLink.hidden = !gps || Boolean(state.exifError);
    if (gps) mapLink.href = `https://maps.google.com/?q=${encodeURIComponent(gps)}`;
    const notice = $("#metadata-notice");
    if (state.exifError) {
      notice.textContent = state.exifError.message;
      notice.className = "notice is-error";
    } else {
      notice.textContent = "Camera and capture values are read from the original EXIF data. Dimensions, format, and size are derived from the image file.";
      notice.className = "notice notice-info";
    }
  }

  function addPrivacyFinding(message, kind) {
    const item = document.createElement("div");
    item.className = `privacy-status ${kind}`;
    const dot = document.createElement("span");
    dot.className = "status-dot";
    dot.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = message;
    item.append(dot, text);
    return item;
  }

  function renderPrivacy() {
    const list = $("#privacy-status-list");
    if (!list || !state.file) return;
    list.replaceChildren();
    if (state.exifError) {
      list.append(addPrivacyFinding("EXIF reader unavailable — metadata could not be checked", "unknown"));
      setText("#privacy-summary-title", "Metadata couldn't be checked");
      setText("#privacy-summary-copy", "No conclusion about your photo's embedded details is possible.");
    } else {
      const gps = getGps(state.exif);
      const hasDevice = Boolean(firstTagText(state.exif, ["Make", "Model"]));
      const hasDate = Boolean(firstTagText(state.exif, ["DateTimeOriginal", "DateTimeDigitized", "DateTime"]));
      const hasOther = sensitiveFields.some(([key]) => firstTagText(state.exif, [key]));
      const hasAny = Boolean(gps || hasDevice || hasDate || hasOther || metadataFields.some((field) => field.tags && firstTagText(state.exif, field.tags)));
      const findings = [
        [hasAny ? "Metadata found in this photo" : "No recognizable EXIF metadata found", hasAny ? "found" : "clear"],
        [gps ? "Location information found" : "No GPS metadata detected", gps ? "found" : "clear"],
        [hasDevice ? "Camera or device information found" : "No camera or device details detected", hasDevice ? "found" : "clear"],
        [hasDate ? "Capture date found" : "No capture date detected", hasDate ? "found" : "clear"],
        [hasOther ? "Other potentially sensitive metadata found" : "No additional listed sensitive details detected", hasOther ? "found" : "clear"]
      ];
      findings.forEach(([message, kind]) => list.append(addPrivacyFinding(message, kind)));
      setText("#privacy-summary-title", gps || hasDevice || hasDate || hasOther ? "Some details may travel with this image" : "No recognizable EXIF metadata found");
      setText("#privacy-summary-copy", "Only embedded metadata is checked here. The photo itself can reveal more.");
    }

    const tags = $("#sensitive-tags");
    tags.replaceChildren();
    const present = state.exifError ? [] : sensitiveFields
      .map(([key, label]) => ({ label, value: firstTagText(state.exif, [key]) }))
      .filter((entry) => entry.value);
    if (present.length) {
      present.forEach(({ label, value }) => {
        const chip = document.createElement("span");
        chip.className = "sensitive-tag";
        chip.textContent = `${label}: ${value}`;
        tags.append(chip);
      });
    } else {
      tags.append(makeEmpty(state.exifError ? "These details could not be checked because the EXIF reader is unavailable." : "No additional details from this list were found in your photo."));
    }
  }

  async function loadExif(generation) {
    try {
      if (!window.ExifReader || typeof window.ExifReader.load !== "function") {
        throw new Error("The EXIF reader library did not load. Check your connection to read embedded metadata.");
      }
      const exif = await window.ExifReader.load(state.file);
      if (generation !== state.generation) return false;
      state.exif = exif;
      state.exifError = null;
    } catch (error) {
      if (generation !== state.generation) return false;
      state.exif = {};
      state.exifError = error instanceof Error ? error : new Error("EXIF metadata could not be read.");
    }
    return generation === state.generation;
  }

  function showPageError(message) {
    if ($("#analysis-loading")) $("#analysis-loading").hidden = true;
    if ($("#privacy-loading")) $("#privacy-loading").hidden = true;
    if ($("#status-message")) {
      setStatus(message, "error");
      showToast(message, "error");
      return;
    }
    const notice = $("#metadata-notice");
    if (notice) {
      notice.textContent = message;
      notice.className = "notice is-error";
    }
    const empty = $("#metadata-list .empty-state");
    if (empty) empty.textContent = message;
    if ($("#privacy-summary-title")) setText("#privacy-summary-title", "Your photo couldn't be loaded");
    if ($("#privacy-summary-copy")) setText("#privacy-summary-copy", message);
    if ($("#privacy-status-list")) $("#privacy-status-list").replaceChildren(makeEmpty(message));
    if ($("#clean-result")) setCleanStatus(message, true);
    showToast(message, "error");
  }

  async function selectFile(file) {
    if (!file) return;
    const generation = ++state.generation;
    clearRenderedPhoto();
    if (!file.size) {
      setStatus("This file is empty. Choose a valid JPEG, PNG, or WebP image.", "error");
      showToast("This file is empty.", "error");
      return;
    }
    const claimedType = identifyType(file);
    if (!claimedType) {
      setStatus("Unsupported file. Choose a JPEG, PNG, or WebP image.", "error");
      showToast("Choose a JPEG, PNG, or WebP photo.", "error");
      return;
    }
    $("#analyze-button").disabled = true;
    $(".button-label").textContent = "Checking image…";
    setStatus("Checking the image on your device…");
    try {
      const detectedType = await sniffType(file);
      if (generation !== state.generation) return;
      if (!detectedType || detectedType !== claimedType || (file.type && file.type !== supportedTypes[detectedType].mime)) {
        throw new Error("The file contents do not match a supported JPEG, PNG, or WebP image.");
      }
      const url = URL.createObjectURL(file);
      let image;
      try {
        image = await loadImage(url);
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
      if (generation !== state.generation) {
        URL.revokeObjectURL(url);
        return;
      }
      state.file = file;
      state.type = detectedType;
      state.image = image;
      state.imageUrl = url;
      setFilePreview(file, image);
      setStatus("Photo looks good. Continue to inspect its details.", "success");
      $("#analyze-button").disabled = false;
      $(".button-label").textContent = page === "home" ? "Explore My Photo" : "Analyze this photo";
      showToast("Photo ready. Your image stays on this device.");
    } catch (error) {
      if (generation !== state.generation) return;
      $(".button-label").textContent = page === "home" ? "Explore My Photo" : "Analyze this photo";
      setStatus(error.message, "error");
      showToast(error.message, "error");
    }
  }

  async function continueToAnalysis() {
    if (!state.file || !state.image) return;
    const generation = ++state.generation;
    const button = $("#analyze-button");
    button.disabled = true;
    $(".button-label").textContent = "Reading photo…";
    setStatus("Reading photo details on this device…");
    $("#analysis-loading").hidden = false;
    try {
      const current = await loadExif(generation);
      if (!current) return;
      if (generation !== state.generation) return;
      renderMetadata();
      renderPrivacy();
      $("#analysis-loading").hidden = true;
      $("#privacy-loading").hidden = true;
      button.disabled = false;
      $(".button-label").textContent = "Explore my photo";
      showWorkflowView("analysis");
      showToast(state.exifError?.message || "Photo details are ready.", state.exifError ? "error" : "success");
    } catch (error) {
      if (generation !== state.generation) return;
      $("#analysis-loading").hidden = true;
      button.disabled = false;
      $(".button-label").textContent = "Explore my photo";
      setStatus(error.message || "The photo could not be analyzed.", "error");
      showToast(error.message || "The photo could not be analyzed.", "error");
    }
  }

  function canvasBlob(canvas, mimeType) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Your browser could not create a clean copy of this image."));
          return;
        }
        resolve(blob);
      }, mimeType, mimeType === "image/png" ? undefined : .92);
    });
  }

  async function removeMetadata() {
    if (!state.image || !state.file || !state.type) return;
    const generation = ++state.generation;
    $("#clean-button").disabled = true;
    $(".button-label").textContent = "Creating clean copy…";
    $("#download-button").disabled = true;
    setCleanStatus("Re-encoding this photo on your device…");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = state.image.naturalWidth;
      canvas.height = state.image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable in this browser.");
      context.drawImage(state.image, 0, 0);
      const mimeType = supportedTypes[state.type].mime;
      const blob = await canvasBlob(canvas, mimeType);
      if (generation !== state.generation) return;
      if (blob.type !== mimeType) {
        throw new Error(`This browser cannot create a clean ${supportedTypes[state.type].label} copy. Your original is unchanged.`);
      }
      if (state.cleanUrl) URL.revokeObjectURL(state.cleanUrl);
      state.cleanBlob = blob;
      state.cleanUrl = URL.createObjectURL(blob);
      $("#after-image").src = state.cleanUrl;
      $("#after-image").hidden = false;
      $("#comparison").hidden = false;
      $("#download-button").hidden = false;
      $(".clean-image-wrap .comparison-empty").textContent = "Your new copy will appear here";
      setText("#after-caption", `${supportedTypes[state.type].label} · ${formatBytes(blob.size)}`);
      $("#download-button").disabled = false;
      setCleanStatus("Clean copy ready. Your original is unchanged; image quality may differ.");
    } catch (error) {
      if (generation !== state.generation) return;
      setCleanStatus(error.message || "The clean copy could not be created. Your original is unchanged.", true);
    } finally {
      if (generation === state.generation) {
        $("#clean-button").disabled = false;
        $(".button-label").textContent = "Create clean copy";
      }
    }
  }

  function downloadCleanCopy() {
    if (!state.cleanBlob || !state.cleanUrl || !state.file) return;
    const baseName = state.file.name.replace(/\.[^.]+$/, "") || "photo";
    const link = document.createElement("a");
    link.href = state.cleanUrl;
    link.download = `${baseName}-clean.${supportedTypes[state.type].extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setCleanStatus("Download started. The clean copy is separate from your original.");
  }

  function clearCurrentPhoto() {
    state.generation += 1;
    clearRenderedPhoto();
    showWorkflowView("home");
    setStatus("Photo removed from this page.", "success");
    showToast("Photo removed from this page.");
  }

  function setupUpload() {
    const input = $("#file-input");
    const dropzone = $("#dropzone");
    if (!input || !dropzone) return;
    input.addEventListener("change", (event) => selectFile(event.currentTarget.files?.[0]));
    dropzone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        input.click();
      }
    });
    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    });
    dropzone.addEventListener("dragleave", (event) => {
      if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-dragging");
    });
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.remove("is-dragging");
      $("#home-upload")?.classList.remove("is-dragging");
      selectFile(event.dataTransfer.files?.[0]);
    });
    const homeUpload = $("#home-upload");
    if (homeUpload) {
      homeUpload.addEventListener("dragover", (event) => {
        event.preventDefault();
        homeUpload.classList.add("is-dragging");
      });
      homeUpload.addEventListener("dragleave", (event) => {
        if (!homeUpload.contains(event.relatedTarget)) homeUpload.classList.remove("is-dragging");
      });
      homeUpload.addEventListener("drop", (event) => {
        event.preventDefault();
        homeUpload.classList.remove("is-dragging");
        selectFile(event.dataTransfer.files?.[0]);
      });
    }
    $("#analyze-button").addEventListener("click", continueToAnalysis);
    const replaceButton = $("#replace-selection");
    if (replaceButton) replaceButton.addEventListener("click", () => $("#file-input").click());
    $("#clear-selection").addEventListener("click", () => {
      state.generation += 1;
      clearRenderedPhoto();
      setStatus("Photo selection cleared.", "success");
    });
  }

  document.querySelectorAll("[data-clear-photo]").forEach((button) => button.addEventListener("click", clearCurrentPhoto));
  if (page === "home") setupUpload();
  if ($("#clean-button")) {
    $("#clean-button").addEventListener("click", removeMetadata);
    $("#download-button").addEventListener("click", downloadCleanCopy);
  }

  document.querySelectorAll("[data-go]").forEach((control) => {
    control.addEventListener("click", (event) => {
      event.preventDefault();
      showWorkflowView(control.dataset.go);
    });
  });
  window.addEventListener("popstate", () => {
    const view = window.location.hash.slice(1);
    showWorkflowView(document.querySelector(`[data-workflow-view="${view}"]`) ? view : "home", false);
  });

  if (window.location.hash && window.location.hash !== "#home") {
    const homeUrl = new URL(window.location.href);
    homeUrl.hash = "home";
    window.history.replaceState({ view: "home" }, "", homeUrl);
  }
  showWorkflowView("home", false);
  updateClearButton(false);
  clearLegacyStoredPhoto();
  window.addEventListener("pagehide", () => {
    state.generation += 1;
    clearRenderedPhoto();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    showWorkflowView("home", false);
    const homeUrl = new URL(window.location.href);
    homeUrl.hash = "home";
    window.history.replaceState({ view: "home" }, "", homeUrl);
  });
})();
