import io, os, time
import modal

app = modal.App('avatar-editor-media')
volume = modal.Volume.from_name('avatar-editor-models', create_if_missing=True)
image = modal.Image.debian_slim(python_version='3.11').pip_install_from_requirements('requirements.txt')

@app.cls(image=image, gpu='L40S', volumes={'/models': volume}, scaledown_window=60, timeout=600)
class QwenImageWorker:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import DiffusionPipeline
        self.torch = torch
        self.pipe = DiffusionPipeline.from_pretrained('Qwen/Qwen-Image', torch_dtype=torch.bfloat16, cache_dir='/models').to('cuda')
        self.pipe.load_lora_weights('lightx2v/Qwen-Image-Lightning', weight_name='Qwen-Image-Lightning-8steps-V1.0.safetensors', cache_dir='/models')

    @modal.fastapi_endpoint(method='POST', requires_proxy_auth=True)
    def generate(self, request: dict):
        from fastapi.responses import Response
        prompt = str(request.get('prompt', '')).strip()
        if not prompt: return Response(status_code=400, content=b'Missing prompt')
        width = max(512, min(1536, int(request.get('width', 1280)) // 8 * 8)); height = max(512, min(1536, int(request.get('height', 720)) // 8 * 8))
        seed = int(request.get('seed') or 0); started = time.time()
        result = self.pipe(prompt=prompt, negative_prompt=str(request.get('negative_prompt','')), width=width, height=height, num_inference_steps=8, true_cfg_scale=1.0, generator=self.torch.manual_seed(seed)).images[0]
        buf=io.BytesIO(); result.save(buf, format='PNG')
        return Response(content=buf.getvalue(), media_type='image/png', headers={'X-Model':'Qwen/Qwen-Image','X-Adapter':'Qwen-Image-Lightning-8steps-V1.0','X-Inference-Seconds':f'{time.time()-started:.3f}'})

@app.cls(image=image, gpu='L4', volumes={'/models': volume}, scaledown_window=60, timeout=600)
class QwenVisionWorker:
    @modal.enter()
    def load(self):
        import torch
        from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
        self.torch=torch; self.model_id='Qwen/Qwen2.5-VL-3B-Instruct'
        self.model=Qwen2_5_VLForConditionalGeneration.from_pretrained(self.model_id, torch_dtype=torch.bfloat16, device_map='auto', cache_dir='/models')
        self.processor=AutoProcessor.from_pretrained(self.model_id, cache_dir='/models')

    @modal.fastapi_endpoint(method='POST', requires_proxy_auth=True)
    def analyze(self, request: dict):
        # The Node backend sends bounded JPEG frames as data URLs. Full video ingestion is intentionally avoided.
        from PIL import Image
        import base64, json
        frames=[]
        for item in request.get('frames', [])[:12]:
            payload=item.split(',',1)[-1]; frames.append(Image.open(io.BytesIO(base64.b64decode(payload))).convert('RGB'))
        if not frames: return {'status':'unverified','reason':'No frames supplied'}
        prompt=str(request.get('prompt','Describe the visual content, visible text, actions and setting. Return concise JSON.'))
        content=[{'type':'image','image':im} for im in frames]+[{'type':'text','text':prompt}]
        messages=[{'role':'user','content':content}]; text=self.processor.apply_chat_template(messages,tokenize=False,add_generation_prompt=True)
        inputs=self.processor(text=[text],images=frames,padding=True,return_tensors='pt').to('cuda'); ids=self.model.generate(**inputs,max_new_tokens=256); trimmed=[o[len(i):] for i,o in zip(inputs.input_ids,ids)]
        return {'status':'ok','model':self.model_id,'description':self.processor.batch_decode(trimmed,skip_special_tokens=True)[0]}

