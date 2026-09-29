# Avatar Editor: implementation plan

Status: ready for implementation; no application changes are included in this document.

Prepared: 2026-09-27. Target: the existing Electron / React / Express / FFmpeg project in this repository.

## 1. Instructions for the implementing agent

Implement this plan in order, completing and verifying each milestone before moving on. Read the existing code before editing it. Preserve unrelated changes and working features. Use the existing JavaScript backend and React frontend; add Python only for local inference and Modal services. Do not rewrite the application or introduce an unrelated video framework.

The user wants a practical application for one channel producing about ten 20-minute videos per month. Prioritize reliable timing, relevant assets, reusable libraries, optional providers, and low cash expenditure.

Make routine implementation decisions yourself. Record departures from this plan and their reasons. Do not describe a provider as tested unless a real integration test succeeded. Missing credentials must not block development or tests for other providers. Prepare Modal deployment code and instructions; deployment or a paid benchmark requires the user's applicable authorization and credentials. Do not buy credits, add billing, or deploy to an assumed account.

Use the checkboxes in section 13 as the progress record. At each milestone record changed files, checks performed, remaining limitations, and the next task. Do not stop after only scaffolding adapters or displaying nonfunctional controls.

### Non-negotiable user requirements

- Exact avatar appearance count and duration: five appearances of five seconds means five distinct intervals, each five seconds, with 25 seconds total visibility.
- Support genuine video assets, both generic B-roll and clips relevant to a specific person/event.
- Understand uploaded images/videos and choose where they belong in the narration.
- Support a reusable default asset collection, with per-source and per-asset exclusions.
- Keep Groq free transcription available; add fully local transcription after initial model installation.
- Support Qwen image generation on Modal, with a tested compatible acceleration LoRA and optional style LoRAs.
- Never generate portraits of real personalities as a fallback. Do not present generated imagery as authentic event footage.
- Serper is OPTIONAL. The user intends to use only its initial 2,500 free queries and make NO payment.
- When the Serper key is missing, Serper is disabled, its credits are exhausted, or its call fails, automatically use other enabled sources. No job failure merely because Serper is unavailable. If no eligible source can satisfy the scene, follow the explicit missing-asset policy.
- Source toggles apply throughout search, cache retrieval, retries, verification, and rendering fallbacks.

## 2. Existing code and defects relevant to this work

| Area                  | Existing files                                                                                                                                     | Current behavior / change needed                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application shell     | `main.js`, root `package.json`                                                                                                                 | Electron packaging; retain Windows support and writable user-data paths.                                                                                                                 |
| Job creation/settings | `backend/src/routes/api.js`, `jobs/JobManager.js`, `config.js`                                                                               | Upload accepts a single avatar video plus settings. Configuration includes mutable global getters; snapshot job settings and stop cross-job leakage.                                     |
| Pipeline              | `backend/src/pipeline/PipelineOrchestrator.js`                                                                                                   | Audio extraction, transcription, niche classification, scene planning, fetch, verify, captions, composition. Extend this pipeline.                                                       |
| Planning              | `pipeline/ScenePlanner.js`, `presets/nichePresets.js`                                                                                          | Plans roughly 60-second chunks and rescales AI timestamps. Does not enforce global appearance count/duration.                                                                            |
| Rhythm rules          | `utils/rhythmRules.js`                                                                                                                           | Visual-density rules count layouts; long visual-only scenes may become split-screen and reintroduce the avatar. Exact mode must override this.                                           |
| Search/fetch          | `sources/SourceManager.js`, `pipeline/AssetFetcher.js`                                                                                         | Stops at first successful source and chooses first result. Can generate an image after a failed search even if Force AI Images is off.                                                   |
| DuckDuckGo            | `sources/DuckDuckGoSource.js`                                                                                                                    | Existing unofficial image scraper ignores requested video type. Treat as best-effort; do not claim it already discovers/downloads video.                                                 |
| Verification          | `pipeline/AssetVerifier.js`, `services/visionService.js`                                                                                       | Skips some sources, flags failures without replacement, and reports a match when vision is unavailable. Video bytes may be passed as an image. Replace these semantics.                  |
| Segment rendering     | `compositor/SegmentRenderer.js`                                                                                                                  | Supports video assets, but lacks asset in/out ranges and robust short-clip handling. Missing assets reveal avatar; emergency fallback can emit silence.                                  |
| Final assembly        | `compositor/FinalCompositor.js`, `compositor/transitions.js`                                                                                   | Crossfades shorten video and crossfade narration; captions are retimed. Recoveries may add avatar footage or drop segments. Incompatible with exact visibility and narration continuity. |
| Transcription         | `pipeline/Transcriber.js`, `services/groqService.js`                                                                                           | Groq Whisper only. Preserve word timestamps when adding providers.                                                                                                                       |
| Generation            | `services/modalFluxService.js`                                                                                                                   | Existing remote PNG response adapter. Generalize provider selection while preserving configured Flux compatibility.                                                                      |
| UI                    | `frontend/src/App.jsx`, `components/SettingsPanel.jsx`, `SettingsPage.jsx`, `UploadZone.jsx`, `ProgressTracker.jsx`, `VideoResult.jsx` | Add real controls, asset management, progress, warnings, and final compliance information.                                                                                               |

