#!/usr/bin/env python3
"""Record a Danish device-voice fallback when DDO has no exact MP3.

Requires macOS voices and `python3 -m pip install lameenc`. Output is deliberately kept
separate from downloaded DDO files so provenance is never confused.
"""
import argparse
import subprocess
import tempfile
import wave
from pathlib import Path

import lameenc

parser = argparse.ArgumentParser()
parser.add_argument('words_file', type=Path, help='One Danish word per line')
parser.add_argument('--output-dir', type=Path, default=Path('catalog/audio/device-voice'))
args = parser.parse_args()
args.output_dir.mkdir(parents=True, exist_ok=True)

for word in args.words_file.read_text().splitlines():
    word = word.strip()
    if not word or word.startswith('#'):
        continue
    with tempfile.TemporaryDirectory() as temp:
        aiff = Path(temp) / 'speech.aiff'
        wav = Path(temp) / 'speech.wav'
        subprocess.run(['say', '-v', 'Sara (Danish (Denmark))', '-o', str(aiff), word], check=True)
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16', str(aiff), str(wav)], check=True)
        with wave.open(str(wav), 'rb') as audio:
            encoder = lameenc.Encoder()
            encoder.set_bit_rate(128)
            encoder.set_in_sample_rate(audio.getframerate())
            encoder.set_channels(audio.getnchannels())
            encoder.set_quality(2)
            data = encoder.encode(audio.readframes(audio.getnframes())) + encoder.flush()
        output = args.output_dir / f'{word}.mp3'
        output.write_bytes(data)
        print(f'{word}: {output}')
