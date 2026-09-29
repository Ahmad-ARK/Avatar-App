# Modal endpoint setup

Avatar Editor accepts ordinary HTTPS endpoint URLs. Public endpoints do not require `Modal-Key` or `Modal-Secret`; those settings are optional and only apply if you deliberately protect an endpoint with a proxy.

## Existing Qwen image endpoint

Deploy the existing `qwen_image_api.py` from the shared `public doms tools` directory:

```powershell
modal deploy qwen_image_api.py
```

Put the printed root URL in `Modal image endpoint`. The app handles both a direct image response and the endpoint's HTTP 202 `poll_url` cold-start contract.

## Uploaded-asset vision index

From this directory, or from the copied file in `public doms tools`:

```powershell
modal deploy qwen_vision_api.py
```

Put the printed root URL in `Modal vision endpoint`. This runs Qwen2.5-VL-3B-Instruct on an A10G and samples at most three frames. It deliberately asks for description rather than identifying a real person from appearance.

These files prepare deployment only. No Modal account was accessed and neither endpoint was deployed or cloud-tested by this implementation.