Read these files and relevant source adapters before implementation. Inspect any applicable `AGENTS.md`. The repository had no tracked changes when this plan was prepared; re-check before editing.

## 3. Product behavior and precedence

### 3.1 Avatar modes

- `auto`: retain existing visual-density preferences, with the corrected timeline/audio handling.
- `exact`: user supplies count, seconds per appearance, placement, and layout.
- `off`: zero avatar visibility; narration remains available.

In exact mode all avatar visibility counts: full screen, split screen, and picture-in-picture. A continuous visible interval is one appearance even if its layout changes. Adjacent intervals cannot count as two appearances. Require a configurable minimum invisible gap, default one second.

An intro or outro with the avatar counts toward the requested total; never add either implicitly. Setting count to zero is supported. Validate finite numeric inputs, integer counts, positive duration for nonzero counts, allowed layouts, and feasibility after probing the input duration.

Use integer frame positions. Convert requested seconds to frames using output FPS, display any rounding, and tolerate no more than one frame of unavoidable time quantization. For a video of N frames, count C, appearance length L, and gap G, require `C*L + max(0,C-1)*G <= N` (and validate any placement-specific restrictions).

Placement choices:

1. Even distribution: deterministic slots across the complete video; handle C=0 and C=1 explicitly.
2. Topic-aware: choose suitable sentence/topic starts near distributed targets; length stays fixed. If no suitable boundary fits, use a valid deterministic slot.
3. Manual: exactly C start times, checked for range and minimum gaps. Do not silently move invalid manual times.

Free-text instructions may propose normalized settings, but explicit UI settings win. The LLM cannot overwrite counts, timing, source exclusions, generation restrictions, or budgets.

### 3.2 Missing assets

Default policy: try eligible alternatives, then use a non-avatar neutral title card with the original narration and record a warning. Never add an extra avatar appearance to recover an asset failure.

Offer `missingAssetPolicy: neutral_card | fail`. If the user disables all external/library visuals in exact/off mode, disclose that uncovered intervals will be neutral cards; reject before rendering if their policy is fail. Generated cards use local typography, not an image API, and must not invent factual claims.

If avatar source decoding fails during a mandatory appearance, fail the job with a specific reason rather than claiming timing compliance. Outside avatar intervals, an asset-render failure can recover using another eligible asset or a neutral card without changing duration/audio.

### 3.3 Real-world relevance

Keep separate categories: `generic_broll`, `event_footage`, `person_reference`, `illustration`, `graphic`.

Event/person scenes require identity/event/date/location evidence where applicable. A generic military scene is not evidence of a named battle. Appearance similarity from vision alone is not proof of a person's identity or event. Combine publisher metadata, transcript/OCR, dates, and visible context; retain uncertainty and source links.

If exact footage is unavailable, explicitly mark related authentic footage as illustrative/archive material or use a neutral card. Never silently relabel generic or generated material as verified footage. Generated images must be tracked as generated and visibly identified when used to illustrate real events.

## 4. Canonical settings and data contracts

Create one normalization/validation module, for example `backend/src/config/jobSettings.js`, used by both API handlers and pipeline entry. Share a frontend-safe schema or definitions if helpful. Do not scatter independent defaults across components.

Example normalized job settings (credentials are deliberately omitted):

```json
{
  "schemaVersion": 2,
  "avatar": {
    "mode": "exact",
    "appearanceCount": 5,
    "secondsPerAppearance": 5,
    "placement": "topic_aware",
    "layout": "full_avatar",
    "minimumGapSeconds": 1,
    "manualStartSeconds": []
  },
  "sources": {
    "projectAssets": true,
    "defaultLibrary": true,
    "pexels": true,
    "pixabay": true,
    "wikimedia": true,
    "duckduckgo": true,
    "serper": false,
    "webVideoDownload": true,
    "aiImages": false
  },
  "assetTypes": { "images": true, "videos": true },
  "excludedAssetIds": [],
  "projectAssetIds": [],
  "libraryCollectionIds": [],
  "transcription": { "provider": "auto", "model": "large-v3" },
  "generation": {
    "provider": "modal_qwen",
    "allowRealPersonPortraits": false,
    "maxImagesPerVideo": 12,
    "stylePreset": "neutral"
  },
  "search": {
    "maxQueriesPerTopic": 2,
    "maxSerperQueriesPerJob": 25,
    "maxCandidatesPerScene": 8,
    "maxDownloadsPerScene": 2
  },
  "budget": { "modalTargetUsdPerJob": 2.5 },
  "verification": { "provider": "auto", "enabled": true },
  "missingAssetPolicy": "neutral_card",
  "clipAudio": { "mode": "mute" }
}
```

