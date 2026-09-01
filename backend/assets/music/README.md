# Background music

Drop royalty-free music files here (`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`) and the
pipeline will automatically use one as a background bed, ducked under the narrator's voice.

- If this folder is empty, videos are rendered with the voice only — no error.
- A random track is chosen per video, so a small library gives variety.
- Level and on/off are configurable: `MUSIC_VOLUME` (0–1, default 0.18) and
  `ENABLE_MUSIC` (default true), settable in `.env` or the app Settings.

Recipients of the packaged app can add their own tracks to the writable music folder in the
app's user-data directory (`<userData>/music/`).

**Licensing:** only add music you have the right to use. Good sources for royalty-free
tracks include the YouTube Audio Library, Pixabay Music, and Incompetech (with attribution).
No tracks are bundled by default.
