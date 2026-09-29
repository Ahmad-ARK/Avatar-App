"""Open, endpoint-only Qwen vision service for Avatar Editor asset indexing.

Deploy manually with:  modal deploy qwen_vision_api.py
Then copy the printed URL into Avatar Editor's Modal vision endpoint setting.
No caller token is required. Do not expose this publicly without adding your own auth/rate limit.
"""
import base64
import io

import modal

app = modal.App("avatar-qwen-vision-api")
MODEL_ID = "Qwen/Qwen2.5-VL-3B-Instruct"
CACHE_DIR = "/cache"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1",
        "transformers>=4.49.0",
        "accelerate>=1.2.0",
        "qwen-vl-utils>=0.0.10",
        "fastapi[standard]",
        "pillow",
    )
    .env({"HF_HOME": CACHE_DIR})
)
cache = modal.Volume.from_name("avatar-qwen-vision-cache", create_if_missing=True)


def decode_data_url(value):
    from PIL import Image
    encoded = value.split(",", 1)[1] if "," in value else value
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")


@app.cls(image=image, gpu="A10G", volumes={CACHE_DIR: cache}, scaledown_window=120, timeout=300)
class VisionModel:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
        self.processor = AutoProcessor.from_pretrained(MODEL_ID)
        self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            MODEL_ID, torch_dtype=torch.float16, device_map="auto"
        ).eval()

    @modal.method()
    def describe(self, frames, prompt):
        import torch
        images = [decode_data_url(frame) for frame in frames[:3]]
        content = [{"type": "image", "image": image} for image in images]
        content.append({"type": "text", "text": prompt})
        messages = [{"role": "user", "content": content}]
        text = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = self.processor(text=[text], images=images, padding=True, return_tensors="pt").to(self.model.device)
        with torch.inference_mode():
            generated = self.model.generate(**inputs, max_new_tokens=220, do_sample=False)
        trimmed = [out[len(inp):] for inp, out in zip(inputs.input_ids, generated)]
        return self.processor.batch_decode(trimmed, skip_special_tokens=True)[0].strip()


@app.function(image=image, timeout=300)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel, Field

    api = FastAPI(title="Avatar Qwen Vision API")

    class Request(BaseModel):
        frames: list[str] = Field(min_length=1, max_length=3)
        prompt: str = Field(default="Describe this media for video editing.", max_length=1000)

    @api.get("/health")
    def health():
        return {"status": "ok", "model": MODEL_ID}

    @api.post("/")
    def analyze(request: Request):
        try:
            description = VisionModel().describe.remote(request.frames, request.prompt)
            tags = sorted({word.lower().strip(".,:;!?()[]") for word in description.split() if len(word) > 3})[:50]
            return {"description": description, "tags": tags, "model": MODEL_ID}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    return api