These numeric search/generation limits are initial configurable engineering defaults, not measured capacity promises. The hard real-person generation prohibition is not exposed as an enable switch in this release. AI generation requires an enabled toggle and configured provider. Do not auto-enable it when stock search fails.

Global provider configuration should separately hold Serper credentials/remaining-credit estimates, Modal image/vision endpoints and auth, local Python/model locations, yt-dlp path, and existing keys. Store secrets on the backend; do not put them in job JSON, Socket.IO events, reports, browser logs, or portable asset manifests. Preserve masked keys when saving settings unless explicitly replaced or cleared.

Take an immutable settings snapshot at job creation: application defaults < saved user defaults < explicit job overrides. Resolve credentials server-side separately. Freeze output FPS, resolution, and styling too; changing global settings during a render must not change that job.

Normalize legacy `useAiImages`, `verifyAssets`, `visualDensity`, `enableAvatarPip`, and GPU fields. Document migration: explicit v2 source disable wins over any legacy Force AI Images setting. Existing projects remain usable in auto mode.

### Asset and candidate records

Use an on-disk catalog with atomic writes and a serialized write queue for this single-user desktop release. SQLite is acceptable if packaged Windows support is tested; a versioned JSON catalog is sufficient initially. Keep binary files separately.

Each record needs:

- Stable ID, content hash, schema/analyzer version, project or library scope, enabled state.
- Original filename, managed relative path, actual media type, duration, dimensions, FPS, audio presence.
- Source/provider, original page URL, download URL when applicable, publisher, attribution, license/permission metadata when available, acquisition time.
- User description/tags, machine description/tags, OCR/transcript references, and analysis state (`pending`, `ready`, `limited`, `failed`).
- Suggested shot ranges with source start/end times, quality measurements, and relevance evidence/confidence.
- Flags for generated content, real-person relevance, event relevance, watermark/quality issues, and usage history.
- User instructions: prefer, require for a specified interval/topic, exclude, permitted trim range, and audio preference.

User corrections override automatic tags. File names are hints, not definitive content descriptions. Reuse hash-based analysis for duplicate uploads. Invalidate analysis when the model/schema changes or the user requests re-analysis. Retain provenance even when downloaded/generated files are promoted into a library: disabling their originating source must not accidentally be bypassed through a cache.

### Timeline records

Every scene stores `startFrame`, `endFrame` (exclusive), narration time range, visual category, query/topic ID, entity/event constraints, layout, and asset selection. Video selections also store `assetId`, `sourceInSeconds`, `sourceOutSeconds`, crop/fit choice, playback speed (default 1), audio mode, verification status, and fallback reason.

Store avatar intervals separately from visual shot cuts. One avatar appearance may span multiple visual shots; derive visibility from the locked interval schedule, not the scene count. The final render manifest records what actually rendered, including all substitutions.

## 5. Pipeline and exact timeline implementation

Target stages:

```text
Validate input/settings and snapshot job
  -> Extract/probe narration and source video
  -> Transcribe (Groq or local)
  -> Analyze selected project/library assets (cached)
  -> Classify topics and plan semantic scenes
  -> Build and lock global avatar intervals
  -> Split/normalize visual scenes against locked intervals
  -> Retrieve, rank, download, and verify eligible assets
  -> Resolve missing visuals without changing visibility
  -> Render visuals on the original narration timeline
  -> Mix audio and burn captions
  -> Validate output + publish compliance/asset/usage report
```

Implement pure scheduling helpers (`planning/avatarSchedule.js`, `planning/timelineValidator.js`) independently of API/model calls. Cover the entire input timeline including leading/trailing silence and gaps between transcript chunks. AI timestamp normalization must not drift narration or affect avatar slots.

Replace rhythm-rule logic in exact/off modes so it may change visual cuts but cannot introduce visibility. In auto mode retain user preferences without overriding explicit source toggles.

### Audio and transitions

Keep one continuous original narration track as the time reference. Assemble visual tracks at the same total duration, then mix narration, optional clip audio, and music. Do not acrossfade successive speech chunks or shorten the spoken timeline. Keep captions on original word times.

First deliver frame-accurate hard cuts in exact mode. Show an honest UI note if the transition preference is temporarily unavailable in that mode. Then implement duration-preserving transitions using handles/overlap inside allocated visual slots. Hard-cut avatar visibility boundaries: a fade must not leak the avatar outside its reserved frames or reduce full visibility inside them. Do not claim transition support until tested.

