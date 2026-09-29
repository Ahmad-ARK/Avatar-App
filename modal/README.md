# Modal workers

These workers are prepared for Qwen-Image + the compatible eight-step Qwen-Image-Lightning LoRA and Qwen2.5-VL-3B frame analysis. They have not been deployed or benchmarked from this repository.

1. Install the Modal CLI and authenticate to your own workspace.
2. Review and update the pinned versions and model licenses.
3. From this directory run `modal deploy app.py`.
4. Put each generated endpoint URL into `MODAL_IMAGE_ENDPOINT` and `MODAL_VISION_ENDPOINT`.
5. Configure endpoint proxy-auth credentials in `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`.

Start with short requests and inspect the Modal dashboard for actual GPU, CPU, memory and startup charges. The application tracks request counts and estimates only; Modal's invoice is authoritative. It never purchases credits or changes a billing plan.

The 20B Qwen image model is assigned an L40S as a starting configuration, not a benchmark-backed optimum. Test memory, cold-start time, prompt adherence and cost before routine use. Curate additional style LoRAs by fixed server-side name and compatible model revision; do not accept arbitrary remote model URLs from clients.

