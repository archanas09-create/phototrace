# PhotoTrace

PhotoTrace is a responsive, static photo-metadata viewer and cleaner with an independent photo-journal aesthetic. Choose a picture to inspect its readable EXIF details and privacy findings, then create and download a separate Canvas-re-encoded copy without the original metadata.

## Run locally

No build step, package manager, backend, or installation is required. Serve this folder with a static file server. For example, with Python:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`. Keep the app open while you analyze and clean the photo; its workflow changes views in the same page without reloading.

## Use the app

1. Choose or drop a JPEG, PNG, or WebP on the home page. PhotoTrace checks the file signature and confirms the browser can decode it.
2. Select **Explore my photo** to read the available EXIF details and see file-derived dimensions, format, and size.
3. Open **Privacy notes** for a report of location, camera, date, and other listed metadata findings. Missing GPS is not treated as proof that an image is safe.
4. Choose **Create clean copy** to re-encode a separate image, compare it with the original, and download it. The original is never overwritten.
5. Remove the selected photo or leave/reload the app to discard the in-memory file and generated copy.

## Privacy and limitations

PhotoTrace does not upload, persist, or save the selected photo to browser storage. The browser holds it in memory only while the app page is open; navigating away, reloading, or closing the page discards the in-memory photo and clean copy. The app removes the legacy `phototrace-local` IndexedDB database used by an earlier version. If this cleanup is blocked by an older open PhotoTrace tab, close that tab and reload the app.

Image preview, EXIF reading, and Canvas re-encoding happen in the browser. PhotoTrace does not request camera, location, or other device permissions. The ExifReader bundle and display fonts are loaded from CDNs; those requests do not include the selected photo. If ExifReader is unavailable, the app clearly indicates that metadata could not be checked; local image preview and Canvas cleaning remain on-device.

Dimensions, format, and file size come from the image file and browser decoder. Camera, capture date, GPS, and other embedded details are only reported when present in readable EXIF data. Missing GPS does not mean an image is completely private. Browser memory-only handling reduces persistence, but does not protect against a compromised device, malicious browser extensions, or other software with access to the browser.

The app accepts JPEG, PNG, and WebP; other image formats may not decode or export consistently across browsers. Re-encoding can change image quality or characteristics. PhotoTrace only shows the clean-copy success state after Canvas has generated a blob in the requested format; if a browser cannot produce it, the app reports an error instead of offering a mislabeled copy. The legacy `analyze.html`, `metadata.html`, and `clean.html` URLs now redirect to the home page because photo processing must stay in the same page session.

## Deploy to GitHub Pages

1. Add `index.html`, `how-it-works.html`, `privacy.html`, `about.html`, the legacy redirect pages (`analyze.html`, `metadata.html`, and `clean.html`), `style.css`, `script.js`, and the `assets` folder to the repository.
2. Open **Settings → Pages** in the GitHub repository.
3. Under **Build and deployment**, choose **Deploy from a branch**, select the branch containing these files and the repository root (`/`), then save.
4. Open the published Pages URL after deployment finishes.

This is a static site and needs no build workflow.