Ensure each rendered visual segment has the intended frame count. Normalize FPS, timestamps, dimensions, codecs, and audio sample rates. Check final duration with ffprobe; do not accept truncated assets, skipped scenes, or an audio/video length mismatch as success.

## 6. Asset libraries, import, and analysis

### Import and storage

- Add a separate multi-file asset import endpoint; keep the avatar upload endpoint backward compatible.
- Manage project assets and reusable collections separately. A draft project/import session can group assets before the render job exists.
- Allow images, videos, and user-provided source links. Validate actual media with ffprobe/decoding, not only extensions. Apply file-size/count/duration limits and return useful errors.
- Import copies into a writable managed directory under APP_ROOT, preserving originals. Bundle only a manifest and genuinely supplied default assets; do not invent a default collection or download a huge pack.
- Let users select collections, toggle individual assets, edit descriptions, choose trim ranges, and mark preferred/required usage.
- Never delete user originals. Any later cleanup only targets resolved app-managed temporary files, never a user-selected source folder.

### Understanding assets economically

Use FFmpeg shot-change detection and bounded representative-frame sampling. Start with a few frames per shot, a per-file cap, and denser inspection only around a shortlisted excerpt. Extract audio/transcript only when useful; do not transcribe every long candidate video.

Implement an analyzer interface with Modal vision and metadata-only fallback. A small Qwen-VL model is a candidate for the Modal worker; select and pin a suitable checkpoint after measuring accuracy, memory, licensing, and latency. Image generation and vision understanding are separate workers/models.

Return structured descriptions, visible text, actions, settings, suggested ranges, and uncertainty. Metadata-only fallback must report `limited`; it must not pretend to understand unseen visuals. Allow user-written descriptions to make assets usable without AI.

Use descriptive text/tag retrieval first, with a replaceable embedding-based scorer if benchmarks show better matching. No paid vector database is required. Cache expensive analysis once per content hash/model version.

## 7. Retrieval, Serper, downloads, and verification

### 7.1 Provider interface

Adapt source classes to return consistent candidate records and structured status:

```text
search(querySpec, mediaType, limits, signal)
  -> { status: ok|empty|disabled|unconfigured|rate_limited|exhausted|error,
       candidates: [...], retryAfterSeconds?, warnings: [...] }
```

Distinguish search/discovery providers from downloaders. A video webpage URL is not a playable MP4 URL. Do not save HTML as `.mp4` or report an image as a video. Skip unavailable providers before calling them. Use bounded timeouts, cancellation, and concurrency.

Filter by user permissions and source/type toggles first, then rank by relevance, event evidence, source quality, resolution, crop suitability, usable length, and repetition. Avoid rigid first-result selection. A required user-pinned asset takes precedence after validating it against hard constraints; preferred assets gain priority but should not override an incompatible event requirement.

For generic B-roll: project/library -> Pexels/Pixabay -> suitable Wikimedia/web results -> optional AI illustration -> configured missing-asset policy.

For specific events/people: matching project/library material -> targeted Wikimedia/Serper/DDG discovery and optional yt-dlp search -> excerpt verification -> related authentic illustration or missing-asset policy. Do not waste a stock request on every highly specific event query. Search per topic/entity/event and share candidates across scenes.

### 7.2 Serper: free-credit-only policy

Add `SerperSource.js` and a server-side key field. Serper defaults off until explicitly enabled and configured. The following behavior is mandatory:

1. Missing/blank key or disabled toggle: make zero Serper requests and continue other providers.
2. Use standard low-cost result requests; cap per-job calls, pagination, and retries. Verify actual endpoint credit charging during integration rather than assuming every possible request costs one credit.
3. Offer a user-set remaining free-credit allowance, at most 2,500 initially. Do not assume an existing key still has all 2,500 credits. Track local reservations/usage atomically across jobs and restarts; a masked key change must not reset allowance accidentally.
4. No assumed monthly refill. No payment flow, top-up, auto-upgrade, subscription, or automatic switch to paid search.
5. A local counter is an estimate because the key may be used elsewhere. Where a documented provider balance is available, reconcile it; otherwise expose uncertainty and let the user correct the allowance.
6. Reserve allowance before requests. Account conservatively for requests whose outcome is unknown after a timeout; do not blindly retry and consume extra queries.
7. Authentication failure: mark unavailable and continue. Credit exhaustion: open a persistent circuit breaker and continue. Rate limiting: honor Retry-After within a bounded wait or move on. Map documented error responses; do not assume every 403 or 429 means exhausted credits.
8. Show one non-blocking message such as "Serper unavailable; using other enabled sources." Do not spam warnings for every scene.
9. Cache normalized query/type/language/date/page results with suitable expiry, especially short expiry for current events. Cached results still obey exclusions and provenance rules.
10. Missing Serper must never disable DuckDuckGo, Wikimedia, stock sources, local libraries, direct links, or enabled AI illustration.

