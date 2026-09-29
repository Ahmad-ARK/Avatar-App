# Local transcription setup

Local transcription uses `faster-whisper` and works without networking after Python packages and the selected model are downloaded.

1. Install Python 3.9 or newer.
2. Create a dedicated virtual environment and run `pip install -r backend/workers/requirements-local.txt`.
3. Set `PYTHON_PATH` to that environment's Python executable.
4. Set `LOCAL_WHISPER_MODEL` to `large-v3` or a local CTranslate2 model directory.
5. Run a short transcription while online once to download a named model, or point `LOCAL_WHISPER_MODEL` to a pre-downloaded model directory. Then choose **Local** in the app.

CPU uses INT8. CUDA is selected when CTranslate2 reports a CUDA device; its matching CUDA/cuDNN runtime is still required. A named faster-whisper model can trigger its normal first-use download, so production/offline installations should point to a pre-downloaded model directory.

