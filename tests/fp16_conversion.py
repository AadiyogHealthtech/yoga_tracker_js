import json
import numpy as np

def to_fp16_str(x: float) -> str:
    """
    Quantize a Python float to IEEE-754 half precision (float16),
    then format it with exactly eight digits after the decimal point.
    """
    # Convert to float16 and back to Python float
    v16 = float(np.float16(x).item())
    # Format with eight decimal places
    return f"{v16:.8f}"

def convert_segments(segments):
    """
    Convert the thresholds in each segment to FP16‐quantized strings
    with exactly eight decimal places.
    """
    new_segments = []
    for seg in segments:
        start, end, phase, thresholds, facing = seg
        thr_fp16 = [to_fp16_str(float(t)) for t in thresholds]
        new_segments.append([start, end, phase, thr_fp16, facing])
    return new_segments

def convert_frames(frames):
    """
    Convert each landmark string "x,y,z,visibility" into eight‐decimal‐place
    float16 strings for each component.
    """
    new_frames = []
    for frame in frames:
        new_frame = []
        for kp_str in frame:
            parts = kp_str.split(',')
            parts_fp16 = [to_fp16_str(float(p)) for p in parts]
            new_frame.append(','.join(parts_fp16))
        new_frames.append(new_frame)
    return new_frames

def main():
    # Load the original JSON
    with open(r'D:\ML\Adiyog_Intern_JS\yoga_tracker_js\assets\Trikonasana_ideal_video_keypoints_main.json', 'r') as f:
        data = json.load(f)

    # Convert segments and frames
    data['segments'] = convert_segments(data.get('segments', []))
    data['frames']   = convert_frames(data.get('frames', []))

    # Write out the new JSON
    with open(r'D:\ML\Adiyog_Intern_JS\yoga_tracker_js\assets\Trikonasana_ideal_video_keypoints_main_fp16.json', 'w') as f:
        json.dump(data, f, indent=2)

    print("Done! Wrote FP16‐quantized data to output_fp16.json")

if __name__ == "__main__":
    main()