The application cannot guarantee a key has no externally purchased credits. Its guarantee is no purchases and no requests beyond the configured free-use allowance; explain this accurately in settings.

### 7.3 DuckDuckGo and other non-Serper paths

Repair or replace the existing DDG image adapter with a maintained best-effort adapter. Verify current extraction behavior before promising video discovery. Add provider capability declarations so unsupported media types are skipped. Do not create unbounded token-page scraping loops. On CAPTCHA/blocking/format change, stop that provider for the job and continue.

Support Wikimedia media metadata and direct user links independently of search keys. For supported video discovery, optionally use yt-dlp search with restrictive result limits. This path is also best-effort and may fail independently of Serper; do not require it to succeed for every site.

### 7.4 Video downloading and excerpt selection

Introduce `services/videoDownloadService.js` around a pinned/tested yt-dlp executable and the existing FFmpeg utilities. Use argument arrays with shell disabled, validate HTTP(S) URLs, prevent URLs from becoming command options, and avoid exposing arbitrary filesystem/network access through imports. Use bounded redirects, download size/time limits, and validated app-managed destinations. Do not bypass access controls.

Retrieve metadata first. Inspect available captions/transcripts and thumbnails to shortlist a range; then inspect frames from that range. Download only needed sections where supported; trim locally to exact bounds. Re-encode boundaries where keyframe seeking is insufficient. Probe the final file before accepting it. Retain source/publisher/attribution and permission metadata; search results alone do not establish permission to reuse.

Set a maximum download count per scene/topic, de-duplicate URLs/content, and avoid repeating the same excerpt across a video. If yt-dlp is missing, surface setup instructions and continue with direct stock downloads and local files.

### 7.5 Verification and rejection

Verification returns `verified`, `rejected`, or `unverified`, with evidence and reasons. Unavailable vision is unverified, never a fabricated positive match. Inspect extracted frames for videos; never pass MP4 bytes as JPEG.

Do not exempt stock assets from semantic matching merely because their provider is reputable. A rejected asset must be removed from consideration and replaced through a bounded retry path. Strict event matching may require a higher evidence threshold than generic illustrative B-roll. A numeric model confidence alone is insufficient proof.

## 8. Renderer changes for real video assets

- Honor source in/out offsets; validate ranges against probed duration.
- Preserve playback speed by default. Do not stretch event footage to fill space. Choose another excerpt/asset/card if too short. Optional looping is limited to suitable generic B-roll and must be explicit.
- Fit/crop for landscape, portrait, and square outputs without cutting essential subjects or source text when avoidable.
- Default clip audio to muted under uninterrupted narration. Add optional original audio with ducking/mixing, not automatic timeline extension. A later mode that pauses narration would require a separate timeline design and is out of scope here.
- Clamp visual output to allocated frame counts, regardless of asset duration. Preserve source narration through all visual fallback paths.
- Keep picture-in-picture/split layouts available only inside scheduled avatar intervals in exact mode.
- Write actual rendering outcomes to a manifest. Validate this manifest and the encoded video; do not count only the original AI plan and call that final compliance.

## 9. Transcription providers

Create a common interface returning the existing transcript text, word timestamps, and segments.

- `groq`: preserve the current large-v3 quality option; allow turbo. Handle free-tier file-size limits through compression or chunking with correct timestamp offsets. Bound retries and honor rate-limit headers.
- `local`: faster-whisper worker using a configured Python environment and pre-downloaded model. CPU INT8 fallback and NVIDIA acceleration when available. Preserve word timestamps, language, and source time offsets. Benchmark representative English/Urdu/mixed audio if those languages are in the user's material.
- `auto`: configured Groq first, then local on unavailable key/quota/connectivity failure. If local runtime/model is missing, provide a clear setup action; do not silently start a multi-GB download during rendering.

Provide a separate model/runtime setup script and Windows instructions. Once installed, local transcription must work with networking disabled. Do not describe the entire pipeline as offline: external search and Modal still need connectivity.

Scene planning currently uses the DeepSeek-configured text service, independently of Groq transcription. Keep this working, add usage accounting, and make its provider boundary replaceable. Do not claim all AI is free because Whisper is free. A Modal-hosted small text model is optional after quality/cost tests, not an obligatory rewrite.

## 10. Modal services and AI fallback policy

Add a `modal/` directory with pinned Python dependencies, image-generation and vision workers, request/response schemas, and deployment/setup instructions. Keep endpoints/configuration separate and authentication server-side. Use documented Modal endpoint authentication; do not assume account management tokens are interchangeable with endpoint credentials.

