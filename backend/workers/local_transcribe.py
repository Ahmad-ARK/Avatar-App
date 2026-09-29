import argparse, json, sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--model', default='large-v3')
    parser.add_argument('--device', default='auto')
    args = parser.parse_args()
    try:
        from faster_whisper import WhisperModel
        device = args.device
        if device == 'auto':
            try:
                import ctranslate2
                device = 'cuda' if ctranslate2.get_cuda_device_count() > 0 else 'cpu'
            except Exception:
                device = 'cpu'
        compute = 'float16' if device == 'cuda' else 'int8'
        model = WhisperModel(args.model, device=device, compute_type=compute)
        segments_iter, info = model.transcribe(args.input, word_timestamps=True, vad_filter=True)
        segments, words = [], []
        for i, seg in enumerate(segments_iter):
            item_words = []
            for w in seg.words or []:
                item = {'word': w.word.strip(), 'start': float(w.start), 'end': float(w.end)}
                words.append(item); item_words.append(item)
            segments.append({'id': i, 'start': float(seg.start), 'end': float(seg.end), 'text': seg.text.strip(), 'words': item_words})
        print(json.dumps({'text': ' '.join(s['text'] for s in segments), 'words': words, 'segments': segments, 'language': info.language, 'provider': 'local'}))
    except Exception as exc:
        print(json.dumps({'error': str(exc)}), file=sys.stderr)
        raise

if __name__ == '__main__': main()

