# Assets and optional providers

## Asset libraries

The generator page can import multiple images and videos into **This project** or **Reusable defaults**. Imported files are copied into managed app storage, hashed, and cataloged. Filename/metadata analysis works locally; the Analyze API adds bounded Qwen-VL frame analysis when a Modal vision endpoint is configured. User descriptions and exclusions take precedence.

## Bundled SFX index

The curated offline library is in `assets/defaults/`. Its `manifest.json` is machine-readable and records each sound's stable ID, semantic cue type/tags, provenance, gain, full duration, and recommended `sourceIn`/`sourceOut` trim. The sound-effect planner places a bounded number of cues at scene changes, renders one exact-duration audio timeline, and mixes it below narration. Every selected cue is written to the job report with both its video timeline position and source trim range. Users can disable bundled SFX or set volume and maximum cues per minute in Project configuration.

Only assets supported by the current renderer were copied from the shared collection. Large ProRes overlays, installers, preview files, PDFs, and operating-system metadata remain excluded. This keeps the application small and prevents indexed-but-unusable defaults.

## Modal endpoints

Image and vision workers accept a normal HTTPS endpoint URL. The token fields are optional and used only for a deliberately protected proxy. The Qwen image adapter supports the shared endpoint's direct-image and HTTP 202/poll response paths. Deployment source and manual setup are in `modal/`; no cloud deployment is automatic.

Project and default-library toggles are honored before cached search results. Disabling an individual asset removes it from matching. Video trim ranges and clip-audio preferences are stored in each asset record; narration remains the primary audio by default.

## Provider order and failure behavior

The pipeline first considers eligible local assets, then configured stock/open-web sources. Specific named events and people are searched across more providers and retained with provenance and verification state. A rejected or unusable asset becomes a neutral card unless the project chooses **Fail the job**.

Serper is optional. It is off by default, has a user-supplied estimate capped at 2,500 free credits, and has no purchase, top-up, subscription, or upgrade path. Missing keys, authentication errors, rate limits, exhaustion, and network failures continue through other enabled sources. The persisted counter is conservative and cannot know about use of the same key outside this app.

Pexels, Pixabay, Wikimedia and DuckDuckGo remain independently configurable. DuckDuckGo supports images only in this build. `yt-dlp` is optional and used for supported user/event video pages; missing `yt-dlp` does not prevent stock assets or uploaded files from working.

## AI images

AI image fallback is explicit and disabled by default. Qwen generation will not be called for a scene marked as a real-person reference or whose request asks for a real personality portrait. Generated imagery is tracked as generated and is not treated as authentic event footage.

## Exact avatar mode

Exact mode converts count and duration to output frames, schedules distinct intervals, and prevents asset failure from exposing the avatar outside them. Transitions that shorten the narration timeline are disabled in exact/off mode. The final result contains a render report with requested/rendered visibility, assets, warnings, and provider usage counts.