Generation interface: prompt, negative prompt if supported, size, seed, named style preset, model/adapter revision, and bounded steps. Response: image bytes or a controlled download reference plus metadata/request ID/usage measurements. Preserve the existing Flux adapter as an optional compatibility provider; new Qwen configuration does not need a mandatory Flux credential.

Start with a matching Qwen-Image + Lightning model/LoRA pair. Pin revisions and matching scheduler/step settings from the official model instructions. Benchmark speed, memory, and prompt adherence before choosing quantization/GPU. Style LoRAs are curated named presets with recorded licenses and compatibility checks, not arbitrary model URLs supplied to the server. Do not assume an acceleration LoRA improves visual style or that different Qwen generations share adapters.

Before generation, route the scene through a policy check. Prohibit requests intended to depict an identifiable real personality, including disguised attempts produced by prompt rewriting. For such scenes use authentic references or a neutral card. For historical/news scenes, generate only eligible illustrative context and label it appropriately.

Cache by prompt, seed, dimensions, model/LoRA revisions, and generation settings. Batch queued requests to amortize startup without leaving GPUs continuously allocated. Cancel queued work promptly. Bound concurrency, attempts, generated-image count, and time spent per job. GPU workers should not sit allocated during web searches, downloads, or local FFmpeg rendering.

Target ten videos/month within $30 of Modal credits, initially targeting about $2.50/video and reserving the remainder for setup/retries. This is a target, not a guarantee. Track GPU duration, CPU/RAM assumptions, startup/loading, retries, and persistent storage. Estimates are not the provider invoice. Never automatically buy credits or increase paid limits. If estimated allowance is exhausted, stop scheduling new cloud work and use eligible cached/local alternatives.

## 11. UI and API deliverables

### UI

- Avatar mode, count, duration, placement, layout, manual starts, and computed total visible time.
- Show exact mode's priority over visual-density presets and any transition restrictions.
- Draft project assets and reusable library tabs; multi-file import, thumbnails, analysis state, descriptions, exclusions, collection selection, and trim preview.
- Independent source toggles plus image/video switches. Missing credentials disable only the relevant provider. AI fallback is an explicit switch.
- Serper optional key, free-credit allowance/estimate, per-job cap, and unavailable/exhausted state. No payment prompt.
- Groq/Local/Auto transcription and local setup status; separate Modal image and vision configuration.
- A lightweight pre-render summary of settings, eligible sources, avatar intervals, and obvious conflicts. Do not require approval for every scene by default.
- Progress states for analysis, discovery, downloading, verification, generation, rendering, and validation.
- Final result: requested vs rendered avatar count/time, assets used with provenance, substitutions/uncertain matches, and usage estimates.

### Suggested API additions

These names are proposals; keep existing `/api/upload` and `/api/jobs/:jobId` compatible.

- `POST /api/assets/import`: multi-file import into a draft project or library collection.
- `GET /api/assets`: list by scope/collection/project.
- `PATCH /api/assets/:id`: enable/exclude, description, instructions, and permitted ranges.
- `POST /api/assets/:id/analyze`: request bounded re-analysis.
- `POST /api/assets/import-url`: metadata/download workflow for supported user URLs.
- `GET /api/providers/status`: configured/available/limited states, never raw secrets.
- `POST /api/plans/validate`: validate proposed settings and timing against a probed source.
- `GET /api/jobs/:jobId/report`: sanitized compliance/asset/usage report.

Use ID-based references and validate ownership/scope in the backend. Do not accept arbitrary absolute paths from browser requests. Persist library/catalog/settings/usage across restarts; full crash-resumable render jobs are optional for this release. Cancellation should stop queued requests and terminate child processes for that job.

## 12. Verification strategy and acceptance cases

Use Node's built-in test runner for pure scheduling, source routing, settings, and budget tests unless the repository gains a justified test framework. Mock external APIs and use tiny deterministic media fixtures for routine tests; avoid spending credits in automated tests.

Required checks:

1. **Exact count:** synthetic 120-second and 1,200-second timelines, five 5-second appearances at 24/30/60 FPS. Exactly five connected visibility intervals and expected frames per interval.
2. **Edge cases:** zero/one appearances, invalid count/duration, impossible fit, adjacent/overlapping manual slots, sentence boundaries near the end, leading/trailing silence, and fractional duration rounding.
3. **Visibility recovery:** missing/rejected/truncated assets outside locked intervals never reveal the avatar. Avatar decoding failure in a mandatory slot is not reported as success.
4. **Audio continuity:** continuous test narration/tone survives cuts and visual fallback; no shortening, duplicated/dropped speech, or caption timestamp drift. Duration within one video frame, with appropriate audio sample tolerance.
5. **Transitions:** exact mode hard cuts preserve boundaries; later visual transitions preserve full duration and do not leak avatar visibility.
6. **Serper missing:** no key, all other relevant providers mocked available; zero Serper HTTP calls and a successful job.
7. **Serper exhausted/failing:** exhaustion/auth/429/timeouts stop or bound requests correctly and choose other enabled sources. Restart retains exhausted state; two concurrent jobs cannot overspend the local allowance.
8. **Source toggles:** disabled providers and excluded assets are never selected, including from cache/library provenance or AI fallback. Disabled videos/images are respected.
9. **Uploaded assets:** renamed files still use probed content; duplicate content reuses analysis; user tag correction affects matching; individual/collection toggles persist.
10. **Event relevance:** candidates of the same person at the wrong event are rejected or explicitly downgraded; missing evidence remains unverified. Test with curated metadata/frame fixtures and an optional real-provider evaluation.
11. **Verification failure:** rejected candidates are actually replaced; unavailable vision does not fabricate a match; bounded retries end with the chosen fallback policy.
12. **Video excerpts:** correct source offset, frame count, crop, short-clip policy, mute default, and optional original-audio mix. HTML/error downloads fail preflight.
13. **Local transcription:** installed local mode runs without internet and returns usable word timestamps; missing local setup produces an actionable message. Groq 429 can route to local.
14. **Generation policy:** real-person requests never reach the image endpoint; eligible illustrations can; disabled AI never gets called; cached generated images obey policy/toggles.
15. **Budget/cancellation:** image/query caps hold under concurrent tasks and retries; cancellation prevents new downloads/generation and stops job-owned processes.
16. **Packaging:** frontend production build, backend start, existing upload flow, and Windows Electron paths work. Missing Python/yt-dlp/Modal credentials do not prevent app startup or unrelated workflows.

Use synthetic render fixtures that make the avatar visually unmistakable, such as a bright labeled rectangle, and decode frames around every boundary. Check encoded frame count/timestamps with ffprobe. Validate narration separately. A passing manifest alone cannot establish correct rendered visibility.

Use a short end-to-end fixture first, then one representative 20-minute run when credentials/assets are available. Report any provider tests not performed. Record actual search/generation counts and elapsed/billed estimates; never extrapolate a measured monthly guarantee from mocked tests.

## 13. Ordered milestones and completion gates

- [x] **M1 - Settings and provider boundaries.** Canonical job schema, validation, immutable snapshots, legacy migration, masked secrets, provider status, and job isolation are implemented. Tests cover precedence/isolation; the frontend build passes.
- [x] **M2 - Exact avatar schedule and continuous timeline.** Frame scheduler, exact/off UI, locked visibility, neutral recovery, continuous original narration in finalization, hard boundaries, and render reports are implemented. Encoded FFmpeg fixtures verify visible/non-visible frames and total duration.
- [x] **M3 - Asset libraries.** Multi-file import, managed hash catalog, project/default collections, previews, persistent toggles/descriptions, local metadata analysis, and optional bounded Modal analysis are implemented. Catalog tests cover deduplication, retrieval, and exclusion.
- [x] **M4 - Retrieval and optional Serper.** Capability-aware sources, cache, ranking, optional Serper allowance/circuit breaker, and automatic fallthrough are implemented. Mocked tests verify exhaustion, disablement, concurrency, and fallback. No purchase path exists; a live free-key call was not made.
- [x] **M5 - Event clips and video rendering.** Event/person plan fields, multi-source discovery, yt-dlp metadata/section adapter, URL safeguards, source offsets, muted clip audio, video-frame verification, rejection fallback, and provenance are implemented. Encoded fixtures verify source offsets and narration audio; live third-party download/site compatibility was not tested.
- [ ] **M6 - Offline transcription.** Provider abstraction, worker, setup documentation, Groq-to-local fallback, CPU/GPU selection, and word timestamp contract are implemented. Python syntax passes and missing-runtime behavior is actionable. `faster-whisper` and a model are not installed in this environment, so the required offline runtime test remains pending.
- [ ] **M7 - Modal asset understanding and Qwen generation.** Deployable Qwen-Image/Lightning and Qwen2.5-VL worker source, pinned dependencies, separate endpoints, analysis cache path, real-person generation block, and usage counts are implemented. Python syntax and local policy tests pass. No worker was deployed and no real Modal cost/quality benchmark was performed, so this milestone is intentionally not marked fully validated.
- [x] **M8 - UI completion and regression pass.** Project controls, assets, provider configuration, progress/result reporting, docs, backend smoke start, frontend production build, and Windows NSIS packaging pass. Exact/off modes deliberately use hard boundaries; duration-preserving cosmetic crossfades remain available only in automatic mode.

### Implementation record (2026-09-27)

- Bundled asset pass: selected 15 immediately usable SFX (10.55 MiB) from the user-supplied 29.5 GB shared library. `assets/defaults/manifest.json` records stable IDs, semantic tags, provenance, gain, duration, and exact source trim ranges. Large overlays/installers/previews were deliberately not copied because the current compositor cannot consume them safely.
- SFX pipeline: deterministic scene cue planning, user toggle/volume/rate cap, a frame-timeline-aligned FFmpeg mix, and per-cue timeline/source ranges in the final report are implemented. Automatic cosmetic crossfades are skipped when an SFX timeline is active so cue times remain exact.
- Modal endpoint pass: Qwen image generation now works with an endpoint URL alone, supports optional protected-proxy headers, and handles the existing endpoint's HTTP 202 polling contract. A deployable Qwen2.5-VL asset-analysis endpoint and setup guide were prepared locally and copied to `public doms tools`; no deployment or cloud validation is claimed.

- Backend: 21 tests pass, including real FFmpeg rendering at exact boundaries, neutral fallback duration, continuous narration/SFX mapping, exact-duration SFX timeline rendering, video excerpt offsets, catalog persistence, settings isolation, source disablement/fallback, Serper reservation concurrency, and real-person generation policy.
- Frontend: Vite production build passes.
- Packaging: Electron Builder produced `dist/Avatar Editor Setup 1.0.0.exe` successfully and the unpacked application contains all 15 indexed SFX files. The packager warned that ASAR is disabled and the default Electron icon is used; these were pre-existing packaging choices rather than functional failures.
- Runtime: backend starts on port 3001. `yt-dlp` 2026.08.19 and Modal CLI 1.5.5 are present. `faster-whisper` is absent, so M6 runtime validation is pending setup.
- External validation not claimed: Serper, Pexels/Pixabay live calls, real event downloads, DeepSeek verification, Groq fallback limits, and Modal workers were not exercised with live credentials in this implementation run.

Do not postpone exact-timing correctness until the AI integration phases. Do not call M7 fully validated if only mock responses were used: mark deployment/real-provider validation pending and state the missing input.

### Expected implementation artifacts

- Working changes to the existing application, plus focused new planning/asset/provider/usage modules.
- Small backend test suite and deterministic render fixtures or fixture-generation scripts.
- Local inference worker/setup instructions and Modal service source/deployment instructions.
- Updated `.env.example` with placeholders only; never commit keys or personal endpoints as universal defaults.
- User-facing instructions for optional providers, offline setup, asset imports, and source toggles.
- Machine-readable render report with visibility intervals, actual asset selections, warnings, and usage estimates.
- A concise implementation handoff stating what works, what was tested, and what requires real credentials or benchmarking.

## 14. Research snapshot and references

Facts below were checked against public provider documentation during planning on 2026-09-27. Re-check before integration; account-specific limits can differ. Do not assume a free tier is unlimited or guaranteed permanently.

- [Modal pricing](https://modal.com/pricing): Starter advertises $30 monthly compute credits. CPU, RAM, GPU, and storage are separate cost components. Ten videos/month gives an average $3 compute-credit allocation per video, not a measured workload guarantee.
- [Groq limits](https://console.groq.com/docs/rate-limits): public free Whisper limits list 20 requests/minute, 2,000/day, 7,200 audio seconds/hour, and 28,800/day. Ten 20-minute source videos are 12,000 seconds/month; downloaded-clip transcription and retries add usage.
- [Groq speech documentation](https://console.groq.com/docs/speech-to-text): word timestamps are supported; the free-tier upload limit is documented as 25 MB. Paid pricing must not be confused with actual free-tier cash expenditure.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper): CPU/GPU execution and word timestamps; local mode requires model/runtime installation first.
- [Serper](https://serper.dev/): advertises 2,500 free queries without a card and web/image/news/video search. The public page does not promise a monthly free refill or explicitly establish every endpoint's free-account availability; test with a free key. Paid Starter is $50/50,000 credits; paid packs expire after six months. This project must not implement purchases or rely on paid Serper.
- [Pexels limits](https://help.pexels.com/hc/en-us/articles/47677890260761-Is-the-Pexels-API-free-to-use): default 200 requests/hour and 20,000/month.
- [Pixabay documentation](https://pixabay.com/api/docs/): default 100 requests/60 seconds; cache requests for 24 hours and follow attribution/display requirements.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp): supports metadata extraction and section downloading for supported sources; availability and exact-range download behavior vary by site.
- [Qwen-Image](https://huggingface.co/Qwen/Qwen-Image): a 20B image model; hardware/memory requirements must be measured for the chosen precision/runtime.
- [Qwen-Image-Lightning](https://huggingface.co/lightx2v/Qwen-Image-Lightning): acceleration LoRA with published inference settings; pin compatible revisions rather than mixing arbitrary Qwen versions.
- [Qwen2.5-VL example](https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct): demonstrates image/video analysis; a candidate to evaluate, not a requirement to deploy this exact checkpoint.
